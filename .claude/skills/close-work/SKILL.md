---
name: close-work
description: Close out a VTTER work item. Runs the CLAUDE.md checks for the packages it touched, commits, rebases on origin/main, pushes, opens the PR, moves the Jira item to In Review, and removes the worktree. After the PR is merged, a second run tidies up and moves the item to Done. Use when the user types "close-work", "/close-work", "cw" or "/cw" (optionally with a VTTER key), or says "close out VTTER-n", "ship it", or "wrap this up".
argument-hint: "[VTTER-<n>]"
---

# /close-work: close out a VTTER work item

This is the counterpart to `/start-work`. It's the final check that the work is complete. After that, it
ships the work (commit, push, PR, Jira) and tidies the repo.

Pushing, opening a PR, commenting in Jira, and deleting a worktree all reach outside this machine or
can't be undone. So **gather everything first, show one plan, and act only after the user approves
it.** Running `/close-work` counts as asking for a commit and a PR, but not as approval of the plan.
**Never merge the PR.** Merging to `main` deploys the app to Cloudflare and the API to AWS, so the user
merges it.

Jira: `cloudId` is `morris-heap.atlassian.net`, and the project is **VTTER**.
Workflow: To Do / Backlog → In Progress → In Review → Done.

## 0. Locate the work

```bash
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git worktree list
```

- **Key.** Use the one in `$ARGUMENTS`. Otherwise take it from the current branch name (`VTTER-<n>-…`).
  If there's neither, ask.
- **Worktree.** Find the entry whose branch starts with `VTTER-<n>-`. Usually that's `$MAIN/.claude/worktrees/<branch>`.
  Set `WT` to it and `BRANCH` to its branch. Run every git command as `git -C "$WT" …`, because the shell's
  working directory can reset between calls, and shell variables reset too. Start each block by setting them again.
- **No worktree, but a `VTTER-<n>-*` branch is checked out in the main checkout.** Use `WT=$MAIN`.
  Skip removing the worktree, and at the end leave the main checkout where it is.
- **Work done directly on `main`, with no branch.** Other sessions may be using the main checkout,
  so don't switch it. Put "create branch `VTTER-<n>-<slug>` from `origin/main` and carry the changes over"
  in the plan, and ask before you do it.

Then check the PR: `gh pr list --head "$BRANCH" --state all --json number,state,url,title`.

| PR state | Mode |
|---|---|
| None, or open | **Ship**: steps 1 to 3 |
| Merged | **Tidy**: step 4 only |
| Closed, not merged | Stop and ask whether to reopen it, open a new one, or abandon the work |

## 1. Gather (read-only)

Nothing in this step writes anything.

**What changed.** Run `git -C "$WT" fetch origin main`, then
`git -C "$WT" diff --stat origin/main...HEAD` and `git -C "$WT" status -s`. Sort each uncommitted change:

- Belongs in the PR: anything made for this work item.
- Doesn't belong: unrelated edits, scratch files, `cdk.out/`, and `dist/`. List them and ask what to do.
  Never commit `.env`, `.claude/settings.local.json`, or anything holding a token or key.
  `git -C "$WT" check-ignore -v .env` must print a `.gitignore` line.

**Checks (CLAUDE.md).** Run these for every package the branch touches, from its folder in `$WT`.
Use parallel Bash calls, and make sure the path starts with an **uppercase** drive letter (see the Vitest note in CLAUDE.md).

| Changed | Run |
|---|---|
| `app/` or `data/` | `npm test`, `npm run lint`, `npm run build` |
| `api/` or `data/` | `npm test`, `npm run typecheck` |
| `infra/` | `npm run typecheck`, `npm run synth`, and `npm run diff` too if a stack changed (it needs `aws login --profile ember-reach`) |

If `node_modules` is missing, run `npm ci` first. A failing check blocks shipping: fix it, or report it
and stop. For `infra/lib/data-stack.ts` or `auth-stack.ts`, read the diff output, and stop if anything
says **replace** on the table or the user pool.

**Rules ripple check.** When `rules/`, `sheets/`, `data/`, or `docs/decisions.md` changed, check these
(CLAUDE.md › How we establish rules):

