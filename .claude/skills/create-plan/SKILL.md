---
name: create-plan
description: Create a plan for a VTTER work item before writing code. Reads the Jira item, the locked decisions, the rules and the code, finds the conflicts and the ripple, then gives the user a plan to approve. Use when the user types "create-plan", "/create-plan", "cpl" or "/cpl" (optionally with a VTTER key or a description), says "plan this", "make a plan for VTTER-n", or asks what it would take to build something.
argument-hint: "[VTTER-<n> | description of the work]"
model: sonnet
---

# /create-plan: plan a VTTER work item

A plan answers four questions, in order: **what does done look like**, **what does the repo already decide**,
**what does the change ripple into**, and **what is genuinely uncertain, and whose call is it**. Most of the value is
in the second and third: rules live in Markdown and numbers in `/data`, so a change that looks like one file is
usually five. This skill only reads and plans. `/start-work` makes the worktree and `/close-work` ships.

## 1. Scope

| `$ARGUMENTS` | Action |
|---|---|
| `VTTER-<n>` or a Jira URL | `getJiraIssue`. That item is the scope. |
| Free text | Plan that description. Don't create a Jira item. |
| Nothing | Take the key from the branch name (`VTTER-<n>-…`), else ask. |

Pull out the summary, the **acceptance criteria verbatim**, any comment that changes scope, and the parent epic. With
no criteria, write the ones you plan against and say you are inferring them.

## 2. What the repo already decides

`docs/decisions.md` and CLAUDE.md are already in context, so **don't re-read them**. Read only what the area needs:

- **Decisions:** find the index row for the area, and open that file in `docs/decisions/` only if the row touches the
  work. A locked decision **outranks the ticket**: if the work would contradict one, that is a finding. Name the entry
  and what the ticket would have to change.
- **Scope lock** (in the index): no dynamic lighting, 3D terrain, scripting language, system builder, marketplace or
  built-in video or voice. If the ticket asks for one, stop and raise it.
- **Rules, ADRs, `/data`:** Grep for the section or number the change uses, then read just that part of
  `rules/core-rules.md`, `rules/gm-guide.md`, `sheets/character-sheet.md`, the ADR for the area in `docs/adr/`,
  and `data/*.json`. If the plan departs from an ADR, say so and plan a new one, numbered from `origin/main`.
- **Code:** Grep for the existing shape before assuming it. Don't spawn an agent for this.

## 3. Ripple

Name every file touched and why. The pairs that get missed:

| If the change touches | It also touches |
|---|---|
| A game number or formula | `rules/*.md` **and** `/data/*.json`, plus the sheet and `README.md` wherever it appears |
| A rule, not just a number | A decisions file and index row, the rules file's minor version, any settled *Open question* |
| A new DynamoDB or S3 call in `api/src/*store.ts` | Its IAM action in `infra/lib/api-stack.ts` |
| A new item kind | Its `<kind>#<id>` key and `kind` attribute, and `gsi1pk`/`gsi1sk` only if it lists across partitions |
| A new built-in adventure | `app/src/adventures/builtIn.ts` **and** `BUILT_IN_IDS` in `api/src/game.ts` |
| A new API route | `app/src/api/client.ts`, and `app/src/router.ts` if a screen comes with it |
| Engine logic | A unit test (`.test.ts`); component behaviour needs `.test.tsx` |
| `infra/lib/data-stack.ts` or `auth-stack.ts` | A `cdk diff` in the plan, and stop if it says **replace** |

Grep each number or name that changes across `rules/ sheets/ data/ README.md app/ api/`.

## 4. Size it

State the packages touched (so which checks `/close-work` runs), the order of work (usually `/data` and rules, then
`api/`, then `app/`), and what could go wrong: a table or user-pool replacement, a live-data migration, two files that
disagree on a number. For each open question, say the default you would take. Only a load-bearing choice (two readings
give different software, or a locked decision is in play) goes to `AskUserQuestion`, at most two.

## 5. Present the plan

Small, well-specified work: give the plan in a few lines in chat. Use `EnterPlanMode` and `ExitPlanMode` only for a
new screen, API route or item kind, a schema or infra change, or a rule change. Use this shape:

```
VTTER-<n> <summary>
Done when / Decided already (§refs) / Conflicts or "none" / Change (file: why) / Ripple
Rule change (yes needs the user's approval, a decisions file and a version bump | no)
Tests / Checks / Assumptions / Needs your call or "none"
```

Approving the plan is **not** approving a rule. A rule change goes to `/change-rule` before any code.

## 6. Hand off

Next is `/start-work VTTER-<n>` if there is no worktree, `/change-rule` for a rule change, or implement. After that run
`/create-tests`, `/security-check` if `api/`, `infra/` or auth changed, then `/close-work`. The acceptance criteria and
ripple list are what `/close-work` checks the diff against.
