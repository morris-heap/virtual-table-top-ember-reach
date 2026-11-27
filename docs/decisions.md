# Design Decisions Log

Locked decisions, newest first. Agents: don't contradict these without the user's approval.
When the user approves a new rule, add an entry here and update the affected rules files in the same change.

Format: `### YYYY-MM-DD — Title` · **Decision** · **Why** · **Affects** (files)

---

### 2026-11-26 — Enemies and NPCs in an adventure, and a library to pick from

**Decision:** Product rule for the companion app. No change to the d20 rules, so the rules stay at **v0.2** (core v0.3).

1. **An adventure carries two lists, `enemies` and `npcs`**, and a scene points at them by id: `enemies` (an id and a count)
   and `npcs` (ids). A scene no longer has free-text foes. This is the model going forward: authors pick from the library
   or create their own, and existing test adventures were not migrated.
2. **An enemy is the block in [GM guide §2](../rules/gm-guide.md):** name, tier (minion, standard, elite, boss),
   Defense, Grit, Attack DC, damage, optional Will DC and Resolve, moves, traits and Dread abilities. Damage and moves
   are free text (`7 x2`, `2, flies`). The app warns on bad numbers and never checks them against the level table (§2.2).
3. **An NPC** has a name, role, attitude (hostile, wary, neutral, friendly), description and a GM-only secret.
4. **The libraries are data:** `data/bestiary.json` (35 enemies across levels 1–10 and all four tiers, numbers by the §2.2
   band) and `data/npc-library.json` (15 NPCs). Both are original to Emberreach. Adding one **copies** it into the adventure,
   where the author can edit it, and search covers names, tags and abilities, with tier and party-level filters.
5. **Import from a `.json` file** fills the editor and saves nothing until the author presses Save.

**Why:** Foes were only names, so a GM had to write the numbers into scene text. The stat block is already fixed by the
GM guide, so it can be data, and a library makes a first adventure quick to build.

**Affects:** data/adventure.json, data/bestiary.json, data/npc-library.json, data/adventures/soot-kings-hearth.json,
api/ (`parseAdventure`), app/ (editor, library picker, built-in viewer, file import). No rules text changes.

---

### 2026-11-26 — Chat between friends (VTTER-109)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.3**.

1. **Friends can chat.** Two players who are friends (both sides accepted, [ADR 0009](adr/0009-friends.md)) can send each
   other text messages from the Friends list. It is one thread per pair of friends, for arranging sessions.
2. **Plain text only.** Up to 1000 characters, no formatting, links or uploads. Messages are shown as text, never as markup.
3. **Only the two friends can read or write a thread.** A stranger, a pending request, yourself and an unknown player ID
   all get the same 404. Removing the friendship from either side stops it at once. A removed friend is not told.
4. **Messages are kept 90 days**, then deleted. There is no edit and no delete in v1, and no way to report or block
   (removing the friend is the escape hatch; a block list is the follow-up ADR 0009 already names).
5. **Slow down, not shut out:** 20 messages a minute per sender, then a clear "wait a moment".
6. **Unread shows as a dot** on the Friends link and on that friend's row, until the thread is opened.
7. **No push.** The open chat checks for new messages every 5 seconds and the dot every 30 seconds, while the tab is visible.
   Nothing is emailed or sent to a phone.
8. **Scope lock holds** (2026-11-25): this is text between friends. No voice, no video, no channels, no bots, no
   file sharing.

**Why:**
- Tables arrange their sessions in Discord and then come back. A short thread next to the friends list keeps that
  conversation where the Game is, without building a chat platform.
- The same 404 for every refusal means a stranger learns nothing about who has friends or who exists, as with shared adventures.
- Polling is enough for a few friends and needs no new API, table or stack. The live table (VTTER-87) may bring real-time
  delivery, and chat can move onto it then.
- The limits are abuse and cost caps, not game rules. They live in `data/chat.json`.

**Affects:** api/ (`chat.ts`, `chat-store.ts`, `/friends/:playerId/messages`, `unread` on `GET /friends`), app/ (`Chat.tsx`,
the Friends list and top bar), data/chat.json, infra/ (`ttl` on the table),
docs/adr/0010-friend-chat.md, CLAUDE.md, README.md. No rules text and no game numbers.

