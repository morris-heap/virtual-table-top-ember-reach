# AGENTS.md — instructions for AI coding agents

This file is the **single source of agent instructions** for this repo.
Codex reads `AGENTS.md` directly. Claude Code reads `CLAUDE.md`, which imports this file.
**Put every rule here, not in CLAUDE.md**, so both agents always stay in sync.

## Project

**Emberreach** (working title) is an original fantasy tabletop RPG in the classic dungeon-crawl
structure: a GM, 3–5 players, d20 Tests, ancestries, callings (classes), and levels 1–10.
The repo holds the game design (Markdown), a companion web app (`/app`, GitHub Pages) and its API
(`/api`, a Cloudflare Worker on Optilogic Postgres). The rules files stay the source of truth for the code.

## Read before changing anything

The game's established rules live in these files. **They are the source of truth.** Read the
relevant ones before answering design questions or making edits:

| File | Contains |
|---|---|
| [README.md](README.md) | Pitch, design pillars, roadmap |
| [docs/decisions.md](docs/decisions.md) | **Locked design decisions.** Don't contradict these without the user's approval |
| [rules/core-rules.md](rules/core-rules.md) | Core mechanics: Tests, characters, callings, magic, combat, gear, advancement, open questions |
| [rules/gm-guide.md](rules/gm-guide.md) | Foe stat blocks, encounter budgets, starter adventure |
| [sheets/character-sheet.md](sheets/character-sheet.md) | Character sheet template (must match the rules) |
| [data/](data/) | Machine-readable game numbers used by the app and API (`core.json`, `character.json`). Must match the rules files |
| [docs/adr/](docs/adr/) | Architecture decisions: [0001](docs/adr/0001-companion-app-stack.md) app stack, [0002](docs/adr/0002-backend-postgres.md) backend |
| [docs/mockups/](docs/mockups/) | Character sheet UI mockups (view and guided-creation edit mode) for VTTER-47 |

## How we establish rules (workflow)

1. **Proposal:** new ideas go to the user first, or into *Open questions* at the end of
   `rules/core-rules.md`.
2. **Decision:** when the user approves a rule, add a dated entry to `docs/decisions.md`
   (newest at the top) **and** update the rules file it affects, in the same change.
3. **Ripple check:** when a rule changes, search for every place it's referenced and update all of them:
   the core rules, GM guide stat blocks and number tables, the character sheet, and the README.
   Numbers must agree everywhere (DCs, Grit formulas, Momentum costs, and so on).
4. **Open questions:** once a question is decided, remove it from the list and log it as a decision.
5. **Version:** rules files carry a version in their title (`v0.1`). Bump the minor version when you make
   a batch of rule changes, and note it in the decision entry.

## Design guardrails

- **Original content only.** Use genre-standard mechanics (d20, classes, hit points-style stamina,
  advantage-like modifiers) but never copy names, text, spells, monsters, settings, or trademarked
  terms from existing games (no "Dungeons & Dragons", "D&D", SRD wording, beholders, and so on).
  Use our own terms: Test, Boon/Bane, Grit, Wounds, Ember, Momentum, Dread, Calling.
- **Respect the pillars** in README.md: players roll all dice (the GM never rolls in combat),
  fail forward (success at a cost), one core roll, tactical but not fiddly.
- **Keep the terminology consistent.** Capitalize game terms (Test, Boon, Bane, Grit, Wound, Ember,
  Momentum, Dread, Strong success). Don't introduce synonyms.
- **Show the math.** When you propose balance changes, show the expected numbers
  (for example, hit chance at level 1 vs a typical Defense).

## Writing style

- Markdown, using tables for stats. Keep rules text short and in the imperative, addressed to the player as "you".
- Mark placeholders clearly: *(to be written for v0.x)*.
- Use relative links between docs.

## Git and Jira

- Default branch `main`. Commit only when the user asks. Branch from an up-to-date `main` and open a PR;
  merging to `main` deploys (the app to Pages, the API to Cloudflare).
- Work is tracked in Jira project **VTTER** (Virtual Table Top Ember Reach) at morris-heap.atlassian.net.
  Name branches `VTTER-<n>-short-slug`, and mention the VTTER key(s) in commit messages and PR titles.
  (Older history uses the previous project key, KAN.)
- Current epics: VTTER-46 UI / UX (VTTER-47 Character Sheet UI), VTTER-51 Backend
  (VTTER-53 login, VTTER-55 portraits, VTTER-56 app ↔ API still to do).
- Write commit messages in the imperative and say which rules changed (for example "Rebalance Hexer Grit to 8 + 3/level").

## Companion app (`/app`)

Vite + React + TypeScript static site, deployed to https://morris-heap.github.io/virtual-table-top-ember-reach/
by `.github/workflows/app.yml` on pushes to `main`. See [docs/adr/0001-companion-app-stack.md](docs/adr/0001-companion-app-stack.md).

- Commands (run in `app/`): `npm install`, `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
  **Run test, lint and build before you commit app changes.**
- Game logic goes in `app/src/engine/` as pure functions with an injectable RNG, and every rule gets unit tests.
- **Game numbers come from `/data/*.json`, never hard-coded.** When a rule's numbers change,
  update `rules/*.md` **and** `/data` in the same change (this is part of the ripple check above).
- Vite `base` is `/virtual-table-top-ember-reach/`. Use relative or base-aware paths for assets.

## API (`/api`)

Cloudflare Worker at https://emberreach-api.emberreach-api.workers.dev, connecting through Hyperdrive to the
Optilogic Postgres (schema `emberreach`). Deployed by `.github/workflows/api.yml` on pushes to `main`.

- Commands (run in `api/`): `npm test`, `npm run typecheck`, `npm run dev` (local Worker on the real DB),
  `npm run db:check`, `npm run db:migrate`, `npm run db:allow-cloudflare`, `npm run hyperdrive [-- --update]`,
  `npm run secrets`, `npm run deploy`. **Run test and typecheck before you commit API changes.**
- Secrets live in the repo-root `.env` (git-ignored; template in `.env.example`, keep it in sync) and in Cloudflare (`OPTILOGIC_APP_KEY` Worker secret).
  **Never print, log or commit them.** Scripts read `.env` and pass values without echoing them, and call
  wrangler without a shell, because cmd.exe rewrites `^ & | < > %` in passwords.
- Schema changes are new files in `api/migrations/` (never edit an applied one). Sheet fields are real columns
  and child tables, not JSON. Allowed values come from `/data/character.json` and `/data/core.json`.
- The Optilogic test environment can restart and drop its firewall rules. The scripts and the Worker
  (on failure, plus a 10-minute cron) re-add them automatically with the app key.
- Hyperdrive query caching is **off** on purpose (a read right after a save or delete must be fresh). Keep it off.
- Until real login (VTTER-53), heroes are scoped by an `X-Owner-Id` UUID header. That isn't authentication,
  so keep only test data in the database and clean up any rows you create when testing.
- On Windows, run Vitest from a path that starts with an uppercase drive letter (`C:\…`). A lowercase `c:\…`
  working directory makes every test file that imports a local module fail with
  "Cannot read properties of undefined (reading 'config')". CI (Linux) isn't affected.
