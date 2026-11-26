---
name: security-check
description: Security check a VTTER change before it ships. Audits the diff against this repo's real exposure points: the Cognito sub never leaving the API, owner ids never taken from the request, Game reads going through the member pointer, S3 keys and signed URLs, IAM actions matching the store calls, the private portraits bucket, secrets in the diff, and the gsi1 rows that carry a GM's sub. Use when the user types "security-check", "/security-check", "sc" or "/sc", asks for a security check or review, or before shipping anything touching api/, infra/ or auth.
argument-hint: "[VTTER-<n> | path | nothing for the current diff]"
---

# /security-check: security check a change

This is not a generic security scan. It's the list of ways **this** system can leak, derived from its
ADRs and its locked decisions. Work through the applicable sections against the diff and report
findings with file and line. Read the code — never conclude from a file name that a rule is followed.

Scope: `git diff origin/main...HEAD` plus uncommitted changes, or the path in `$ARGUMENTS`, or a
whole package if the user names one. Establish the diff first:

```bash
git fetch -q origin main && git diff origin/main...HEAD --stat && git status -s
```

## 1. Identity — the Cognito `sub` must never leave the API

The single most important invariant in this repo. The `sub` is the DynamoDB `ownerId`, and the
public identifier is the **player ID** (`EMBER-7K2Q9F`), never the `sub`.

- **An owner id must come from the verified token**, via `api/src/auth.ts`, and never from a path
  parameter, query string, header or body. Grep the diff for any `ownerId` that traces back to the
  request: `grep -rn "ownerId" api/src/` and follow each assignment to its source.
- **No response may carry `ownerId`.** Check every new or changed response shape. The dangerous
  pattern is a spread of a stored item or an index row — `{ ...item }` — which carries `ownerId`
  silently and keeps carrying it as attributes get added later.
- **`GET /games/public` is the one Game read with no membership check.** Its rows must be built
  **field by field**, never spread from a `gsi1` row: a GSI row carries `ownerId`, the GM's `sub`.
- **Its page cursor must hold only `updatedAt`.** A GSI `LastEvaluatedKey` would publish that `sub`.
  Any change to that cursor is a finding.
- **Player ID validation** accepts 5 or 6 characters from the 31-character alphabet (no `0 O 1 I L`),
  and nothing longer.

## 2. Authorization — every Game read through the caller's member pointer

- A Game read must resolve through the caller's own member pointer (`id: gm#<uuid>`), not by reading
  the Game item directly from the GM's partition. A direct read skips the membership check.
- A member's hero lives on **that member's own pointer**, so no one can set another player's hero.
  A write that sets a `heroId` on someone else's pointer is a finding.
- **Only a GM can invite or remove**; any player can leave; the GM can't leave, only delete.
- **Adventures are private to their owner.** The API accepts only the visibilities in
  `data/adventure.json` `liveVisibilities`. Reading an adventure through a Game is the only way a
  member sees it.
- **Public and listed are two separate opt-ins.** Public means "anyone with the link can join";
  listed means it also shows on `/games`. A private Game can never be listed. Code that sets
  `listed` from `public`, or defaults either to true, is a finding.
- Check that a new route verifies ownership at all. An authenticated route is not an authorized one.

## 3. Portraits and S3

- The bucket is **private** (stack `EmberreachData`) and reached only through signed URLs from
  `/characters/:id/portrait`, handed to the hero's **owner**.
- **Never return an object key**, and never make the bucket or an object public. A response carrying
  a key, a bucket name or an unsigned URL is a finding.
- A signed URL's expiry should be short, and the route must check the hero's owner before signing.
- An upload must constrain content type and size, and must not take the key from the request.

## 4. IAM — least privilege, matching the code

- Every DynamoDB and S3 action used by `api/src/store.ts` and `api/src/portrait-store.ts` needs its
  grant in `infra/lib/api-stack.ts`, and **nothing more**. A new call with no grant fails at runtime;
  a grant with no call is standing excess permission.
- A `Query` on `gsi1` needs the index ARN granted, not just the table.
- No wildcard resource or action where a specific one works. No `dynamodb:*`, no `s3:*`.
- The function uses its **role**. There are no AWS keys in `.env`, GitHub or code — confirm the diff
  adds none. CI uses GitHub OIDC (role `emberreach-github-deploy`).

## 5. Data-layer safety

- **`ConsistentRead` stays** on single-hero reads: a read right after a save or delete must be fresh.
  Removing it is a correctness and authorization risk (a stale read can show a deleted hero).
- **Every non-hero item kind needs a `kind`** attribute, because the hero list filters on it. A new
  kind without one leaks into hero lists.
- A conditional write guards anything claimed once — player IDs, Game-name reservations. Check the
  condition expression actually prevents the double-claim.
- **Don't widen the `gsi1` projection**, and don't rename its keys.
- Allowed values come from `/data/character.json` and `/data/core.json` — validate input against them
  rather than trusting the client.

## 6. Secrets and config in the diff

```bash
git diff origin/main...HEAD | grep -niE '(aws_|secret|password|token|api[_-]?key|private[_-]?key|bearer|-----BEGIN)'
git check-ignore -v .env .claude/settings.local.json
```

- `.env` and `.claude/settings.local.json` must be ignored and must not appear in the diff.
- No hard-coded credential, bucket name, user pool id or client secret. **The Cognito app client is
  public and has no secret** — a secret appearing for it is a misconfiguration.
- No real player data, Cognito `sub` or email in tests, fixtures or logs. The user's email is private.
- Check logging: a `console.log` of a whole request, item or token leaks the `sub` into CloudWatch.

## 7. App side

- `app/src/api/client.ts` **never sends a user id** — the API derives it from the token.
- No token in `localStorage` where the project's existing pattern avoids it; follow ADR 0004.
- `/` must stay Home: it's the Cognito redirect. A route change that moves it breaks sign-in.
- No secret in client code or in `app/src/**` — anything in the bundle is public.
- Check any new `dangerouslySetInnerHTML`, `eval`, or injection of adventure or hero text into HTML.
  Adventure and hero text is **user-authored content** and must be treated as data.

## 8. Infra replacement risks

Not confidentiality, but irreversible, so it belongs in the same gate:

- **Don't rename CDK construct ids** in `infra/lib/data-stack.ts` (replaces the table) or
  `auth-stack.ts` (replaces the user pool — deletes every account).
- Run `npm run diff` in `infra/` and **stop if it says replace** on the table or the user pool.
- Edit infra files **in place**. Never rebuild one from a remembered copy — that has silently deleted
  a bucket here before.

## Report

Group findings by severity and give file and line for each:

```
Security check — VTTER-<n>  (<n> files)

Must fix     <leaks the sub, missing authz, secret in diff, replacement in cdk diff>
Should fix   <excess IAM, missing validation, logging a whole item>
Note         <defence in depth, pre-existing>
Clean        <the invariants you checked and confirmed, named>
```

Name what you **confirmed**, not just what failed — "every Game read goes through the member pointer:
checked, 3 call sites" is the useful half of the report. If nothing applies to the diff (a rules-text
or docs-only change), say that in one line and stop; don't manufacture findings.

A **Must fix** blocks shipping. Fix it, or report it and stop — don't carry it into `/close-work`.