---

### 2026-11-26 — Half-damage hits at 0 Grit still cause a Wound (VTTER-48)

**Decision:** Settles the VTTER-5 follow-up. The rules stay at **v0.3** (core rules) and **v0.2** (GM guide).

1. At 0 Grit, **every hit that deals damage is a Wound**, including a **half-damage** hit: a dodge that succeeds
   at a cost (§6.5), or a Glancing hit (§6.4) if foes ever get that rule.
2. Half damage rounds down, so a hit that halves to **0** damage deals nothing and causes no Wound.

**Why:**
- It's the simplest wording and keeps "at 0 Grit, hits become Wounds" true without exceptions.
- At level 1 with Dodge +4 vs Attack DC 12, a dodge succeeds 65% of the time, succeeds at a cost 15%, and fails 20%.
  At 0 Grit, a Wound now comes on 35% of dodges. The user chose this over (b), nothing happens (20%, where a
  cost reads as a clean success), and (c), two half hits make a Wound (an extra counter to track).
- 0 Grit is meant to be the dangerous state. Under (b), success at a cost would stop costing anything there.

**Affects:** rules/core-rules.md (§6.5, §6.6). No change to `/data`, the sheet, the GM guide or the app.

---

### 2026-11-26 — Forge Lance no longer says "ignores armor" (VTTER-49)

**Decision:** A wording fix, not a balance change. The rules stay at **v0.3**.

1. **Forge Lance's effect is now "3d8 fire damage".** The words "ignores armor" are deleted.
2. **Nothing else about it changes:** 3 Ember, a line, rolled against Defense, 3d8 fire.

**Why:**
- Armor only adds to Dodge and to a foe's Defense. There is no damage reduction in the rules, so "ignores armor"
  did nothing, or implied a rule that doesn't exist.
- Deleting it (rather than rolling against Defense − 2, or adding Burning) keeps the numbers settled on
  2026-11-21 (3 Ember, 3d8 ≈ 13.5 to a line). Either alternative would have made Forge Lance stronger, which
  that decision was trying to rein in.

**Affects:** rules/core-rules.md (§5.3 Arcane table), data/creation.json (Forge Lance `effect`).

---

### 2026-11-26 — A friends list, and sharing adventures with friends (VTTER-73)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.3**.

1. **A friendship is mutual and needs an answer.** One player asks by player ID, the other accepts or declines. Asking
   someone who has already asked you accepts. Either player can end it at any time, and the other is not told.
2. **Adventure visibility `friends` is live.** A friend can list and read it, read-only. Everyone else gets a 404, the
   same 404 as "no such adventure", so a stranger can't tell what exists. **`public` stays off**: it is still in the
   model and the API still refuses it. Public adventures need discovery and listing rules, which the scope lock
   (2026-11-25) keeps away from a content marketplace. Public *Games* (2026-11-25) are unchanged.
3. **Access needs both sides of the friendship.** Removing it from either side stops reading at once.
4. **The Game Master switch still gates sharing in the app** (2026-11-22): the visibility picker is enabled for a Game
   Master. The API does not check the flag, because it is a preference and not a permission (ADR 0005).
5. **A GM can invite a friend from the friends list.** It adds them right away, the same as typing their player ID.
   There is no pending invite: the picker is a convenience, not consent.
6. **Abuse caps, not game rules** (`data/friends.json`): 100 friends, 20 requests waiting on others, 50 waiting on you.
   There is no blocking yet, so a declined request can be sent again, up to the cap.

**Why:**
- Mutual and accepted is the Steam model the ticket asked for, and it means no one is added to a list without a say.
- Checking both sides means a lost write can't leave a removed friend with access.
- Keeping `public` off avoids deciding listing and discovery before there is a need, and before the scope lock is tested.

**Affects:** data/ (`friends.json`, `adventure.json` `liveVisibilities`), api/ (`/friends` routes, `friend` item kind),
app/ (Friends screen, shared adventure view, editor visibility picker, Game page friend picker),
docs/adr/0009-friends.md, CLAUDE.md, README.md. No rules text and no game numbers.

---

