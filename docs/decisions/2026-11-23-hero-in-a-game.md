### 2026-11-23 — A hero in a Game (VTTER-77)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **Each member brings one hero** to a Game and can change it or withdraw it at any time. It must be one of their own.
2. **A hero is a reference, not a copy.** The Game points at the live sheet, so edits show at the table at once.
   A Game cannot hold a hero "as it was" at a session; snapshots wait for playing scenes.
3. **The table sees every hero read-only** (name, level, ancestry, calling). Only the owner can change their own.
4. **The party-size warning counts heroes, not members.** A turn in the Heroes' Phase belongs to a hero, so a
   spectator or a hero-less GM doesn't trip it. Still advice: it warns past 5 and never blocks.
5. **A solo Game brings a hero too**, the same way.

**Why:**
- The hero choice lives on the member's own pointer item, so no one can set another player's hero and leaving a Game
  takes the choice with it. See [ADR 0006](../adr/0006-games.md).
- Counting members would have warned a table of six where only three brought heroes, which is not where turns slow down.

**Affects:** api/ (`/games/:id/hero`, member pointers), app/ (Game page, `partyWarning` now counts heroes),
docs/adr/0006-games.md, AGENTS.md. No rules text and no `data/` number changes: `party.recommendedMax` stays 5.
