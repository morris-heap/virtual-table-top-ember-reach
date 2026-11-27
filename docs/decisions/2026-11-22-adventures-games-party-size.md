### 2026-11-22 — Adventures, Games and party size (VTTER-71)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **Everyone writes adventures.** They are **private** until the author shares them. The **Game Master** switch on
   the profile unlocks GM features (sharing, creating Games). It does not gate authoring.
2. **Built-in adventures** ship with the app and anyone can play them, **solo or with a GM**.
   The first is *The Soot King's Hearth*.
3. **Players have a public player ID** (for example `EMBER-7K2Q9`) and, later, a **friends list**.
4. **People play from a Game**, not a group. A Game has members, a GM, an adventure and heroes, and is **public or
   private**. A GM creates one from the GM view by picking an adventure.
5. **Party size has no hard cap.** One hero is fine. **Five is the recommended maximum**, because every extra hero
   adds a turn to each round and the turn-based flow slows down. The app warns above 5 and never blocks.

**Why:**
- Players and GMs both want to write material, so authoring stays open and only sharing is a GM feature.
- Solo play lowers the barrier: no need to find a GM or a group to try the game.
- Side-based turns (Heroes' Phase, then Foes' Phase) mean the Heroes' Phase grows with the party.
  README and AGENTS.md already say 3–5 players, and that stays the table norm.

**Affects:** rules/core-rules.md (§1 party size), rules/gm-guide.md (§5 now also lives in
data/adventures/soot-kings-hearth.json), data/core.json (`party`), data/adventure.json, data/adventures/,
README.md, AGENTS.md, docs/adr/0005-profile-and-adventures.md. Jira: VTTER-71, then VTTER-72 (Games) and
VTTER-73 (friends list).
