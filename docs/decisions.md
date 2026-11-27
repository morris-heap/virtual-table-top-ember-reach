# Design Decisions Log

Locked decisions. Agents: don't contradict these without the user's approval. This file is loaded into every
session, so it holds only the rules most tasks need, plus a one-line digest of every other decision. **Each full
entry (Decision, Why, Affects) is its own file in [decisions/](decisions/).** Open the file when you work in that
area, and before you change anything its digest touches.

**Adding a decision:** write `docs/decisions/YYYY-MM-DD-slug.md` (format below), add its row at the top of the
table, and update the affected rules files in the same change. Newest first.

Entry format: `### YYYY-MM-DD — Title` · **Decision** · **Why** · **Affects** (files)

---

## Game identity (2026-11-19, v0.1) — locked

[Full entry](decisions/2026-11-19-v0-1-foundation.md). Everything else in the v0.1 files was provisional.

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

## Settled rules (2026-11-21, v0.2) — locked

[Full entry](decisions/2026-11-21-v0-2-open-questions.md), with the numbers behind each choice.

1. **Many foes:** a Minion swarm (3–6) makes one attack per round, and the target dodges it once. Each foe attack
   is one dodge roll. An area attack means each hero in it rolls once.
2. **Wound Banes:** for each Wound, roll **d6** to pick the Attribute (1 Might, 2 Grace, 3 Wits, 4 Lore, 5 Spirit,
   6 Presence). Every Test with that Attribute takes a Bane, and repeats stack (d4 → d6 → d8).
3. **Momentum:** cap **6**, and the pool **empties to 0 at the end of each scene**.
4. **Success at a cost on attacks = Glancing hit:** half damage (round down), and on-hit effects don't trigger.
   Spells keep Strain.
5. **Ember:** one shared pool. Forge Lance costs 3 Ember.
6. **Hexer base Grit is 8 + 3/level.**
7. **Defense:** heroes have **Dodge** (Grace + armor + shield) and **Will** (Spirit). Defense and Resolve are
   foe-only DCs; a foe with no listed Resolve uses its Defense. Shield Wall, Ember Shield and Ward of Flame give
   +Dodge. Iron Oath gives +2 Will.
8. **Name:** keep *Emberreach* as the working title. Run a formal trademark search before any public release.

## Scope lock (2026-11-25, VTTER-92; amended 2026-11-26) — locked

[Full entry](decisions/2026-11-25-automate-our-own-rules.md) · [fog of war amendment](decisions/2026-11-26-fog-of-war.md).
The app **deeply automates Emberreach's own rules**. It is **not** a general VTT.

- **In scope:** rules automation read from `/data`, the side-based combat tracker, a live shared table (VTTER-87), a
  shared roll log, simple image-and-token maps, a GM-only layer, slabs, and fog of war as a GM setting (party or
  per-token vision, filtered by the API, shipped after VTTER-87).
- **Out of scope:** dynamic lighting, 3D terrain and sculpting, a user scripting language, a system builder for other
  RPGs, a content marketplace, built-in video or voice.
- **Players never buy in to join.** A GM's Game is free for every member.
- **Party size has no hard cap.** Five heroes is advice (`party.recommendedMax`): warn, never block, and count
  **heroes**, not members.

## Everything else

