### 2026-11-26 — Enemies and NPCs in an adventure, and a library to pick from

**Decision:** Product rule for the companion app. No change to the d20 rules, so the rules stay at **v0.2** (core v0.3).

1. **An adventure carries two lists, `enemies` and `npcs`**, and a scene points at them by id: `enemies` (an id and a count)
   and `npcs` (ids). A scene no longer has free-text foes. This is the model going forward: authors pick from the library
   or create their own, and existing test adventures were not migrated.
2. **An enemy is the block in [GM guide §2](../../rules/gm-guide.md):** name, tier (minion, standard, elite, boss),
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
