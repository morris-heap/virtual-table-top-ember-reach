---
name: jira
description: Take a VTTER work item from start to finish in one go. Chains /start-work (worktree) → /create-plan (plan) → implement → /create-tests (tests) → /security-check (security check) → /close-work (ship), invoking /change-rule when a game rule changes. Takes a VTTER key, a Jira URL, or a description of the work; with nothing at all it asks for an idea or a description and creates the Jira item first. Use when the user types "jira" or "/jira", with or without a key, or says "do VTTER-n end to end", "take this ticket all the way", "pick up VTTER-n and ship it", or asks to build something without naming a ticket.
argument-hint: "[VTTER-<n> | description of the work | nothing to be asked for an idea]"
---

# /jira: get a VTTER work item done, start to finish

The whole loop for one work item. `/jira` owns almost no mechanics itself — it sequences the skills
that do, and decides which of them a given ticket actually needs.

```
/start-work      worktree + Jira In Progress
/create-plan     plan, approved before code          (skip for small, well-specified work)
      implement  ──  /change-rule  when a game rule or number changes
/create-tests    tests
/security-check  security check                      (any api/, infra/ or auth change)
/close-work      commit, push, PR, Jira In Review
```

Each of those skills is the source of truth for its own step. Invoke it with the Skill tool and
follow what it says rather than repeating its steps here. **If one of them disagrees with anything
below, it wins.**

## 1. Start — `/start-work`

`Skill(skill: "start-work", args: "$ARGUMENTS")`, passing the arguments through untouched.

`/start-work` resolves or creates the work item, moves it to In Progress, creates the `VTTER-<n>-<slug>`
worktree from `origin/main`, and enters it.

**With no arguments at all**, `/start-work` asks the user for a VTTER key or a description of the
work, then creates the Jira item from the answer. That is the intended way to start something new:
`/jira` on its own is a valid call, not a mistake. Pass the empty arguments through and let it ask —
**never invent a work item, and never pick an unrelated open ticket to attach the work to.** Stop
there and wait for the answer; the run resumes once there's a key.

A free-text description works the same way, without the question: `/jira add portrait cropping`
creates the item and starts on it.

Carry the key, summary, acceptance criteria, branch and worktree path through the rest of the run.

## 2. Plan — `/create-plan`

`Skill(skill: "create-plan", args: "VTTER-<n>")`.

`/create-plan` reads the Jira item, the locked decisions, the rules files, the ADRs and the code; works out
the ripple; and puts the plan up through plan mode for approval.

**Run it** for a new screen, a new API route, a new item kind, a schema or infra change, a rule
change, or anything where you can't already name every file you'll touch. **Skip it** for small,
well-specified work — a copy fix, a one-file bug fix, a test gap — and instead say the plan in a few
lines before editing.

If `/create-plan` reports a conflict with a locked decision or with the app's scope lock, **stop there**. That
is the user's call, not a problem to design around.

## 3. Implement

Follow CLAUDE.md and the approved plan. The parts that bite most often:

- **Game numbers come from `/data/*.json`, never hard-coded.**
- **Original content only**, game terms capitalised and consistent, no synonyms.
- **App logic** goes in `app/src/engine/` as pure functions with an injectable RNG.
- **API:** owner id from the token `sub` and never the request; single-hero reads stay
  `ConsistentRead`; every new non-hero item kind gets a `kind`; Game reads go through the caller's
  member pointer; never return a `sub` or an S3 object key.
- **Infra:** a new DynamoDB or S3 call in `api/src/store.ts` or `api/src/portrait-store.ts` needs its
  action in `infra/lib/api-stack.ts`. Edit infra files **in place** — never rebuild one from a
  remembered copy. Don't rename CDK construct ids, and `cdk diff` before deploying.
- **Two built-in lists** for a new built-in adventure: `app/src/adventures/builtIn.ts` and
  `BUILT_IN_IDS` in `api/src/game.ts`.
- **Windows:** run Vitest from a path with an **uppercase** drive letter.

### If a game rule or number changes — `/change-rule`

`Skill(skill: "change-rule", args: "<the change>")`. Don't do it by hand. `/change-rule` gets the user's approval
first, then logs the dated `docs/decisions.md` entry, updates the rules file and its minor version,
updates `/data` to match, removes any settled *Open question*, and runs the ripple check.

**The user approves the rule itself**, separately from approving the plan. Never write a decisions
entry for a rule they haven't approved.

### When to stop and ask

A locked decision is in the way; the ticket needs an unapproved rule; the work turns out much larger
than the ticket describes; or an acceptance criterion is ambiguous enough that two readings give
different software. Otherwise make the routine calls yourself and keep going.

## 4. Tests — `/create-tests`

`Skill(skill: "create-tests", args: "VTTER-<n>")`.

Every rule gets a unit test, and `/create-tests` keeps each test in the right Vitest project (`.test.ts` in
Node, `.test.tsx` in jsdom), drives expected values from `/data`, and covers the authorization
invariants. Run it for any behaviour change. A docs- or rules-text-only change needs no new test.

## 5. Security check — `/security-check`

`Skill(skill: "security-check", args: "VTTER-<n>")`.

**Required** whenever the change touches `api/`, `infra/`, `auth`, portraits, Games or anything on a
response shape. Skip it only for a change that touches none of those — and say that you skipped it
and why.

A **Must fix** finding blocks shipping. Fix it and re-run `/security-check`, or report it and stop. Don't carry
one into `/close-work`.

## 6. Ship — `/close-work`

`Skill(skill: "close-work", args: "VTTER-<n>")`.

`/close-work` gathers everything read-only, runs the CLAUDE.md checks, does its own ripple check and
self-review, then **shows one plan and waits for the user's approval** before it commits, pushes,
opens the PR, comments in Jira, moves the item to In Review and removes the worktree.

Let it ask. Don't pre-approve its plan on the user's behalf, and don't do its steps by hand. Its
checks deliberately re-verify what `/create-tests`, `/security-check` and `/change-rule` already did — that independence is the
point, so a failure there is a real finding, not a duplicate.

**Never merge the PR.** Merging to `main` deploys the app to Cloudflare and the API to AWS, so that's
the user's call. `/jira` ends at In Review.

## 7. Report

A short summary: the work item and its new status, what changed and why, which skills in the chain
ran and which you skipped (with the reason), the checks that passed, the PR link, and anything left
out or still needing an answer. Close with one line on what the user needs to do — usually: review
and merge the PR, which deploys.

## Resuming, and after the merge

Running `/jira` again on the same key resumes: `/start-work` picks up the existing branch and worktree, so a
second run continues where the first stopped.

Once the user has merged, a second `/close-work` run tidies up — removes the worktree, deletes the local
branch, prunes, moves the Jira item to **Done**, and reports the deploy run.
