---
name: wt
description: Start or resume a VTTER ticket in an isolated Git worktree, create the Jira item when given a work description, and install needed dependencies. Use for $wt, wt, /wt, or a request to start ticket work in a worktree.
---

# Start a VTTER work item

Read the shared [repository instructions](../../../AGENTS.md) and the complete
[worktree workflow](../../../.claude/skills/wt/SKILL.md). Follow that workflow with
the Codex adaptations below. The linked workflow remains the shared procedure;
its Claude-specific frontmatter does not select a Codex model.

## Codex adaptations

- Treat the text following `$wt`, `wt`, or `/wt` as the arguments; Codex does not
  expand `$ARGUMENTS`. Ask for a ticket or description only when neither is supplied.
  Use an available user-input tool or a plain question instead of `AskUserQuestion`.
- Discover the available Jira tools and use their actual schemas. Resolve the site
  `morris-heap.atlassian.net` to a cloud ID if the connector requires one. Do not assume
  Claude tool names or transition arguments exist in Codex. Preserve the source's
  issue creation, epic selection, and In Progress behavior. If Jira is unavailable,
  report the blocked step rather than inventing a ticket or claiming success.
- Other agents may be using the main checkout. Never switch its branch or stash its
  changes. Reuse existing worktrees based on `git worktree list`, including those
  created by Claude. Keep the existing ignored `.claude/worktrees/<branch>` location
  for newly created worktrees so both workflows can find them.
- Use the active shell's syntax. The source's Bash block is an example, not a
  requirement to use Bash on Windows. In PowerShell, obtain the common Git directory
  with `git rev-parse --path-format=absolute --git-common-dir`, derive its parent
  with `Split-Path -Parent`, and use task-specific variables such as `$repoRoot`,
  `$ticketBranch`, and `$ticketWorktree`. Check `$LASTEXITCODE` after each Git command;
  stop on failure before copying files or installing dependencies.
- Preserve the sequence: fetch `origin/main`; create the ticket branch and worktree
  from it, or resume the existing branch without resetting it; optionally copy the
  main checkout's `.env` with `Copy-Item -LiteralPath` only for a newly created
  worktree; then verify status and the latest commit. Never print, overwrite an
  existing worktree's, or commit `.env`. Check that it is ignored in the destination.
- Normalize a Windows drive letter to uppercase before running package commands.
  Use explicit absolute `workdir` values and `git -C` paths on every call; do not
  rely on a previous shell call's variables or working directory.
- Codex has no Claude `EnterWorktree` tool. If a workspace-switch tool is available,
  follow its confirmation and end-of-turn requirements when attaching the exact
  worktree already created (without creating another isolated worktree). Finish
  setup and report its result before that handoff. Otherwise continue with explicit
  working directories, or ask the user to open the worktree if editing tools are
  restricted to the current workspace. Never bypass sandbox permissions.
- Install dependencies only for the affected packages, as the source specifies.
  Independent installations may run concurrently; no subagents are required.
- Report the ticket link, branch, worktree path, and installed packages, then begin
  the requested work. Use [$cw](../cw/SKILL.md) for closeout.
