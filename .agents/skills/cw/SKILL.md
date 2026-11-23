---
name: cw
description: Close out a VTTER work item with required checks, review, commit, rebase, push, PR, Jira updates, and worktree cleanup; tidy merged work afterward. Use for $cw, cw, /cw, close out VTTER-n, ship it, or wrap this up.
---

# Close out a VTTER work item

Read the shared [repository instructions](../../../AGENTS.md) and the complete
[closeout workflow](../../../.claude/skills/cw/SKILL.md). Follow its Ship and Tidy
modes with the Codex adaptations below. Keep the linked workflow as the shared
procedure rather than maintaining a second copy of its checks and Jira process.

## Codex adaptations

- Treat text following `$cw`, `cw`, or `/cw` as the arguments instead of expecting
  `$ARGUMENTS` expansion. Infer the ticket from the current branch when omitted,
  and ask only if it cannot be resolved.
- Discover the available Jira tools and honor their actual schemas. Resolve
  `morris-heap.atlassian.net` to the cloud ID when required. Discover transition IDs
  when the connector requires them. Preserve acceptance-criteria review, PR-link
  comments, and the In Review / Done transitions. Report unavailable integrations
  as blocked steps; never claim a Jira update that did not succeed.
- Use the active shell's syntax, explicit absolute working directories, and
  `git -C` on every Git operation. In PowerShell, derive the main checkout using
  `git rev-parse --path-format=absolute --git-common-dir` and `Split-Path -Parent`.
  Use task-specific variable names and check `$LASTEXITCODE` after commands.
  Keep Windows drive letters uppercase for Vitest. Locate the actual worktree from
  Git's inventory, regardless of which agent created it.
- The source's gather phase authorizes fetches, dependency installation, checks,
  and mechanical fixes; it is preparation, not literally read-only. Complete this
  work before presenting the concrete shipping plan. Honor the current
  `AGENTS.md` checks, including API tests/typecheck and infra typecheck/synth before
  committing API or infra changes. Run independent checks concurrently where safe.
- Preserve the source's approval checkpoint. If approval is still needed, link the
  [source requirement](../../../.claude/skills/cw/SKILL.md), quote “show one plan,
  and act only after the user approves it,” and explain that this is why you are
  asking. Do not ask again for actions already approved in the conversation.
  Never merge the PR.
- Use a structured tool argument for multiline PR descriptions and Jira comments.
  With `gh`, write the exact PR body to a temporary UTF-8 file and use `--body-file`.
  For a multiline Git commit message, use a temporary file and `git commit -F`.
  Do not assume Bash heredocs work in PowerShell. Include attribution only if the
  current environment requires it; do not invent a Claude system-reminder footer.
- Codex has no Claude `ExitWorktree` tool. Before removal, verify the absolute
  target against `git worktree list`, check for uncommitted and untracked work,
  and ensure the session is no longer attached to it. If moving the session needs
  a workspace-switch tool, follow that tool's confirmation and end-of-turn rules;
  resume cleanup after the handoff. Otherwise leave the worktree and report cleanup
  as pending until the user opens another checkout. Never force worktree removal.
- In Tidy mode, a merged PR does not prove the local branch has no extra commits.
  Before the source's squash-merge `branch -D` fallback, fetch and confirm the local
  tip matches the merged PR's head commit and no local work would be lost. Stop if
  that cannot be established. Retain the source's protection for dirty worktrees.
- Report the commit, PR link, actual Jira status, and cleanup outcome. In Tidy mode,
  also report the deployment check without starting unrelated deployment repairs.

Use [$wt](../wt/SKILL.md) to start or resume ticket work.
