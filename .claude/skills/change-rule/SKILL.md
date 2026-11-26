---
name: change-rule
description: Change an Emberreach game rule properly. Gets the user's approval, logs a dated entry in docs/decisions.md, updates the rules file and its version, updates /data to match, removes any settled open question, and runs the ripple check so every number agrees everywhere. Use when the user types "change-rule", "/change-rule", "rule" or "/rule", approves a rule or balance change, settles an open question, or asks to change a game number (Grit, DCs, Momentum, damage, costs).
argument-hint: "[the rule or number to change]"
---

# /change-rule: change a game rule, all the way through

A rule change in this repo is never one file. The rules text, the decisions log, the machine-readable
numbers in `/data`, the character sheet, the GM guide and the README all have to agree, and the app
and API read `/data` at runtime. This skill is the CLAUDE.md "How we establish rules" workflow, done
in order and with nothing skipped.

**The user approves the rule before anything is written.** A proposal is not a decision. Never write
a `docs/decisions.md` entry for a rule the user hasn't explicitly approved — that log is the record
of what's locked, and a speculative entry corrupts it for every future session.

## 1. Pin down the change, and show the math

State the rule as it is now and as it would be, with the section reference. Then, for any balance or
number change, **show the expected numbers** — CLAUDE.md requires it:

- Hit chance at level 1 against a typical Defense, before and after.
- Rounds to go Down, for the Calling affected, before and after.
- Momentum generated per round for a party of four, if Momentum is in play.
- How often the die lands in each band, for a Boon/Bane change.

A change argued without numbers gets approved on vibes and gets reverted two sessions later.

Check it against what's already locked:

- **`docs/decisions.md`** — if an entry already decides this, say which, and treat the change as
  reopening a locked decision. That needs the user's explicit agreement to overturn it.
- **The v0.1 foundation entry** — the nine items there are the game's identity (core roll, degrees of
  result, Boons/Banes, players roll all dice, Grit + Wounds, side-based turns, shared pools, flat
  attributes, original IP). Changing one of those is a much bigger conversation than a number tweak;
  flag it as such.
- **The design pillars** in README.md — players roll all dice and the GM never rolls in combat, fail
  forward, one core roll, tactical but not fiddly.
- **Open questions** at the end of `rules/core-rules.md` — if this settles one, note which.

## 2. Get approval

Put the change, the math and the consequences to the user in a few lines and wait. Use
`AskUserQuestion` when there are two or three concrete options worth choosing between (for example a
Grit formula of `8 + 3/level` versus `7 + 4/level`), with the expected numbers for each.

Nothing below happens until the user says yes.

## 3. Write it, in this order

**a. The decisions entry.** Newest at the **top** of `docs/decisions.md`, under the `---`, in the
established format:

```
### YYYY-MM-DD — Title (VTTER-<n>)

**Decision:** <numbered list of what is now true>

**Why:** <the reasoning, including the math that settled it>

**Affects:** <every file changed>
```

Use today's date. Number the decision points when there's more than one. Say which version the rules
move to, or say explicitly that the rules stay at their current version when the change isn't a game
rule (infrastructure and product decisions say "the rules stay at **v0.2**").

**b. The rules file.** Update the section, keeping the text short, imperative and addressed to the
player as "you". Keep the game terms capitalised — Test, Boon, Bane, Grit, Wound, Ember, Momentum,
Dread, Calling, Strong success — and introduce no synonyms.

**c. The version.** Bump the **minor** version in the rules file's title (`# Emberreach — Core Rules
(v0.2)`) for a batch of rule changes, and bump the GM guide's title too if its numbers moved. The
decision entry has to mention the new version. Both files are at **v0.2** as of 2026-11-25.

**d. `/data/*.json`.** The app and API read these, never the Markdown, so a number that changes in
`rules/` and not in `/data` ships a game that doesn't match its own rules. The files are `core.json`,
`character.json`, `creation.json`, `adventure.json`, `game.json` and `data/adventures/*.json`.

**e. Open questions.** Remove any question this settles from the list at the end of
`rules/core-rules.md`. A decided question left in the list gets re-answered differently later.

## 4. Ripple check — make every number agree

For **each** number, name or formula that changed, grep the whole repo and fix every occurrence:

```bash
grep -rn "<the old number or term>" rules/ sheets/ data/ README.md app/src/ api/src/ docs/
```

The places that hold game numbers:

| File | Holds |
|---|---|
| `rules/core-rules.md` | The rule itself, and the derived-number formulas in §3.5 |
| `rules/gm-guide.md` | Foe stat blocks, encounter budgets, number tables |
| `sheets/character-sheet.md` | The sheet template — must match the rules |
| `README.md` | The pitch and any headline numbers |
| `data/*.json` | Everything the code reads |
| `app/src/engine/` | The formulas, which must read from `/data` and never hard-code |

Then check the code: a game number hard-coded in `app/` or `api/` is a bug regardless of this change,
so move it to `/data` while you're there.

## 5. Test and check

- Every rule gets a unit test in `app/src/engine/` as a pure function with an injectable RNG. Update
  the tests for the changed numbers, and add one for the new behaviour.
- Run the checks for the packages touched: `app/` needs `npm test`, `npm run lint`, `npm run build`;
  `api/` needs `npm test`, `npm run typecheck`. A `/data` change touches both.
- On Windows, run Vitest from a path starting with an **uppercase** drive letter.

## 6. Report

Say what changed, in one short block: the rule before and after, the new rules version, the files
updated, the numbers the ripple check moved, and the tests that now cover it. Then `/close-work` ships it —
its own ripple check will verify this work independently, which is the point.

## When the rule isn't approved

If the user hasn't decided yet, don't write anything to `docs/decisions.md` or the rules files. Add
the question to **Open questions** at the end of `rules/core-rules.md` instead, phrased as a question
with the options and the math. That's the holding place for an undecided rule, and `/change-rule` picks it
up from there once the user settles it.
