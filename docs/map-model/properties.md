# Map properties (VTTER-86)

A **property** is a named value on a map object, defined once in `/data` (as `data/map.json` when VTTER-74 builds it)
and never invented per map. This is the starting catalog. Back to the [map model](README.md).

Every property says:

- **Acts** or **describes.** An acting property is a rule the app applies. A describing one is shown, not applied.
  *Now* is what VTTER-74 builds; *Later* is a backlog story.
- **When** it acts (its trigger) and **who** it affects.
- **What happens**, using only the Tests, DCs, Boons, Banes and conditions already in the
  [core rules](../../rules/core-rules.md). A property never adds a new kind of roll.
- **How to avoid it.**
- **How it stacks** when several layers give the same hex the same property.
- **Rule status.** "Core §x" means the rule already exists. "Needs a rule" means the effect is a proposal, and the
  story that makes it act must take it through `/change-rule` first.

## How properties combine

Work out the properties at one hex, for one Entity, in this order:

1. **Collect** every object at the hex, and every Enclosure above them on the `on` chain.
2. **Inherit:** a property on an Enclosure applies to everything inside it, unless something stops it (step 3).
3. **Shelter:** an Enclosure with `shelter` stops the **weather** group from the layers above it. Nothing else is
   stopped implicitly.
4. **Cover:** an object with `covers` (a bridge, an upper storey) removes the listed properties from the objects
   beneath it, **for an Entity standing on it**. A swimmer under the bridge is standing on the river, so the river
   still applies.
5. **Stack** what is left, property by property, with that property's rule:

| Stack rule | Means | Used by |
|---|---|---|
| `max` | The highest value wins. For yes/no properties, any "yes" wins | `difficult`, `impassable`, `blocks-sight`, `obscured`, `cover`, `burning` |
| `top` | The value from the highest layer wins | `deep-water`, `hidden` |
| `each` | Every source applies separately | `hazard`, `weather`, `use` |
| `sum` | Values add up, then the catalog cap applies | *(none yet; reserved for describing numbers like `temperature`)* |

`difficult` stacks by `max`, which is how the rule's cap works: mud *and* a snowstorm still cost 2 (core rules §6.3).

GM-only objects still act. A hidden trap fires on a hero who hasn't spotted it. GM-only only controls who
**receives** the object.

## The catalog

### Movement

| Property | Values | Acts | When · who | What happens | Avoid it | Stack | Rule status |
|---|---|---|---|---|---|---|---|
| `difficult` | yes | **Now** | `enter` · any Entity | Entering costs **2 zones** of Speed (`movement.difficultCost`) | Go round it; a bridge or path that `covers` it | `max` | Core §6.3 (v0.4) |
| `impassable` | yes | **Now** | `enter` · any Entity | You can't enter the hex | A Portal through it (a door in a wall) | `max` | Core §6.3 (v0.4) |
| `blocks` (on an `edge` Route) | `move`, `sight`, or both | **Now** (move), Later (sight) | crossing the edge · any Entity | You can't cross the edge (a wall, a fence). A Portal on the edge lets you through | A Portal; climbing (see `height`) | `max` | Core §6.3: an edge you can't cross is Impassable for that crossing |
| `deep-water` | a DC (from `difficulties`) | Later | `enter` · any Entity | The hex is Difficult, and you make an **Athletics** Test vs the DC to enter. On a failure you stay where you are and your Move ends | A bridge that `covers` it; a boat | `top` | Needs a rule. Heavy armor already gives a Bane on swimming (core §7.2) |
| `height` (map grid) | storeys, per hex | Later | crossing to a hex 1+ higher · any Entity | That edge is a **cliff**: climbing up is Difficult and needs an **Athletics** Test (Standard, DC 12); a failure ends your Move | Stairs or a ramp (a `fill` Route) | n/a | Needs a rule |
| `patrol` (on a Route) | `loop` or `there-and-back`, and the Entities assigned | Later | Foes' Phase · assigned foes | The foe moves along the Route on its turn unless the GM says otherwise | Kill, distract or avoid the foe | n/a | No dice; a GM tool |

### Danger

