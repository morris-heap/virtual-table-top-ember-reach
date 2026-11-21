# Emberreach API

Live: https://emberreach-api.emberreach-api.workers.dev (check it at `/health`)

A Cloudflare Worker (TypeScript) that saves character sheets in the Optilogic Postgres (schema `emberreach`),
connecting through Hyperdrive. It's deployed by [.github/workflows/api.yml](../.github/workflows/api.yml) on every
push to `main` that touches `api/` or `data/`. Background: [ADR 0002](../docs/adr/0002-backend-postgres.md).

## Setup

1. `npm install`
2. Copy [`.env.example`](../.env.example) to the repo-root `.env` (git-ignored, **never commit or print it**) and fill in:
   - `OPTILOGIC_CONNECTION_STRING`: the Optilogic JSON (`{"host":…,"port":…,"dbname":…,"user":…,"password":…,"sslmode":"require"}`) or a `postgresql://` URL
   - `OPTILOGIC_APP_KEY`: used to update the Optilogic database firewall
3. `npm run db:check` checks the connection. If the firewall blocks you, it allowlists your IP and retries.
4. `npm run dev` runs the Worker locally at http://127.0.0.1:8787, against the real database.

## Commands

| Command | What it does |
|---|---|
| `npm test` / `npm run typecheck` | Unit tests (Vitest) and type check. Run both before committing |
| `npm run dev` | Local Worker on the real DB |
| `npm run db:check` | Connection check (fixes the firewall if needed) |
| `npm run db:migrate` | Applies new `migrations/*.sql` files (tracked in `emberreach.schema_migrations`) |
| `npm run db:allow-cloudflare [-- --days N]` | Allowlists Cloudflare's IPv4 ranges and your IP in the Optilogic firewall (default 365 days) |
| `npm run hyperdrive [-- --update]` | Creates the Hyperdrive config, or points it at new credentials after a password change |
| `npm run secrets` | Uploads `OPTILOGIC_APP_KEY` as a Worker secret |
| `npm run deploy` | Deploys by hand (CI normally does this). Needs `npx wrangler login` |

## Routes

All `/characters` routes need an `X-Owner-Id` header (a UUID) until real login exists (VTTER-53).

| Route | Does |
|---|---|
| `GET /health` | `{"ok":true,"db":"ok"}`, or 503 if the database is unreachable |
| `GET /characters` | Lists your heroes (id, name, level, ancestry, calling, updatedAt) |
| `GET /characters/:id` | Returns one full sheet |
| `PUT /characters/:id` | Creates or replaces a sheet. Only `name` is required. Values are checked against `/data` (400 with the reason) |
| `DELETE /characters/:id` | Deletes it (204) |

Another owner's id gets 404. While the database is unreachable, routes return 503 with `Retry-After: 60`.

## Layout

- `src/handler.ts`: routing, CORS, errors (pure, so it's unit-tested with an in-memory store)
- `src/sheet.ts`: the `CharacterSheet` shape and its validation (values from `../data/`)
- `src/store.ts`: Postgres reads and writes (one transaction per save)
- `src/firewall.ts`: Optilogic firewall self-repair (on failure, plus a cron every 10 minutes)
- `migrations/`: schema changes. Add new files and never edit applied ones
- `scripts/`: local tooling. These read `.env` without printing secrets and call wrangler without a shell