- A new or changed rule has a dated entry at the top of `docs/decisions.md`, in the same branch.
- The numbers agree across `rules/core-rules.md`, `rules/gm-guide.md`, `sheets/character-sheet.md`, `README.md`, and `data/*.json`.
  Grep for each number that changed.
- The rules file's version in its title went up by a minor step for a batch of rule changes, and the decision entry mentions it.
- A question that's now decided has been removed from *Open questions*.

Report every gap. Fix the mechanical ones (a number missed in one place). For a rule that was never
approved or logged, ask rather than writing the decision yourself.

**Self-review.** Read the full diff (`origin/main...HEAD` plus uncommitted changes) as a reviewer would. Look for:
leftover debug code, hard-coded game numbers that belong in `/data`, a new DynamoDB call in `api/src/store.ts`
with no matching IAM action in `infra/lib/api-stack.ts`, an owner id taken from the request instead of the token `sub`,
and renamed CDK construct ids. Fix what you find, then run the affected checks again.

**Rebase.** Run `git -C "$WT" rev-list --left-right --count origin/main...HEAD`. If the branch is behind,
plan a rebase onto `origin/main` after the commit. If it was pushed before, the rebase needs
`git push --force-with-lease`, so say so in the plan.

**Jira.** Run `getJiraIssue` on the key. Note its status and summary, and whether the description has
acceptance criteria. Check each criterion against the diff, and mark any that aren't met.

## 2. Show the plan and wait

Show it once, briefly:

```
VTTER-<n> <summary>                 Jira: In Progress → In Review
Branch   VTTER-<n>-<slug>  (2 commits ahead, 0 behind origin/main)
Checks   app: test ✓ lint ✓ build ✓ · api: n/a · infra: n/a
Ripple   ✓  (or the gaps)
AC       3/3 met  (or which aren't)
Commit   "VTTER-<n>: <imperative subject>"  — files: …
Leave out  <files and why>, or none
PR       new: "VTTER-<n>: <subject>" → main   (or: update #12)
Worktree remove after push  (the branch stays on GitHub; /start-work VTTER-<n> resumes it)
```

Then wait for approval. If anything failed (a check, the ripple check, an unmet criterion), say so at the top,
and don't offer to ship until it's fixed or the user explicitly accepts it.

## 3. Act (only after approval)

1. **Commit** the agreed files. Write the message in the imperative, as `VTTER-<n>: <subject>`. If rules changed,
   say which in the body (for example "Rebalance Hexer Grit to 8 + 3/level"). End with the attribution line from
   the system reminder. Use a heredoc for the message.
