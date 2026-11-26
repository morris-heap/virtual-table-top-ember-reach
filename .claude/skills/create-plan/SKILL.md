---
name: create-plan
description: Create a plan for a VTTER work item before writing code. Reads the Jira item, the locked decisions, the rules files and the code, finds the conflicts and the ripple, then puts an approved plan in front of the user via plan mode. Use when the user types "create-plan", "/create-plan", "cpl" or "/cpl" (optionally with a VTTER key or a description), says "plan this", "make a plan for VTTER-n", or asks what it would take to build something.
argument-hint: "[VTTER-<n> | description of the work]"
---

# /create-plan: create a plan for a VTTER work item

A plan here is not a task list. It's the answer to four questions, asked in this order:

1. **What does done look like?** (the acceptance criteria, read literally)
2. **What does this repo already decide for me?** (locked decisions, rules files, ADRs)
3. **What does the change ripple into?** (rules ↔ `/data` ↔ sheet ↔ README, API ↔ IAM, app ↔ API)
4. **What's genuinely uncertain, and whose call is it?**

Most of the value is in 2 and 3. This repo keeps its rules in Markdown and its numbers in `/data`,
so a change that looks like one file is usually five. Finding that **before** writing code is the
whole point of this skill.

`/create-plan` only reads and plans. It writes no code and touches no branch — `/start-work` makes the worktree and
`/close-work` ships. Run it inside a worktree or in the main checkout; either is fine, because it changes
nothing.

## 1. Resolve what's being planned

Read `$ARGUMENTS`:

| Argument | Action |
|---|---|
| `VTTER-<n>`, or a Jira URL | `getJiraIssue`. That item is the scope. |
| Free text | Plan that description. Don't create a Jira item — `/start-work` does that. |
| Nothing | Take the key from the current branch (`VTTER-<n>-…`). If there's none, ask what to plan. |

From the item, pull out: the summary, the description, the **acceptance criteria** verbatim, any
comments that change the scope, and the parent epic. If there are no acceptance criteria, write the
ones you're planning against and show them to the user as an assumption — don't invent scope, and
say plainly that you're inferring.

## 2. Read what the repo has already decided

In this order. Don't skip ahead to the code.

- **`docs/decisions.md`** — always loaded. Find every entry that touches this area. A locked decision
  **outranks the ticket**: if the work as written would contradict one, that's a finding for the plan,
  not something to quietly design around. Say which entry, and what the ticket would have to change.
- **The rules files** — `rules/core-rules.md`, `rules/gm-guide.md`, `sheets/character-sheet.md`.
  These are the source of truth for the code, so the plan says which section the behaviour comes from.
- **`docs/adr/`** — the ADR for the area (app stack 0001, backend 0003, auth 0004, profile and
  adventures 0005, Games 0006, dice tray 0007, public Games and names 0008). An ADR is a dated
  record: if the plan departs from one, the plan says so and a new ADR is part of the work.
  Pick a new ADR number from `origin/main`, not from the local branch.
- **`/data/*.json`** — the numbers the app and API actually read.
- **CLAUDE.md** — the scope lock in particular. The app deeply automates Emberreach's own rules and
  is **not** a general VTT: no dynamic lighting or per-token vision, no 3D terrain, no user scripting
  language, no system builder for other RPGs, no content marketplace, no built-in video or voice.
  If the ticket asks for one of those, stop and raise it before planning further.

Then read the code the change lands in. Search for the existing shape rather than assuming it; use
the `Explore` agent when the answer means sweeping many files and you only need the conclusion.

## 3. Work out the ripple

Name every file the change touches, and why. The pairs that get missed:

| If the change touches | It also touches |
|---|---|
| A game number or formula | `rules/*.md` **and** `/data/*.json`, plus `sheets/character-sheet.md` and `README.md` wherever that number appears |
| A rule (not just a number) | A dated entry at the top of `docs/decisions.md`, the rules file's minor version in its title, and any now-settled *Open question* |
| A new DynamoDB or S3 call in `api/src/store.ts` or `api/src/portrait-store.ts` | Its IAM action in `infra/lib/api-stack.ts` |
| A new item kind in the table | Its `kind` attribute, and `gsi1pk`/`gsi1sk` only if it needs cross-partition listing |
| A new built-in adventure | `app/src/adventures/builtIn.ts` **and** `BUILT_IN_IDS` in `api/src/game.ts` |
| A new API route | `app/src/api/client.ts`, and the route table in `app/src/router.ts` if a screen comes with it |
| Engine logic | A unit test in `.test.ts`; component behaviour in `.test.tsx` |
| `infra/lib/data-stack.ts` or `auth-stack.ts` | A `cdk diff` in the plan, and a stop if it says **replace** |

Grep for each number or name that changes, across `rules/`, `sheets/`, `data/`, `README.md`, `app/`
and `api/`. A number that disagrees in one place is a bug the ripple check in `/close-work` will catch later
and more expensively.

## 4. Size it, and find the real uncertainty

- **Which packages** (`app/`, `api/`, `infra/`, `data/`, `rules/`) and so which checks `/close-work` will run.
- **Order of work**, where one step has to land before another can be tested — usually `/data` and the
  rules first, then `api/`, then `app/`.
- **What could go wrong**, specifically: a table or user pool replacement, a Cognito callback URL, a
  migration of live items, a number that two files disagree on.
- **The open questions.** For each one, say what you'd do by default. A question with an obvious
  default is an assumption to state, not a question to ask. Only genuinely load-bearing choices —
  where two readings give different software, or where a locked decision is in play — go to
  `AskUserQuestion`, and at most a couple of them.

## 5. Put the plan up for approval

Use `EnterPlanMode`, then `ExitPlanMode` with the plan. Structure it:

```
VTTER-<n> <summary>

Done when        <the acceptance criteria, as checkable statements>
Decided already  <locked decisions / ADRs / rules sections this follows, with §refs>
Conflicts        <anything contradicting a locked decision or the scope lock, or "none">
Change           <file by file: what changes and why>
Ripple           <the other files the numbers or names land in>
Rule change      <yes: needs the user's approval + a decisions.md entry + a version bump | no>
Tests            <what proves each criterion>
Checks           <the package checks this will need to pass>
Assumptions      <the defaults taken on the small open questions>
Needs your call  <the one or two real questions, or "none">
```

If a rule change is involved, the plan must say so loudly: the user approves the **rule** before any
code gets written, and the approval of the plan is not approval of the rule.

For small, well-specified work, skip plan mode and say the plan in a few lines instead. Plan mode
earns its cost on a new screen, a new API route, a new item kind, a schema or infra change, or a
rule change.

## 6. Hand off

Once the plan is approved, say which of these comes next and let the user pick if it's unclear:

- No worktree yet → `/start-work VTTER-<n>`, then implement.
- A rule change → `/change-rule`, which gets the rule itself approved before any code is written.
- Already in the worktree → implement, then `/create-tests` for tests, `/security-check` if it touches `api/`, `infra/` or
  auth, and `/close-work` to ship.

Carry the approved plan forward: the acceptance criteria and the ripple list are what `/close-work` checks
the diff against.
