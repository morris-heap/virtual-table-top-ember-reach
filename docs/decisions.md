# Design Decisions Log

Locked decisions, newest first. Agents: don't contradict these without the user's approval.
When the user approves a new rule, add an entry here and update the affected rules files in the same change.

Format: `### YYYY-MM-DD — Title` · **Decision** · **Why** · **Affects** (files)

---

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

---

### 2026-11-21 — v0.2: the eight v0.1 open questions (VTTER-5)

**Decision:** Settle every question from the v0.1 *Open questions* list. Core rules and GM guide go to **v0.2**.

1. **Many foes:** the swarm rule is now core. A Minion swarm (3–6) makes one attack per round, and the
   target dodges it once. Each foe attack is one dodge roll. An area attack means each hero in it rolls once.
2. **Wound Banes:** for each Wound, the hero rolls **d6** to pick the Attribute
   (1 Might, 2 Grace, 3 Wits, 4 Lore, 5 Spirit, 6 Presence). Every Test with that Attribute takes a Bane,
   and repeats stack (d4 → d6 → d8).
3. **Momentum:** the cap stays at **6**, but the pool **empties to 0 at the end of each scene** (it used to drop by 1).
4. **Success at a cost on attacks = Glancing hit:** half damage (round down), and on-hit effects don't trigger.
   Spells keep Strain.
5. **Ember:** keep one shared pool. **Forge Lance costs 3 Ember** (was 2).
6. **Level 1 lethality:** Hexer base Grit goes from **7 to 8** (now 8 + 3/level).
7. **Defense formula:** heroes have **Dodge** (Grace + armor + shield) and **Will** (Spirit), added to dodge rolls
   and mental-attack rolls. Defense and Resolve are now foe-only DCs. A foe with no listed Resolve uses its Defense.
   Shield Wall, Ember Shield, and Ward of Flame give +Dodge. Iron Oath gives +2 Will.
8. **Name:** keep *Emberreach* as the working title. A web search (2026-11-21) found no game, RPG, or book with that
   name (nearby: *Ember*, *Emberleaf*, *Into the Emberlands*). Run a formal trademark search before any public release.

**Why:**
- At level 1, a +5 attacker vs Defense 12 gets a Strong success 45% of the time. With 4 heroes that's about 1.8
  Momentum per round, so a cap of 6 filled by round 3–4 and dropping 1 per scene did nothing.
- Choosing your own Wound Bane let heroes dump it on an Attribute they never use.
- Forge Lance (2 Ember, 3d8 ≈ 13.5 to a line) beat Smite the Dark (2 Ember, 3d6 ≈ 10.5 to one target).
  At 7 Ember, a Hexer could cast it three times per rest.
- A Hexer with Might −1 went from 9 to 10 Grit, so it now takes 5 failed dodges against 5-damage hits to go Down, not 4.
- Hero Defense was only ever used as dodge + 10, because the GM never rolls.

**Affects:** rules/core-rules.md (§3.5, §4.1, §4.3, §5.1, §5.3, §6.4–§6.7, §7.2, Open questions),
rules/gm-guide.md (stat block, Smoke Wraith), sheets/character-sheet.md, README.md, data/core.json.

---

### 2026-11-19 — v0.1 foundation

**Decision:** The baseline for the first pass. Everything in the v0.1 rules files is
*provisional* except the following, which are locked as the game's identity:

1. **Core roll:** d20 + Attribute + Skill rank vs DC (8/12/16/20/24).
2. **Degrees of result:** strong success (beat the DC by 5+), success, success at a cost (miss by 1–3), failure,
   Natural 20 Triumph, Natural 1 Fumble.
3. **Boons/Banes** add or subtract a die (d4 → d6 → d8) and cancel one-for-one.
4. **Players roll all dice.** The GM uses fixed DCs. Heroes roll to hit and to dodge.
5. **Grit + Wounds:** damage comes off Grit first. At 0 Grit, hits become Wounds. Each Wound is a lasting Bane.
   Filling all Wound slots means Down.
6. **Side-based turns:** a Heroes' Phase (any order), then a Foes' Phase.
7. **Shared pools:** party Momentum vs the GM's Dread.
8. **Attributes are flat modifiers** (Might, Grace, Wits, Lore, Spirit, Presence). Starting array is
   +3, +2, +1, +1, 0, −1.
9. **Original IP only:** our own setting (Emberreach) and terms. No copied names or text from other games.

**Why:** These define how the game feels. Numbers (Grit, damage, DCs, costs) stay open until playtesting.
**Affects:** all files.
