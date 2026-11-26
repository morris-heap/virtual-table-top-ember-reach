---
name: create-tests
description: Write tests for a VTTER change. Puts each test in the right Vitest project (unit .test.ts in Node, component .test.tsx in jsdom), keeps engine logic pure with an injectable RNG, drives expected values from /data instead of hard-coding game numbers, and covers the API authorization invariants. Use when the user types "create-tests", "/create-tests", "ct" or "/ct", asks for tests or more coverage, or after implementing a rule, engine function, component or API route.
argument-hint: "[VTTER-<n> | path | what to test]"
---

# /create-tests: write the tests for a change

Two rules from CLAUDE.md decide most of the work here, and both are easy to get wrong in a way that
still looks like it passes:

1. **Every rule gets a unit test**, and game logic lives in `app/src/engine/` as **pure functions
   with an injectable RNG**. A test that can't control the dice isn't testing the rule.
2. **Tests split by environment.** `npm test` runs two Vitest projects: `unit` (`src/**/*.test.ts`,
   Node) and `component` (`src/**/*.test.tsx`, jsdom + Testing Library, set up in
   `src/test-setup.ts`). **Put a component test in a `.tsx` file or it runs without a DOM.** Keep
   pure logic in `.test.ts` so it stays in the fast Node project.

## 1. Decide what needs covering

From `$ARGUMENTS`, a Jira key, or the current diff:

```bash
git fetch -q origin main && git diff origin/main...HEAD --stat
```

Work from the **acceptance criteria** where there are any: each one should map to at least one test
whose name states the behaviour. Then add the cases the criteria don't mention — boundaries, and the
failure paths.

Read the existing tests next to the code before writing new ones. Match their style, helpers and
naming rather than introducing a second convention.

## 2. Pick the right file and project

| Testing | File | Project | Notes |
|---|---|---|---|
| Engine logic, a rule, a formula | `app/src/engine/<name>.test.ts` | unit (Node) | Pure, fast, no DOM |
| A React component or screen | `app/src/<Name>.test.tsx` | component (jsdom) | Testing Library; `src/test-setup.ts` already runs |
| API handler, store, auth | `api/src/<name>.test.ts` | api `npm test` | |
| A full signed-in journey | `app/e2e/<name>.spec.ts` | Playwright, **not** on PRs | Only when a unit or component test genuinely can't cover it |

A `.ts` file with JSX or `render()` in it is the single most common mistake: it runs in Node, with no
DOM, and the failure message doesn't point at the cause.

## 3. Game numbers come from `/data`, in tests too

An expected value typed as a literal is a second, divergent copy of the rules. When a rule's number
changes, that test keeps passing against the old number or fails for the wrong reason.

- Import the number from `/data/*.json` the same way the code does, and assert the **relationship**
  (a Hexer's max Grit equals `base + perLevel * (level - 1)` from `creation.json`).
- It's fine — and better — to also assert one concrete expected value for a known input, so a wrong
  formula can't satisfy a tautology. Derive it in the test from the data, or state the arithmetic in
  a comment showing where the number comes from (§3.5).
- A test that would still pass if the formula were deleted is not a test. Check that each one fails
  when you break the thing it covers.

## 4. Control the randomness

Every engine function takes an **injectable RNG**, so a Test, a Boon, a Bane and a d6 Wound Bane are
all deterministic in tests.

- Pass a stub that returns a fixed sequence, and assert the **degree of result** as well as the total:
  Strong success (beat the DC by 5+), success, success at a cost (miss by 1–3), failure, and the
  Natural 20 Triumph and Natural 1 Fumble edges.
- **Test the natural 1 and natural 20 explicitly.** They're separate rules, not just the ends of a
  range, and a modifier must not turn a natural 1 into a success.
- For Boons and Banes, cover the cancelling (one for one) and the die stepping up (d4 → d6 → d8).
- Assert the RNG was called the expected number of times where the rule says how many dice are
  rolled — a second hidden roll is a real bug this catches.

## 5. Cover the invariants, not just the happy path

For `api/` work, these are the tests that matter most, because the invariant is a security property:

- An `ownerId` taken from the **token**, not the request: a call with a forged owner id in the path
  or body must not reach another player's data.
- A Game read resolved through the **caller's member pointer**: a non-member gets a 404 or 403, not
  the Game.
- No `ownerId` in any response body — assert its **absence**, including on `GET /games/public` rows
  and the page cursor.
- A hero or portrait route rejects a caller who isn't the owner.
- A name clash returns **409**; a player ID of 5 and of 6 characters are both accepted and 7 is not.
- Validation rejects a value that isn't in `/data/character.json` or `core.json`.

For `app/` work: the warning-not-blocking behaviours. Past 5 **heroes** the party warning shows and
the action **stays enabled** — a test that asserts a disabled button would lock in the opposite of a
locked decision. Same for the creation guide: it warns and still saves.

## 6. Run them

```bash
cd app && npm test          # both projects
cd api && npm test
```

- `npm ci` first if `node_modules` is missing.
- **Windows:** run Vitest from a path starting with an **uppercase** drive letter (`C:\…`). A
  lowercase `c:\…` makes every test file that imports a local module fail with "Cannot read
  properties of undefined (reading 'config')" — that error means the path, not the test.
- Don't leave a `.only` or a skipped test behind.
- End-to-end tests run against the **deployed** app with `npm run e2e` and need the `ember-reach`
  profile. They're serial by design and write to the real table, so each must clean up what it
  creates. Don't add one where a component test would do.

## 7. Report

Say which files you added or changed, what each test covers, the counts from the run, and anything
you deliberately left uncovered and why. If a test revealed a bug in the implementation, say so
first — that's the most valuable thing the run produced.
