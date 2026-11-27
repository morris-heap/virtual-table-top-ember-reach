### 2026-11-27 — Finding a player by display name (VTTER-108)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay as they are.

1. **Players can be found by display name only if they opt in.** *Let people find me by my display name* is on the
   Profile, off by default. Nobody is published by an upgrade.
2. **A result shows the display name and the player ID, and nothing else.** Never the Cognito `sub`, a Game, presence
   or a hero.
3. **The whole name must match** (case and spacing fold, punctuation does not). There is no prefix search, so the
   search can't be used to list players.
4. **At most 10 matches, never yourself.** Names are not unique, so every match is listed with its player ID and you
   pick one. Adding by player ID keeps working.
5. **12 searches per player per minute**, then the search is refused until the minute is up.

**Why:**
- A display name is public to people who know it, but a search box is also a way to read the whole player list, so
  opting in, whole-name matching, the result cap and the rate limit all work together to stop that.
- The player ID is already shown on every friend request, so a result reveals nothing new about someone who opted in.
- Details and trade-offs are in [ADR 0013](../adr/0013-find-players-by-name.md).

**Affects:** data/profile.json (new), api/ (`GET /players`, `findable` on the profile, the name key on `gsi1`),
app/ (Add a friend, Profile), docs/adr/0013-find-players-by-name.md, CLAUDE.md. No rules text and no game numbers.