### 2026-11-26 — The Kilnheart, a seventh Calling (VTTER-105)

**Decision:** A new Calling, the mineral alchemist. Core rules go to **v0.3**; the GM guide stays at **v0.2**.

1. **Kilnheart:** Grit **9 + 4/level**, Ember **2 + Might**, light armor, Melee 2 and Craft 1. Kit: versatile
   weapon, light armor, a mineral pouch, a mortar and pestle.
2. **Signature: Crucible.** Once on your turn, without using your Action, pay 1 Ember and swallow a known
   mineral. It lasts until the scene ends, and you hold one at a time. Burning Out applies.
3. **Eight common minerals in four Veins**, each with a Hot and a Cold one: Blood (Sulfur, Slate), Stride
   (Cinnabar, Rootstone), Mind (Wakeglass, Hushstone) and Marrow (Marrowsalt, Stillsalt). You know 3 at level 1.
   You can't hold both from one Vein. Marrowsalt acts at once and is never held, so it doesn't end Stillsalt.
4. **Two Deep minerals**, Heartcoal (one extra Action this turn) and Gloamspar (remove 1 Wound), are GM-awarded
   treasure that only a Kilnheart can swallow. A dose doesn't use an Action, is used up, costs no Ember and
   doesn't replace the held mineral.
5. **Talents:** Twin Draught, Wide Palate (2 more minerals), Quick Swallow, Shared Dose, Last Spark, Tempered Gut.
6. **Original content:** no other work's name, terms, materials or power set, and no credit to one in the game files.
7. The *to be written* placeholders for Calling Mastery and Legend move to **v0.4**.

**Why:**
- A body-fuelled alchemist is a play style none of the six Callings covered, and it reuses Ember, so it adds
  no new pool.
- Level 1 with Might +3 and Grace +2: Grit 16 (Blade 17), 6 failed dodges against 5 damage to go Down (Blade 6),
  Ember 5 (Blade 4, Hexer with Lore +3: 7).
- +5 vs Defense 12 hits 70% of the time (15% more are Glancing). A d8 + 3 attack averages about 5.8 damage,
  7.5 with Sulfur, against about 8.4 for a Blade with Flurry.
- Against Attack DC 12 and 5 damage, expected damage per attack falls from 1.55 to 1.05 with Slate.
- **To watch in playtests:** Slate matches *Ward of Flame* without costing an Action, and Stillsalt cancels the
  main penalty of Wounds for 1 Ember.

**Affects:** rules/core-rules.md (§4.7, §7.3, §9), data/ (`creation.json`, `character.json`, `core.json`),
sheets/character-sheet.md, README.md, api/ (`minerals` on a hero), app/ (sheet view, editor and help).

---

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
   ([ADR 0005](adr/0005-profile-and-adventures.md)), so dropping the `_player` rows would have released the
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

---

### 2026-11-25 — Browsing public Games, and unique Game names (VTTER-76)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **A Game's name is unique per GM, not globally.** One GM cannot have two Games called *Friday Night*;
   two different GMs can. A clash is refused with a clear message, not silently renamed.
2. **The UUID stays a Game's identity.** The name is a label, so renaming a Game breaks no link and changes
   nothing about how it is stored or joined. There is no "join by name".
3. **Names collide on case and spacing, not punctuation.** *Friday Night*, *friday night* and
   *Friday&nbsp;&nbsp;Night* are the same name; *Ash & Ember* and *Ash and Ember* are different. The GM's own
   spelling is what gets stored and shown.
4. **Listing a Game is a second opt-in, separate from making it public.** Public means "anyone with the link
   can join". Listed means "it also shows on `/games` for anyone to find". A Game can be public without being
   listed; a private Game can never be listed.
5. **Anyone can browse and join**, player or GM. The list shows the Game's name, its adventure, the GM, and how
   many people and heroes are at the table, newest activity first.
6. **Party size still has no hard cap.** Past five heroes a browse row shows advice and the Join button stays
   enabled.
7. **The index keys are generic (`gsi1pk` / `gsi1sk`), not named for this query.** One shared sparse index
   serves every kind that needs cross-partition listing; each writes its own namespaced partition value
   (`game#public` here). A table allows only 20 GSIs and each one charges write capacity on every indexed
   write, so per-purpose indexes get expensive as item kinds multiply. Decided before the index shipped,
   because renaming an index key afterwards replaces the index.
