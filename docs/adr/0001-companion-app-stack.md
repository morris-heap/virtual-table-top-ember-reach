# ADR 0001: Companion app stack and rules-data format

- **Status:** Accepted (2026-11-19). The "no backend" part is amended by
  [ADR 0003](0003-backend-dynamodb-lambda.md) (AWS Lambda + DynamoDB, which replaced [ADR 0002](0002-backend-postgres.md)).
  Hosting moved from GitHub Pages to Cloudflare Pages on 2026-11-21 (VTTER-60, see *Hosting* below).
- **Jira:** KAN-32

## Context

We want an online companion (dice roller, character builder, combat tracker) that is free to host,
fast to iterate on with Claude and Codex, and can't drift from the rulebook.

## Decision

- **Static site on Cloudflare Pages** at https://emberreach.morris-heap.com/, built, tested and deployed by
  GitHub Actions from `main` (originally GitHub Pages; see *Hosting*).
- **Vite + React + TypeScript** in `/app`, with **Vitest** for tests and **oxlint** for linting.
- **Game data as JSON in `/data`**, imported by the app. The rulebook Markdown stays the human source of truth.
  The JSON must match it, and a consistency checker will enforce this later (KAN-39).
- **Pure engine code** in `app/src/engine/` with an injectable RNG, so the dice math is fully testable.
- Local state only (browser storage) for now. There's no backend.

## Consequences

- No live multiplayer yet. A shared table would need a realtime backend (for example Supabase or Firebase),
  added later without moving off Pages.
- Rule changes that touch numbers must update `/data` in the same change (see AGENTS.md).

## Hosting (amended 2026-11-21, VTTER-60)

The app moved from GitHub Pages to **Cloudflare Pages** (project `emberreach`), served at
`https://emberreach.morris-heap.com/` with Vite base `/`. The domain `morris-heap.com` is registered at Cloudflare
and its DNS lives there, so the custom domain and its certificate are managed in one place.

- **Why:** GitHub Pages caps a site at 1 GB and about 100 GB of traffic a month. Cloudflare Pages' free plan has no
  bandwidth or request limits for static files. The backend stays on AWS ([ADR 0003](0003-backend-dynamodb-lambda.md)).
- **Deploy:** `.github/workflows/app.yml` still runs lint, test and build, then `wrangler pages deploy` on pushes to
  `main`. It uses a Cloudflare API token scoped to *Cloudflare Pages: Edit* (repo secret `CLOUDFLARE_API_TOKEN`) and
  the repo variable `CLOUDFLARE_ACCOUNT_ID`. Pull requests are checked but not deployed.
- **Limits to know:** 20,000 files and 25 MB per file, 500 deploys a month.
