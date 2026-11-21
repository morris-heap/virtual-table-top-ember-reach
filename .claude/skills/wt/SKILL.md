---
name: wt
description: Start work in a fresh git worktree on a VTTER-<n>-slug branch from origin/main. Takes a VTTER key, a Jira URL, or a description of the work; with no key, asks for one or a description and creates the Jira work item first. Use when the user types "wt" or "/wt", or asks to start work on a ticket in a worktree.
argument-hint: "[VTTER-<n> | description of the work]"
---

# /wt: create a worktree for a VTTER work item

The goal is an isolated checkout on a correctly named branch, tied to a Jira work item, that can
build and test straight away. Other Claude sessions often run in the main checkout at the same
time, so never switch branches or stash there. Do everything through the worktree.

Jira: site `morris-heap.atlassian.net` (use it as `cloudId`), project **VTTER**.
Issue types: Task, Story, Epic, Subtask.

## 1. Resolve the work item

Read `$ARGUMENTS`:

| Argument | Action |
|---|---|
| `VTTER-<n>`, or a Jira URL with that key | `getJiraIssue`. Use its summary for the slug. If it doesn't exist, stop and say so. |
| `KAN-<n>` | That's the old project key. Ask for the VTTER key, or offer to create a new item. |
| Free text | Treat it as the description of the work, and go to "Create the work item". |
| Nothing | Ask with `AskUserQuestion`: "Which work item is this for? Give a VTTER key, or describe the work and I'll create one." Then handle the answer as in the rows above. |

### Create the work item (no key given)

Using the description, call `createJiraIssue`:

- `projectKey`: `VTTER`, `issueType`: `Task`. Use `Story` only when the work is a user-facing feature
  described from a player's or GM's point of view, and `Subtask` only when the user names a parent.
- `summary`: a short imperative title ("Add portrait upload to the character sheet").
- `description`: the user's description, cleaned up, plus an *Acceptance criteria* list when the
  description implies one. Don't invent scope.
- `parent`: the epic when it's clear from the description. Find the current epics with
  `searchJiraIssuesUsingJql` (`project = VTTER AND issuetype = Epic AND statusCategory != Done`).
  As of 2026-11, these are VTTER-46 UI / UX (app and sheet work) and VTTER-51 Backend (api, infra, sign-in).
  If no epic fits, leave it unset. Don't guess.

Report the new key and link in one line. Don't ask for confirmation before creating it: running `/wt`
without a key is the request to create one.

### Move it to In Progress

If the item's status category is "To Do", find the "In Progress" transition (`discover` → `listJiraIssueTransitions`,
then `transitionJiraIssue`) and apply it. If the workflow has no such transition, skip this and say so.

## 2. Create the worktree

Make the branch name `VTTER-<n>-<slug>`. Build the slug from the summary: lowercase, 2 to 5 meaningful words,
kebab-case, ASCII only (for example `VTTER-55-portrait-upload`).

Run this from the repo in Bash. It works from the main checkout or from any existing worktree:

```bash
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)") &&
cd "$MAIN" &&
BRANCH="VTTER-<n>-<slug>" &&
git fetch origin main &&
git worktree add -b "$BRANCH" ".claude/worktrees/$BRANCH" origin/main &&
echo "$MAIN/.claude/worktrees/$BRANCH"
```

- Always branch from `origin/main`. The main checkout is usually parked on another ticket's branch.
- If the branch already exists (`fatal: a branch named ... already exists`), check `git worktree list`.
  If it's already checked out in a worktree, enter that one. Otherwise run
  `git worktree add ".claude/worktrees/$BRANCH" "$BRANCH"` (with no `-b`) to resume it.
  Never delete or reset an existing branch.

Then switch the session into it with `EnterWorktree(path="<printed path>")`.

**Windows / Vitest:** the path must start with an **uppercase** drive letter (`D:/…`). A lowercase `d:/…` makes
every Vitest file that imports a local module fail with "Cannot read properties of undefined (reading 'config')".
If `git rev-parse` gives back a lowercase drive letter, uppercase it before you pass it to `EnterWorktree`.

## 3. Bootstrap what a fresh checkout lacks

A worktree only holds tracked files. Restore what's missing:

1. **`.env`**: optional, and it holds only local Jira tooling values. Copy it only if it exists:
   `[ -f "$MAIN/.env" ] && cp "$MAIN/.env" "$WT/.env"`. Never print it. The app and API need no secrets.
   AWS access is the `ember-reach` CLI profile, which lives in `~/.aws` and works from any folder.
2. **Dependencies**: run `npm ci` in each package the work will touch: `app/`, `api/`, `infra/`.
   Each has its own `package-lock.json`. If you can't tell which ones yet, install all three.
   Run the installs in parallel Bash calls.

## 4. Verify and report

```bash
git status -sb            # on VTTER-<n>-<slug>, clean, tracking nothing yet
git log -1 --oneline      # matches origin/main
```

Report in a few lines: the work item (key, summary, link), the branch, the worktree path, and which packages
were installed. Then start the work if the user described it, or wait for them if not.

## Finishing up

Use `/cw` to finish. Before the merge it runs the checks, commits, pushes, opens the PR, moves the item
to In Review, and removes the worktree. After the merge it deletes the branch and moves the item to Done.
Commit only when the user asks. Untracked work in a worktree exists nowhere else.