| Property | Values | Acts | When · who | What happens | Avoid it | Stack | Rule status |
|---|---|---|---|---|---|---|---|
| `hazard` | damage (`2d6`), dodge DC, trigger (`enter` / `start-of-turn` / `touch`), frequency (`each`, `once`, `once-per-entity`, `once-per-round`) | Later | its trigger · the Entity that sets it off | The player rolls a **dodge** vs the DC (§6.5): success avoids it, success at a cost takes half, failure takes full | Spot it first (`hidden`); go round; disarm it with a Test the GM calls | `each` | Core §6.5. The GM guide's steam vent uses exactly this |
| `burning` | yes | Later | `enter`, `start-of-turn` · any Entity in the hex | You gain the **Burning** condition (§6.9) | Don't enter; spend an Action to put it out; Emberkin halve the damage | `max` | Core §6.9 |
| `hidden` | a Notice DC | Later | while unspotted · the party | The object is **GM-only until spotted**. When the party is Near, the GM can ask for a **Notice** Test vs the DC; a success reveals it to everyone. If it fires first, it is revealed when it fires | A good Notice roll | `top` | Core §2 (a Test vs DC) |

### Sight and cover

| Property | Values | Acts | When · who | What happens | Avoid it | Stack | Rule status |
|---|---|---|---|---|---|---|---|
| `blocks-sight` | yes | Later (fog of war) | always · the party's sight | Sight stops at this hex or edge. Hexes behind it stay in fog of war until a hero sees them (in per-token vision, that hero's player only) | Move round it; open the door | `max` | Fog of war (decisions 2026-11-26). No dice |
| `obscured` | yes | Later | always · anyone looking into or through the hex | **Bane** on ranged attacks and on Notice Tests that rely on sight | Get to Reach; wait for it to clear | `max` (one Bane, however many layers) | Core §2 Boons/Banes; needs a rule to make it automatic |
| `cover` | yes | Later | always · an Entity in the hex | You can **Hide** here. Talents that need "cover nearby" (Vanish) work | — | `max` | Core §6.2 Hide, §4.6 Vanish |

### Weather and shelter

| Property | Values | Acts | When · who | What happens | Avoid it | Stack | Rule status |
|---|---|---|---|---|---|---|---|
| `weather` | a name and the properties it grants, for example *snowstorm* = `difficult` + `obscured` | Later | always · everything below it | Applies the granted properties, which then stack by their own rules | An Enclosure with `shelter` | `each` | Follows the granted properties |
| `shelter` | the groups it stops (`weather`) | Later | always · everything inside | Stops the named group from the layers above | — | n/a | No dice |

### Things to use

| Property | Values | Acts | When · who | What happens | Avoid it | Stack | Rule status |
|---|---|---|---|---|---|---|---|
| `use` (on a Static Object) | an Attribute or Skill, a DC, and the effect as text | Later | `touch` (your Action) · the Entity using it | The app offers the Test; the player rolls; the GM applies the effect | — | `each` | Core §2. The Soot King's cold ember (Spirit, DC 14) is one |

### Describing only (Maybe)

| Property | Values | Notes |
|---|---|---|
| `gravity` | text (*low*, *none*, *crushing*) | From Heath's list. Shown to the GM; no rule |
| `temperature` | text or a number | From VTTER-84. Shown only |
| `sound` | text (*echoing*, *muffled*) | From VTTER-84. Shown only. A later Stealth or Notice rule could use it |

## Where each kind gets its properties

| Kind | Typical properties |
|---|---|
| Environment space | `difficult`, `impassable`, `deep-water`, `hazard`, `burning`, `hidden`, `blocks-sight`, `obscured`, `cover` |
| Enclosure | `weather`, `shelter`, `blocks-sight`. Its walls are `edge` Routes with `blocks` |
| Route | `blocks` (edge), `deep-water` (a river), `patrol`, `difficult` (a scree slope) |
| Portal | `covers`, `hidden` (a secret door), `hazard` (a trapped door), `blocks` while shut |
| Static Object | `use`, `cover`, `impassable`, `blocks-sight`, `hidden`, `hazard` |
| Entity | none from this catalog. An Entity has its own sheet or stat block, plus `sight` (zones) for fog of war |

The type catalog gives each type its default properties (a Swamp is `difficult`; a Wall is an `edge` Route with
`blocks: move+sight`). The author can change them per object.
