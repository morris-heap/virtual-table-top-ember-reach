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
