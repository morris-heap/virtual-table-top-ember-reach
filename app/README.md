# Emberreach companion app

Live: https://emberreach.morris-heap.com/

A static web app (Vite + React + TypeScript), deployed to Cloudflare by Workers Builds on every push to `main`
([wrangler.jsonc](wrangler.jsonc)). [.github/workflows/app.yml](../.github/workflows/app.yml) checks pull requests.

## Commands (run in `app/`)

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server (http://localhost:5173/) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |
| `npm run build` | Type-check and production build to `dist/` |

## Structure

- `src/engine/`: pure game logic (no React), unit-tested. Takes an injectable RNG.
- `src/App.tsx`: UI.
- `../data/*.json`: **game numbers come from here**, not hard-coded. Keep them in sync with
  `rules/` (see AGENTS.md).

## Current features (iteration 1)

- Test roller: Attribute + Skill + net Boon/Bane die vs DC, with the degree of result
- Party Momentum tracker with spend options
- Hero creation, editable sheets, JSON import/export, and account sync (VTTER-56).

## Hero storage

[CharacterRepository](src/characters/repository.ts) uses the API's shared `CharacterSheet` type and parser.
HTTP calls go through [client.ts](src/api/client.ts), using `VITE_API_URL` and a Cognito access token.
A 401 forces one refresh; a second 401 asks the player to sign in again.

Guests save on the device. Signed-in heroes have a separate local cache and durable outbox per account.
Edits persist locally immediately and upload after 600 ms without edits. Network failures and 503s retain
the outbox; retries respect `Retry-After`. Pending deletions survive reloads too. Validation errors appear
beside the matching field. An explicit upload button moves guest heroes into the signed-in account's outbox.
Import creates a new hero; export contains sheet data without account identity.

After the first successful production visit, a service worker caches the app shell for offline reopening.
It never caches API or authentication responses. Offline account access requires the existing tab's session;
guest heroes remain accessible while signed out. Browser storage must be enabled and have space.

Sync uses the API's whole-sheet replacement contract: the last successful upload wins if two devices edit
the same hero. Cross-device reads refresh from the API when the hero list or sheet is opened.