2. **Rebase** onto `origin/main` if it's behind. On a conflict, go to
   [§3a Resolving a rebase conflict](#3a-resolving-a-rebase-conflict). After rebasing, run the checks again.
3. **Push:** `git -C "$WT" push -u origin "$BRANCH"`. Use `--force-with-lease` only when the plan said to.
4. **PR.** If there's none yet, run `gh pr create --base main --head "$BRANCH" --title "VTTER-<n>: <subject>"` with a
   body that has these parts: *Summary* (what and why), *Rules changed* (or "none"), *Checks* (what ran and passed),
   a *Jira* link `https://morris-heap.atlassian.net/browse/VTTER-<n>`, and the PR attribution line.
   Mention that merging deploys. If a PR is already open, the push updates it. Only edit its body if the change makes it wrong.
5. **Jira.** Add a comment with the PR link and a one-line summary (`addOrEditJiraIssueComment`). Then move the item to
   **In Review** (`discover` → `listJiraIssueTransitions`, then `transitionJiraIssue`). Skip the move if it's already
   In Review or later.
6. **Remove the worktree** if the plan said to. First `ExitWorktree(action="keep")` if the session is inside it, then:
   ```bash
   git -C "$MAIN" worktree remove "$WT"     # refuses if anything is uncommitted, so leave that refusal in place
   ```
   Keep the local branch until the PR merges (tidy mode deletes it).

Report the commit, the PR link, the Jira status, and whether the worktree was removed.

## 3a. Resolving a rebase conflict

A conflict is **not** automatically a stop. Resolve the mechanical ones, stop on anything that needs
a human decision about which version is right. The division is what matters: a wrong resolution here
silently reverts someone else's work, and the checks will not catch it because the file is
self-consistent either way.

List what conflicted before touching anything:

```bash
git -C "$WT" diff --name-only --diff-filter=U
```

### Resolve these yourself

**Both sides appended to a list or log.** Keep both entries, in the file's own order:

- `docs/decisions.md` — both added a dated entry. Keep both, **newest first**. Never drop one: each
  records an approval that happened.
- `docs/adr/` — if both branches claimed the same ADR number, renumber **yours** to the next free one
  (check `origin/main`, not the local branch) and update every link to it.
- `README.md` / `*/README.md` tables and lists, `MEMORY.md` — keep both rows.
- *Open questions* in `rules/core-rules.md` — if one side removed a question and the other edited it,
  the removal wins: it was settled, and the decision entry says so.

**A lockfile** (`package-lock.json`). Never hand-merge it: the resolution has to come from
`package.json`, not from reconciling two generated files. Take `origin/main`'s copy as the base and
regenerate on top of it, so any dependency your branch added is re-applied:

```bash
git -C "$WT" checkout --ours -- <pkg>/package-lock.json
cd "$WT/<pkg>" && npm install --package-lock-only && npm ci
```

**During a rebase the sides are inverted** (verified): `--ours` is `origin/main`, the branch being
replayed **onto**, and `--theirs` is your own commit. This is the opposite of a merge, so reaching for
`--theirs` here would silently discard everything `main` gained. `npm ci` at the end proves the
regenerated lockfile still installs.

**An import block, or two functions added to the same file in different places.** Keep both sides.

### Stop and ask on these

- **Any game number** that both sides changed — in `data/*.json`, `rules/`, `sheets/` or a table in
  `README.md`. Which number is right is a rules decision, and it may be covered by a locked entry in
  `docs/decisions.md` that one of the branches predates.
- **The same rules sentence** rewritten on both sides.
- **`infra/lib/*.ts`** — anything where both sides touched a construct. Resolving this wrong can
  replace the table or the user pool. Edit infra files in place, and never reconstruct one from a
  remembered copy.
- **The same function body** changed on both sides, where keeping both is not possible.
- **Anything you cannot explain in one sentence.** If the resolution needs a guess about intent, it
  is not mechanical.

When you stop: `git -C "$WT" rebase --abort`, so the branch is exactly as it was. Then report which
files conflicted, what each side did, and what you would need to know to resolve it. Never resolve a
rules conflict by picking the side that makes the tests pass.

### After resolving

1. `git -C "$WT" add <resolved files>` and `git -C "$WT" rebase --continue`.
2. **Re-run every check for every package the branch touches** (§1). A conflict resolution is a code
   change that nothing has verified: a textually clean merge can still be semantically broken.
3. **Re-run the rules ripple check** (§1) if `rules/`, `sheets/`, `data/` or `docs/decisions.md` was
   among the conflicted files. This is where a bad resolution shows up — a number that now disagrees
   across files.
4. **Show what you resolved** and how, as part of the plan in §2 or as its own short report if the
   plan was already approved. Resolving a conflict is not covered by the earlier approval.
5. Push with `--force-with-lease` (a rebase rewrites history).

### Re-arming auto-merge

A conflict **disarms** GitHub's auto-merge. If the PR had it on, it must be turned back on after the
push, and only once the checks above pass:

```bash
gh pr merge <n> --auto --squash
```

**Only arm it when a check is still pending.** If CI has already gone green, `--auto` merges
immediately rather than queuing, which deploys — so that is the user's call, not a step to take
unasked. Say that the PR is ready and let them decide.

## 4. Tidy mode (PR already merged)

No plan is needed beyond one line, because nothing here can lose work: the branch is merged.

1. If the worktree still exists: `ExitWorktree(action="keep")` if you're inside it, then `git -C "$MAIN" worktree remove "$WT"`.
   If it refuses because of uncommitted changes, show them and ask. They exist nowhere else.
2. `git -C "$MAIN" branch -d "$BRANCH"`. A squash merge makes `-d` refuse. Then check that the PR is merged
   (`gh pr view --json state`), and only then use `-D`.
3. `git -C "$MAIN" fetch --prune origin`, and `git -C "$MAIN" worktree prune`.
4. Move the Jira item to **Done** if it isn't already, and add a comment with the merged PR link.
5. Mention the deploy: `gh run list --branch main --limit 3`. Report it if a run failed. Don't fix it here.
