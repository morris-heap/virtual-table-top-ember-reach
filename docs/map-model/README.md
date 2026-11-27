# The layered map model (VTTER-86)

What an Emberreach map is made of. The map editor (VTTER-74), map objects (VTTER-85), terrain (VTTER-84),
the GM-only layer (VTTER-90), fog of war, triggers and slabs (VTTER-91) are all built on this one model.

The idea comes from Heath's cartography program (C#, 2012–2015) and is used here with Heath's permission.
The program called a map a *scene*. Here a map is a **Map**, and **scene** keeps its story meaning (a beat in an
adventure chapter, VTTER-75).

| Document | Contains |
|---|---|
| This page | The vision (now, later, maybe) and the glossary |
| [properties.md](properties.md) | The property catalog: what each property does, when, to whom, and how it stacks |
| [data-model.md](data-model.md) | The JSON shape, size limits, versioning and storage |
| [paper-tests.md](paper-tests.md) | Four worked examples that prove the model needs no special cases |
| [inventory.md](inventory.md) | Every place type and material from the cartography program, marked keep, fix, later or drop |
| [../adr/0011-layered-map-objects.md](../adr/0011-layered-map-objects.md) | The architecture decision: storage, GM-only data and fog of war |
| [../mockups/map-editor.html](../mockups/map-editor.html) | The editor mockup, desktop and phone |

---

## Vision

**Everything on a map is an object.** Objects stack in layers (kingdom › village › shrine › room), point at each
other ("this door is in that wall"), and carry **properties**. A property either **describes** the place (for the
GM and players to read) or **acts** (the app applies a rule when an Entity meets it). Movement cost, hazards, cover,
sight and weather all come from properties, added up across the layers by one stacking rule per property.

Six kinds are enough to describe any place:

| Kind | Is | For example |
|---|---|---|
| **Environment space** | one or more hexes sharing area properties | forest, swamp, ice, ocean, rubble, a steam-filled hall |
| **Enclosure** | a group of spaces with a boundary; it defines the playable area and can shelter what's inside | kingdom, village, building, storey, room, cavern |
| **Route** | a line through hexes or along hex edges, with an optional start and end | river, road, fence, wall, stairs, patrol path |
| **Portal** | a way through or across one Enclosure edge or Route | door, secret door, gate, window, bridge |
| **Static Object** | a fixed thing at one or more hexes, which may offer actions | tree, chair, statue, the cold ember |
| **Entity** | anything that acts on a turn | hero, foe, NPC, a trap that acts by itself every round |

The first five are the map. Entities move across it.

**The pillars still hold.** Players roll all the dice: when a hero walks onto a hidden trap, the app asks that
player to roll the dodge, and the GM can undo it. Properties only use Tests, DCs, Boons and Banes that are already in
the [core rules](../../rules/core-rules.md). A property never invents a new kind of roll.

### Now (VTTER-74 builds this)

- Hex maps, **1 hex = 1 zone** (core rules §6.3). Small 30×30, Medium 50×50, Large 100×100.
- Environment spaces, Enclosures, Routes, Portals and Static Objects, painted by hand. Start and exit markers are
  Static Objects of type `start` and `exit`.
- The **acting** properties for movement: `difficult`, `impassable`, and `edge` Routes that block crossing.
- All other properties stored and shown as **describing** text, so an author can write them now.
- `gmOnly` on any object, stripped from players' responses by the API.
- Save, load, rename and delete; one map per chapter.

### Later (backlog stories under VTTER-46)

- **Trigger runtime** (VTTER-110): `hazard`, `hidden`, `burning` and `weather` act. The app asks the player to roll, and the GM can undo.
- **Fog of war** (VTTER-111): sight over `blocks-sight`, in **party vision** or **per-token vision**, the GM's toggle per Game.
  The GM sees everything and can view as the party or any hero. Needs the live shared table (VTTER-87).
- **Entities on the map** during a Game (VTTER-112), with Reach, Near and Far measured in hexes.
- **Height and cliffs** (VTTER-113): the height grid acts (climbing costs, falling).
- **Patrol Routes** (VTTER-114) that foes follow in the Foes' Phase.
- **Nested worlds** (VTTER-114): one Enclosure opens its own map (kingdom → village → building).
- **Generators:** cave, rooms-and-corridors and maze come with VTTER-74; wilderness later.
- **Slabs** (VTTER-91): copy a region as text and paste it into another map.

### Maybe

- Modern and space-era place types from the cartography program (freeway, orbit, nebula).
- `gravity`, `sound`, `temperature` as acting properties.
- Square grids alongside hex.

### Never (locked)

Dynamic lighting (light sources, bright and dim light), 3D terrain and sculpting, and a user scripting language.
See [decisions](../decisions.md), 2026-11-25 and its 2026-11-26 amendment.

---

## Glossary

Capitalised terms are game terms. Use them exactly. Don't add synonyms.

| Term | Means | Not to be confused with |
|---|---|---|
| **Map** | One saved hex grid and the objects on it. Attached to one chapter. | *scene*, a story beat |
| **Hex** | One cell of the map. **1 hex = 1 zone.** Written as axial coordinates `q,r`. | *square* (the rules' "1 zone ≈ 6 squares" is for battle mats, not maps) |
| **Edge** | The side shared by two neighbouring hexes. An `edge` Route (a wall, a fence) lies on edges. | |
| **Object** | Anything on a map. Has a kind, a type, properties, a location and links. | |
| **Kind** | One of the six: Environment space, Enclosure, Route, Portal, Static Object, Entity. Fixed by the model. | *type* |
| **Type** | The author-facing label from the type catalog: Forest, Room, River, Door. Picks a kind and default properties. | *kind* |
| **Property** | A named value on an object, defined once in `/data`: `difficult`, `hazard`, `shelter`. | |
| **Acts** | A property the app applies as a rule (movement cost, a trap's dodge). | |
| **Describes** | A property that is only shown to the GM and players (gravity, temperature). | |
| **Trigger** | When an acting property fires: `enter`, `leave`, `start-of-turn`, `touch`. | |
| **Layer** | An object's place in the stack, given by `on` (the object it sits on). | *Map* |
| **Stack** | How the same property from several layers combines: `sum`, `max` or `top`. Each property names its rule. | |
| **Cover** | A Portal or upper storey hiding the properties beneath it (a bridge covers the river's `deep-water`). | the `cover` property (protection from attacks) |
| **Shelter** | An Enclosure property that stops weather from the layers above reaching inside. | |
| **Explored** | A hex the party (or, in per-token vision, that hero) has seen at least once in this Game. Players keep seeing explored terrain, but not Entities in it. | |
| **GM-only** | An object only the GM receives. Hidden even inside the party's sight until the GM reveals it. | fog of war |
| **Fog of war** | Hexes the party hasn't seen yet. Players don't receive them. | GM-only |
| **Party vision** / **Per-token vision** | The GM's per-Game choice: every player sees what any hero sees, or each player sees only what their own hero sees | |

The cartography program and Heath's notes use some other words. They map like this:

| Old word | Use |
|---|---|
| Scene (the whole map) | **Map** |
| Surface | **Environment space** (ground conditions) or **Enclosure** (regions and storeys) |
| Marker, Token | **Entity** |
| Prop, Static object | **Static Object** |
| Substance, Material | the Environment space's **type** and its properties |
| DM | **GM** |
