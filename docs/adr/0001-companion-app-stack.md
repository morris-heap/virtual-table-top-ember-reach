# ADR 0001: Companion app stack and rules-data format

- **Status:** Accepted (2026-11-19). The "no backend" part is amended by
  [ADR 0003](0003-backend-dynamodb-lambda.md) (AWS Lambda + DynamoDB, which replaced [ADR 0002](0002-backend-postgres.md)).
- **Jira:** KAN-32

## Context

We want an online companion (dice roller, character builder, combat tracker) that is free to host,
fast to iterate on with Claude and Codex, and can't drift from the rulebook.

## Decision

- **Static site on GitHub Pages**, built and deployed by GitHub Actions from `main`.
- **Vite + React + TypeScript** in `/app`, with **Vitest** for tests and **oxlint** for linting.
- **Game data as JSON in `/data`**, imported by the app. The rulebook Markdown stays the human source of truth.
  The JSON must match it, and a consistency checker will enforce this later (KAN-39).
- **Pure engine code** in `app/src/engine/` with an injectable RNG, so the dice math is fully testable.
- Local state only (browser storage) for now. There's no backend.

## Consequences

- No live multiplayer yet. A shared table would need a realtime backend (for example Supabase or Firebase),
  added later without moving off Pages.
- Rule changes that touch numbers must update `/data` in the same change (see AGENTS.md).
