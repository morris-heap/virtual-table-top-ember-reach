# Design Decisions Log

Locked decisions, newest first. Agents: don't contradict these without the user's approval.
When the user approves a new rule, add an entry here and update the affected rules files in the same change.

Format: `### YYYY-MM-DD — Title` · **Decision** · **Why** · **Affects** (files)

---

### 2026-11-24 — The 3D dice tray (VTTER-79)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **The Dice tray is a tab on the Test roller page.** It is a free dice roller: any mix of d4, d6, d8, d10, d12, d20 and
   d100, totalled. It applies no Attributes, Skill ranks, DCs, Boons/Banes or Momentum, and the Test roller is unchanged.
2. **Hover gathers, click releases.** Over the tray the whole pool gathers under the cursor, and a click throws it the way
   the mouse is moving, harder than the hand moves (a throw is the mouse speed times 1.6, up to a cap). The Roll button and Space throw without a mouse. Touch: hold to gather, lift to release.
3. **The result is read from the resting dice.** A die that lands cocked is not counted until it is re-thrown, and a re-throw
   drops the die in the emptiest part of the tray, away from the other dice.
4. **A d100 is a tens die (00-90) plus a units d10 (0-9)**, and 00 + 0 counts as 100.
5. **At most 20 physical dice per throw**, and a d100 is two of them. This is a frame-rate limit, not a rule.
6. **The tray grows with the pool**: the table's area scales with the number of dice (up to 1.7x its base width), so a big
   throw has room to spread. **Expand** makes the tray fill the window (Esc closes it) with the total shown over it.
7. **Colors are a local display preference** (body, numbers, finish, all dice or per die type), saved on the device.

**Why:** Players asked for dice that feel physical. Reading results from the settled dice keeps the number honest, so what
is on screen is what counts. See [ADR 0007](adr/0007-3d-dice-tray.md).

**Affects:** app/ (`dice/`, `engine/dice*.ts`, `engine/polyhedra.ts`, `Roller.tsx`), docs/adr/0007-3d-dice-tray.md,
docs/mockups/dice-tray.html, AGENTS.md. No rules text and no `data/` changes.

---

### 2026-11-24 — The character sheet UI (VTTER-47)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **Two modes.** The sheet has a read-only **View** and a guided **Edit**, both from `docs/mockups/`. A hero that
   hasn't finished creation opens in Edit, and **Done** goes back to View. Edits autosave as before.
2. **The creation guide follows rules §3, steps 1–8**, at level 1 only. It shows progress and never blocks:
   the starting array, skill ranks and talent counts are advice, so the app warns and still saves.
3. **Derived numbers are shown, not stored.** Max Grit, Max Ember, Dodge, Will, Speed and Wound slots are worked out
   from the sheet (§3.5). The sheet still stores only the current Grit and Ember.
4. **Every field has a "?"** with help tailored to the hero's Ancestry and Calling, and a link to the rules section.
   The rules docs are the help docs.
5. **Calling data lives in `data/creation.json`** (Grit and Ember formulas, starting skills, signature, talents,
   kits, Backgrounds, Ancestry bonuses, starting spells). It must match §3, §4, §5.3 and §7.3.
6. **An attack is written as text:** Weapon / Spell, To hit (for example `1d20 + 1`), Damage, Weapon / Spell
   properties and Notes. This replaces the numeric `testBonus` field, and heroes saved the old way are converted
   when they load (5 becomes `+5`, the old Notes stay in Notes).
7. **Help cards:** one is open at a time, and Esc closes it.

**Why:**
- Players shouldn't have to do the §3.5 arithmetic or hunt through the rules to make a legal hero.
- Warning instead of blocking keeps house rules and GM-granted extras possible.

**Affects:** app/ (`SheetEditor`, `SheetView`, `SheetEdit`, `engine/sheet.ts`, `engine/help.ts`), data/creation.json, AGENTS.md.
Portraits are still VTTER-55.

---

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
  takes the choice with it. See [ADR 0006](adr/0006-games.md).
- Counting members would have warned a table of six where only three brought heroes, which is not where turns slow down.

**Affects:** api/ (`/games/:id/hero`, member pointers), app/ (Game page, `partyWarning` now counts heroes),
docs/adr/0006-games.md, AGENTS.md. No rules text and no `data/` number changes: `party.recommendedMax` stays 5.

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

### 2026-11-22 — Games: the table people play from (VTTER-72)

**Decision:** A **Game** is the table: one GM (or none, for a solo Game), players, and one adventure.
1. A GM creates a Game from an adventure (built-in or their own). Anyone can start a **solo** Game on a built-in adventure,
   with no GM, private and with no one else.
2. A Game is **private** (invitation by player ID) or **public** (anyone with the link can join).
3. Members read the Game's adventure through the Game. Adventures themselves stay private.
4. Only a GM can invite or remove players. Any player can leave. The GM can't leave, only delete the Game.
5. Party size still has **no hard cap**: five heroes is advice, and the app warns past it. 20 people per Game is an abuse limit.

**Why:** Games, not Groups, were chosen on 2026-11-22. Reading the adventure through the Game means a GM can run a table
without publishing their adventure. Details and trade-offs are in [ADR 0006](adr/0006-games.md).

**Affects:** data/game.json, api/, app/, docs/adr/0006-games.md. No rules text changes.

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