| Date | Decision (ticket) | Locked rule in one line | Full entry |
|---|---|---|---|
| 11-27 | Traps and a starting open or closed state (VTTER-129) | Five trap Static Objects bring `hazard` + `hidden` defaults (fire with VTTER-110). Starts open goes only on things that open; it changes sight (open door stops blocking it, bars never block it) and the drawing, never movement. A player never receives a Hidden object. | [file](decisions/2026-11-27-traps-and-open-state.md) |
| 11-27 | Maps drawn as art (VTTER-119) | Hexes are the invisible rules layer; each object is drawn as one smooth, textured shape. Textures are generated in code per type id, decoration is seeded and never stored, and the grid shows while painting or on demand. | [file](decisions/2026-11-27-maps-drawn-as-art.md) |
| 11-27 | Find a player by display name (VTTER-108) | Opt-in, off by default. Whole-name match only, never a prefix. A result is a display name and player ID, nothing else. At most 10 matches, 12 searches a minute. | [file](decisions/2026-11-27-find-players-by-name.md) |
| 11-27 | Maps ship before chapters (VTTER-74) | Maps are made, generated, saved and deleted on their own; the chapter link and the Game map route come with VTTER-75. 3 maps per author. A player's view drops GM-only objects (and what sits on them), Entities and notes. Doors let you through walls; windows don't. | [file](decisions/2026-11-27-maps-before-chapters.md) |
| 11-26 | Friends show when they are online (VTTER-73) | Heartbeat every 25 s from any page (a Game page also names its Game), online for 70 s. Mutual friends only, never a pending request. A friend's Game is named only if you are at that table too. | [file](decisions/2026-11-26-friends-online.md) |
| 11-26 | Layered map object model (VTTER-86) | Six object kinds, properties flow down `on`, one DynamoDB item per map (350 KB, 500 objects). The API filters GM-only objects, never the client. | [file](decisions/2026-11-26-layered-map-object-model.md) |
| 11-26 | Fog of war in scope (VTTER-86) | See the scope lock above. | [file](decisions/2026-11-26-fog-of-war.md) |
| 11-26 | Terrain: Difficult and Impassable (VTTER-86) | Entering Difficult costs 2 zones, capped at 2 when stacked. Impassable can't be entered. 1 hex = 1 zone. `movement` in `data/core.json`. Core rules v0.4. | [file](decisions/2026-11-26-terrain.md) |
| 11-26 | Enemies, NPCs and libraries in an adventure | An adventure has `enemies` and `npcs` lists that scenes point at by id. Libraries are `data/bestiary.json` and `data/npc-library.json`, copied in on add. | [file](decisions/2026-11-26-enemies-npcs-library.md) |
| 11-26 | Chat between friends (VTTER-109) | Friends only, plain text, 1000 chars, 90 days, polled, no push. One 404 for every refusal. Not a chat platform. | [file](decisions/2026-11-26-chat-between-friends.md) |
| 11-26 | Half-damage hits at 0 Grit (VTTER-48) | Every hit that deals damage at 0 Grit is a Wound, including half damage. Half rounds down, so 0 damage is no Wound. | [file](decisions/2026-11-26-half-damage-wound.md) |
| 11-26 | Forge Lance wording (VTTER-49) | Effect is "3d8 fire damage". No "ignores armor": no rule gives damage reduction. | [file](decisions/2026-11-26-forge-lance-wording.md) |
| 11-26 | Friends list and sharing adventures (VTTER-73) | Mutual, needs acceptance. Adventure visibility `friends` is live, `public` stays refused. Access needs both sides accepted. Caps are in `data/friends.json`. | [file](decisions/2026-11-26-friends-list-and-sharing.md) |
| 11-26 | The Kilnheart, a seventh Calling (VTTER-105) | Grit 9 + 4/level, Ember 2 + Might. Crucible swallows one of eight minerals (four Veins, one held at a time). Two Deep minerals are GM treasure. Core rules v0.3. | [file](decisions/2026-11-26-kilnheart.md) |
| 11-25 | Table named for the game (VTTER-94) | The DynamoDB table is `vtter-game`. The CDK construct id stays `Characters`. Never rename a construct id: it replaces the table. | [file](decisions/2026-11-25-table-naming.md) |
| 11-25 | Public Games and unique names (VTTER-76) | Game names are unique per GM (case and spacing fold). Listing is a second opt-in after public. One shared sparse `gsi1` index. | [file](decisions/2026-11-25-public-games-unique-names.md) |
| 11-25 | Player IDs grow to 6 characters (VTTER-82) | New IDs are 6 characters. The 5-character IDs stay valid for ever. Both are accepted, nothing longer. | [file](decisions/2026-11-25-player-ids-six-characters.md) |
| 11-24 | The 3D dice tray (VTTER-79) | A free dice roller tab on the Test roller. Results are read from the resting dice. At most 20 physical dice. No rules applied. | [file](decisions/2026-11-24-3d-dice-tray.md) |
| 11-24 | The character sheet UI (VTTER-47) | View and guided Edit. Derived numbers are shown, not stored. The guide warns and never blocks. Calling data lives in `data/creation.json`. | [file](decisions/2026-11-24-character-sheet-ui.md) |
| 11-23 | A hero in a Game (VTTER-77) | Each member brings one hero, as a reference not a copy. The party warning counts heroes. | [file](decisions/2026-11-23-hero-in-a-game.md) |
| 11-22 | Adventures, Games and party size (VTTER-71) | Everyone writes adventures, private until shared. The Game Master switch gates sharing, not authoring. Built-ins play solo or with a GM. Player ID is public. | [file](decisions/2026-11-22-adventures-games-party-size.md) |
| 11-22 | Games: the table people play from (VTTER-72) | A Game is one GM (or none for solo), players and one adventure; private or public. Only a GM invites or removes. 20 people per Game is an abuse limit. | [file](decisions/2026-11-22-games.md) |
