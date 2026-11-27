---
name: fix-conflicts
description: Fix merge conflicts on a pull request. Rebases the PR branch onto origin/main in a separate worktree (never the main checkout), resolves conflicts keeping both sides' intent, runs the CLAUDE.md checks, and pushes with --force-with-lease. Use when the user types "fix-conflicts", "/fix-conflicts" or "fc", pastes a PR URL and says "fix merge conflicts", or a PR shows CONFLICTING or DIRTY.
argument-hint: "[PR number or URL]"
---

# /fix-conflicts: resolve a pull request's merge conflicts

Pushing a rebased branch rewrites a remote branch, so confirm the PR with the user if the argument is unclear.

## Steps

1. **Find the PR.** `gh pr view <n> --json headRefName,baseRefName,state,mergeable,mergeStateStatus`.
   Stop if it isn't open. If `mergeable` is `MERGEABLE`, say so and stop.
2. **Check for existing work first.** Run `git worktree list` and `git fetch`. Another session may already
   have rebased this branch (look for a worktree on it, or one whose HEAD contains `origin/main`). Reuse it
   instead of repeating the work, and compare it with the remote branch. This user runs parallel sessions.
3. **Never touch the main checkout.** It may hold uncommitted work. Use a worktree:
   `git worktree add .claude/worktrees/fc-<n> -b fc-<n> origin/<headRefName>`.
4. **Rebase:** `git rebase origin/main`. For each conflict, read both sides and keep the intent of both.
   These files conflict most:
   - `docs/decisions.md`: keep every entry, newest first, no duplicates.
   - `CLAUDE.md` / `AGENTS.md`: keep both sides' rules and links.
   - `data/*.json`, `api/src/store.ts`, `infra/lib/*.ts`: merge both additions. Don't drop a field,
     IAM action or `BUILT_IN_IDS` entry.
   Never take a whole side with `--ours` / `--theirs` without reading the diff.
5. **Check no markers remain:** search for `^<<<<<<<` and `^>>>>>>>` outside `node_modules` and `.git`.
6. **Run the CLAUDE.md checks for the packages the PR touches.** Use a PowerShell path that starts with an
   uppercase drive letter (`D:\...`) for Vitest, or every test file fails. If `npm ci` fails with ENOTEMPTY,
   delete `node_modules` and retry.
   - `app/`: `npm test`, `npm run lint`, `npm run build`
   - `api/`: `npm test`, `npm run typecheck`
   - `infra/`: `npm run typecheck`, `npm run synth`
7. **Push:** `git push --force-with-lease origin fc-<n>:<headRefName>`. Never plain `--force`.
8. **Confirm:** wait a few seconds, then `gh pr view <n> --json mergeable,mergeStateStatus`. `UNSTABLE` means
   CI is still running, which is fine.
9. **Tidy up** the worktree with `git worktree remove` once the push is confirmed, and report what conflicted
   and how it was resolved.
