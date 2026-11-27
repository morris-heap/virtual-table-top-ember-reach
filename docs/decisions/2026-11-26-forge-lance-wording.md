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
