### 2026-11-25 — The table is named for the game, not for characters (VTTER-94)

**Decision:** Infrastructure, not a game rule. The rules stay at **v0.2**.

1. **The DynamoDB table is `vtter-game`**, renamed from `emberreach-characters`. It holds every item kind —
   heroes, profiles, adventures, Games, member pointers, Game-name reservations and the `_player` / `_game`
   lookups — so naming it after one of them was wrong, and more kinds are coming (maps VTTER-74/85, terrain
   VTTER-84, friends VTTER-73, live table state VTTER-87).
2. **DynamoDB has no rename, so this replaced the table.** The CDK construct id stays `Characters`: renaming a
   construct id also replaces the table, and the id is invisible outside CloudFormation. `cdk diff` must show
   `TableName` as the only changed property.
3. **The existing items were copied over, not discarded.** A player ID never changes
   ([ADR 0005](../adr/0005-profile-and-adventures.md)), so dropping the `_player` rows would have released the
   claimed IDs and handed those accounts new ones. `api/scripts/copy-table.ts` does the copy and is safe to
   re-run.
4. **The old table was kept until the new one was serving.** It has `deletionProtection: true` and
   `RemovalPolicy.RETAIN`, so CloudFormation orphans rather than deletes it.

**Why:**
- Done now because the table held only test data. Every later day makes the same rename a dual-write backfill
  against real players' heroes.
- The name is read by every agent and every new contributor as the first clue to what the backend stores.
  `emberreach-characters` taught them the wrong model of the system.

**Affects:** infra/lib/data-stack.ts (`TABLE_NAME`), api/ (`lambda.ts`, `dev.ts`, `scripts/claim-heroes.ts`,
the new `scripts/copy-table.ts`), app/e2e/throwaway-user.ts, AGENTS.md, api/README.md, infra/README.md,
ADRs 0003 and 0005 (noted, not rewritten: they are a dated record). No rules text and no `data/` changes.