8. **Existing Games were deleted, not migrated.** The three Games in the live table on 2026-11-25 were all
   private test tables, so they were removed before the rule shipped rather than back-filling reservations.
   Heroes, profiles, player IDs and adventures were untouched.

**Why:**
- A campaign can run for years, so globally unique names would let the first few hundred Games permanently
  consume every obvious name and force later GMs into variants. Per-GM scope keeps a name meaningful where it
  is actually read — in one GM's list of tables.
- Folding punctuation would reject names a GM would reasonably consider distinct, so only case and whitespace
  fold.
- Opt-in listing never publishes a table someone made public purely to share a link with a few friends.
- Counting heroes rather than members matches the 2026-11-23 decision: a turn in the Heroes' Phase belongs to
  a hero, so a spectator or a hero-less GM does not trip the advice.

**Affects:** api/ (`GET /games/public`, name reservations, 409 on a clash), app/ (`/games` browse screen, the
listing toggle on a Game page, `newGame` starts unlisted), data/game.json (`listedKey`, `browsePageMax`),
infra/ (the shared sparse `gsi1` index and its `dynamodb:Query` grant),
docs/adr/0008-public-games-and-unique-names.md, AGENTS.md. No rules text and no `data/` number changes:
`party.recommendedMax` stays 5.

---

### 2026-11-25 — Automate our own rules, don't become a VTT platform (VTTER-92)

**Decision:** Product scope for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

The app **deeply automates Emberreach's own rules**. It does **not** become a platform for running other games.

1. **In scope:** rules automation read from `/data` (VTTER-89), the side-based combat tracker (VTTER-36),
   a live shared table (VTTER-87), a shared roll log (VTTER-88), simple image-and-token maps (VTTER-85),
   a GM-only layer with editing during play (VTTER-90), and slabs (VTTER-91).
2. **Out of scope, deliberately:**
   - **Dynamic lighting and per-token vision.** Years of work, and pillar 4 says a grid isn't even required.
   - **3D terrain and sculpting.** Those competitors are whole game engines.
   - **A user scripting language** (Let's Role's JavaScript, Tabletop Simulator's Lua). We are one game, not an engine.
   - **A system builder for other RPGs.** Generalising costs us the rules automation, which is the only reason
     to pick this app over a general VTT.
   - **A content marketplace.** Slabs cover sharing at a fraction of the cost.
   - **Built-in video or voice.** Tables already use Discord.
3. **Players never buy in to join.** A GM's Game is free to join for every member, and nothing at the table is
   gated behind a player's own purchase or subscription.

**Why:**
- A competitive review on 2026-11-25 of Roll20, Foundry VTT, Fantasy Grounds, Beyond Tabletop, Game Master Engine,
  Tableplop, Tabletop Simulator, TaleSpire, Let's Role and Role found that every one of them is a *general* VTT:
  they automate nobody's rules in particular, because they can't. We own the rules **and** the code, and `/data`
  is already machine-readable, so resolving a Test, a Glancing hit, Grit, a d6 Wound Bane and Momentum
  automatically is the one thing no competitor can do for this game. It is the app's reason to exist.
- The excluded features are where general VTTs spend their years. Lighting in particular was still producing
  bugfixes in Roll20's 2026 changelog, and it buys us nothing that our pillars ask for.
- Writing the boundary down keeps later work from drifting into rebuilding Roll20 badly.

**Affects:** README.md (roadmap), AGENTS.md (companion app scope), and the VTTER-46 backlog.
No rules text and no `data/` changes.

---

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
- Accepting both lengths is what keeps the "never changes" promise in [ADR 0005](adr/0005-profile-and-adventures.md).

**Affects:** api/src/profile.ts (`newPlayerId`, `isPlayerId`), app/src/engine/game.ts (`cleanPlayerId`),
app/src/api/types.ts, app/src/GamePage.tsx (placeholder and error text), docs/adr/0005-profile-and-adventures.md.
No rules text and no `data/` number changes.

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
