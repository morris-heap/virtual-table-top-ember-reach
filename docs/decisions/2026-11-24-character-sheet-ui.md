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
