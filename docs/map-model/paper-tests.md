# Paper tests (VTTER-86)

Four places, built with the model on paper, to prove it needs **no special cases**. Each test uses only the six
kinds, the fields in the [data model](data-model.md) and the [property catalog](properties.md), resolved in the
catalog's order: collect, inherit, shelter, cover, stack. Back to the [map model](README.md).

---

## (a) One small world, nested down to one room

*The Reach › Brindlecross › the shrine › the Forge vent › the Forge corridor*, from
*The Soot King's Hearth* ([GM guide §5](../../rules/gm-guide.md)).

| id | Kind | Type | `on` | Notes |
|---|---|---|---|---|
| r | Enclosure | realm | — | *The Reach*. `weather`: *ash-fall* (describes: grants nothing yet) |
| v | Enclosure | village | r | *Brindlecross*. No wall Route: its edge is a border, not a wall |
| g | Environment space | grassland | v | The village ground |
| s | Enclosure | shrine | v | Walls are an `edge` Route; `shelter: [weather]` |
| d | Portal | door | s | Links to the shrine's wall |
| vent | Enclosure | cavern | s | `z: -1`. *The Forge vent*, 30 m down |
| st | Route | shaft | vent | `fill`, `ends` at the shrine floor and the cavern floor. `difficult` |
| c | Enclosure | corridor | vent | *The Forge corridor* (paper test d) |

**Check:** a hero in the corridor collects `c → vent → s → v → r`. The realm's ash-fall reaches the village (inherit)
and stops at the shrine (shelter). The corridor is two Enclosures deep under a shelter, so it gets no weather.
The climb down is a Difficult `fill` Route, so it costs 2 zones per hex. The GM guide's group Athletics Test
(DC 12) is the scene's Test, not a map rule.

**At map scale:** VTTER-74 holds one map per chapter, so the realm and village are Enclosures with a single hex
each on the chapter map, or they live on a parent map later ("nested worlds" in the vision). Either way, `on` is the
only link needed.

**Special cases needed: none.**

---

## (b) Mud, fire and a snowstorm on one hex

| id | Kind | Type | `on` | Props |
|---|---|---|---|---|
| k | Enclosure | valley | — | `weather`: *snowstorm* = `difficult` + `obscured` |
| m | Environment space | mud | k | `difficult` |
| f | Environment space | brush-fire | k | `burning` (at the same hex as the mud) |

A hero enters the hex:

| Property | Sources | Stack rule | Result |
|---|---|---|---|
| `difficult` | mud, snowstorm | `max` | **Entering costs 2 zones** (core §6.3; not 3, by the cap) |
| `obscured` | snowstorm | `max` | **Bane** on ranged attacks and sight-based Notice here |
| `burning` | brush-fire | `max` | The hero gains **Burning** (§6.9): 1d6 at the start of their turn until they spend an Action |

With Speed 2, entering this hex uses the hero's whole Move, so Dash is needed to get out the same turn.
If the valley had a stone hut with `shelter`, a hero inside it would lose the snowstorm's `difficult` and `obscured`
but keep the hut's own floor.

**Special cases needed: none.** Three overlapping spaces and one weather bundle resolve with three stack rules.

---

## (c) A river with a bridge

| id | Kind | Type | `on` | Props / fields |
|---|---|---|---|---|
| w | Environment space | meadow | — | — |
| rv | Route | river | w | `line: fill`, `ends: [source, mouth]`, `deep-water: 12` |
| b | Portal | bridge | rv | `links: [rv]`, `covers: ["deep-water"]`, at the two river hexes it spans |

| Entity | Stands on | What applies at a bridge hex |
|---|---|---|
| A hero crossing the bridge | b (the default when a Portal spans the hex) | The bridge covers `deep-water`, so the hex is open ground: 1 zone |
| A hero swimming under it | rv | Not standing on the bridge, so nothing covers: Difficult + Athletics vs DC 12 (`deep-water`, *needs a rule*) |

A ford is the same river with a `fill` Route `type: ford` on it that `covers: ["deep-water"]` and adds `difficult`.
A fence is the other kind of line: `line: edge` with `blocks: move` on the edges between hexes, and a gate is a Portal on
one of those edges.

**Special cases needed: none.** A bridge is a Portal that covers. The model has no "bridge" rule.

---

## (d) The hidden steam vent trap

*The Forge corridor*, scene 3: "A steam vent trap fills the hall: DC 12 Notice to spot it, dodge vs DC 12 or take
2d6." The stored map is the example in the [data model](data-model.md#example-the-forge-corridor).

| id | Kind | Type | Props |
|---|---|---|---|
| o6 | Environment space | steam-vents | `gmOnly`, `hidden: 12`, `hazard: { damage: 2d6, dodge: 12, on: enter, every: each }` |

Play, with the trigger runtime (Later) and your 2026-11-26 rule: **the app prompts the player, and the GM can undo**.

1. The party enters the corridor. The players' map shows the corridor floor. The vents are `gmOnly`, so the API
   doesn't send them.
2. The GM taps **Ask for Notice** (the vents are `hidden: 12` and the party is Near). Each player rolls Notice vs
   DC 12. *Strong success / success:* the vents are revealed to everyone (table state), and the party goes round them.
3. Nobody spots them. Kestrel moves onto a vent hex. The app **stops the move** at that hex and asks Kestrel's player:
   *"Steam vent! Dodge vs DC 12."* The player rolls **d20 + Dodge**.
4. The app applies §6.5: success, nothing; success at a cost, half of 2d6; failure, 2d6; a Natural 1, full damage
   plus any "on a critical" effect. The player rolls the 2d6 damage too, because players roll all dice.
5. The vents are now **revealed** (table state), because a trap that fires is seen.
6. The GM can **undo**, for example if the GM rules the vent was already spent. Undo restores the Grit and position
   from before step 3.
7. `every: each` means the next hero onto a vent hex rolls too. A one-shot trap would say `once`.

**Special cases needed: none.** The trap is an Environment space with two catalog properties. No Entity is needed
because it doesn't act on a turn. A blade that swings every round would be an Entity acting in the Foes' Phase,
and the heroes would still roll the dodges.

---

## What the tests changed in the model

- **Who a cover applies to** needed a rule: covers apply to an Entity standing on the covering object (test c).
  Added to [properties.md](properties.md), step 4.
- **Revealed** and **fired** are table state, not map data (test d), so one map can be played by many Games.
  Added to [data-model.md](data-model.md).
- **Weather as a bundle** of other properties (test b) avoided a separate stacking rule for weather.
