### 2026-11-25 — Player IDs grow to 6 characters (VTTER-82)

**Decision:** Product rule for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **New player IDs are 6 characters** from the same unambiguous alphabet (31 characters, no `0 O 1 I L`):
   `EMBER-7K2Q9F`. That is 31^6 = **887 million** IDs, up from 31^5 = 28.6 million.
2. **The 5-character IDs already handed out stay valid for ever.** A player ID never changes, so nothing is
   migrated and no one's ID is reissued. Both lengths are accepted on input, everywhere a player ID is read.
3. **Nothing longer is accepted.** The validator allows 5 or 6 characters only, so a typo with a trailing
   character is still rejected.

**Why:**
- IDs are claimed by conditional write with 5 attempts, so a collision costs a retry, not a duplicate. The failure
  mode is a signup error once the space fills: at 30% full (8.6M users) about 1 signup in 400 fails, and at 90% full
  about 1 in 1.7. The old space was comfortable only to ~2-3 million users.
- Six characters moves that ceiling out by 31x for the cost of one character, and is still short enough to read aloud.
- Accepting both lengths is what keeps the "never changes" promise in [ADR 0005](../adr/0005-profile-and-adventures.md).

**Affects:** api/src/profile.ts (`newPlayerId`, `isPlayerId`), app/src/engine/game.ts (`cleanPlayerId`),
app/src/api/types.ts, app/src/GamePage.tsx (placeholder and error text), docs/adr/0005-profile-and-adventures.md.
No rules text and no `data/` number changes.
