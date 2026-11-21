# ADR 0002: Backend on Optilogic Postgres, served by a Cloudflare Worker

- **Status:** Superseded by [ADR 0003](0003-backend-dynamodb-lambda.md) (2026-11-21)
- **Jira:** VTTER-51 (Backend epic), for VTTER-47 (Character Sheet UI)
- **Amends:** [ADR 0001](0001-companion-app-stack.md) ("Local state only… There's no backend")

## Context

The character sheet (VTTER-47) needs heroes saved in a database, one set per user, and later a portrait per hero.
The app is a static GitHub Pages site. Anything bundled into it is public, so database credentials can't be
in the browser, and Pages can't run server code. We already have a Postgres database on the **Optilogic** test
environment, plus an Optilogic app key that can manage its firewall.

## Decision

- **Database:** Optilogic Postgres 15, schema `emberreach`. Sheets are **relational**: an `emberreach.characters`
  table with one column per field in `sheets/character-sheet.md`, plus child tables for skills, wounds, attacks,
  talents and spells. No JSON blobs. Derived numbers (max Grit/Ember, Dodge, Will, Speed) aren't stored.
  Migrations live in `api/migrations/*.sql` (`npm run db:migrate`).
- **API:** a **Cloudflare Worker** (`/api`, TypeScript) at `https://emberreach-api.emberreach-api.workers.dev`,
  connecting through **Hyperdrive** (connection pooling; query caching disabled so reads after writes are fresh).
  Routes: `GET /health`, `GET /characters`, `GET|PUT|DELETE /characters/:id`.
- **Validation:** the API checks every value against `/data/character.json` and `/data/core.json` (skills, armor,
  level range, Attributes…), so game numbers aren't hard-coded.
- **Owners until users exist:** the browser generates a profile UUID and sends it as `X-Owner-Id`. The API only
  returns or changes rows with that owner (another owner's id gets 404). This is **not authentication**: real
  login (VTTER-53) replaces it with a verified user id, without changing the tables.
- **CORS:** only `https://morris-heap.github.io` and `http://localhost:5173`. Bodies are capped at 256 KB.
- **Secrets:** the connection details and app key live in the repo-root `.env` (git-ignored). Hyperdrive holds
  the database credentials. The app key is a Worker secret. GitHub Secrets hold `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` for deploys. Nothing secret is in the Pages bundle.
- **Firewall self-repair:** the Optilogic test environment sometimes restarts and drops its firewall rules.
  Cloudflare's published IPv4 ranges are allowlisted for a year (`npm run db:allow-cloudflare`). If the Worker
  can't connect, it re-adds them with the app key (throttled to once per 5 minutes), and a cron trigger checks
  every 10 minutes. Local scripts do the same for the developer's IP.
- **Deploy:** `.github/workflows/api.yml` runs typecheck and tests on PRs and deploys on pushes to `main`.

## Alternatives considered

- **Supabase** (hosted Postgres with Auth and Storage): less code, but a second database when we already have Optilogic.
- **Google Cloud Run + Cloud SQL:** Cloud Run is free, but Cloud SQL has no free tier (about $9–10/month).
- **A JSON column per sheet:** simpler to start, but we want real columns we can query and constrain.

## Consequences

- Cost: $0 on the Workers Free plan (100k requests/day). $5/month if we outgrow it.
- Anyone can call the API until login exists, and the Cloudflare ranges are shared by all Cloudflare customers,
  so the database password is the real protection. Keep only test data until VTTER-53 lands.
- We depend on the Optilogic test environment staying up. JSON export/import in the app (VTTER-56) stays as a way out.
- Portraits (VTTER-55) need a storage choice, for example Cloudflare R2.
