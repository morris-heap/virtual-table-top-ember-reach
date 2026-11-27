# Inventory of the cartography program (VTTER-86)

Everything the cartography program defines, mapped to the Emberreach model and marked:

- **keep:** use as is, as a type in `data/map.json`
- **fix:** use, after the change in the Notes column (a new kind, a spelling, a rename, a duplicate removed)
- **later:** fits the model but waits for a later phase or another era
- **drop:** not a map type (a folder heading, a duplicate, or outside the setting)

Sources, read on 2026-11-26 from the program's Drive folder `SDE/graphics`: `rpgc/SceneTypes.xml` (place types and
their *Substance*), `rpgc/SceneElements.cs` (the element list), `rpgc/Styles.xml` (marker styles).
Back to the [map model](README.md).

**Originality (open question 9):** every entry is a generic real-world noun (castle, river, nebula) or a generic
label (Team, Hostile). Nothing comes from another game's names, monsters, spells or setting. Only the room names are
renamed, because "family room" and "living room" are modern words that don't fit the setting.

## Elements

| Program | Model | Mark | Notes |
|---|---|---|---|
| Surface | Environment space / Enclosure | fix | Split: ground conditions → Environment space; regions and storeys → Enclosure |
| Enclosure | Enclosure | keep | |
| Route | Route | keep | Any line, patrol paths included (`line: fill` or `edge`) |
| Portal | Portal | keep | |
| Markers | Entity | fix | Renamed. Static props get their own kind, Static Object (from Heath's notes) |
| Meta Data | object fields (`name`, `note`, `gmOnly`) | fix | |
| Materials (Substance) | Environment space **type** + default properties | fix | See *Substances* below |
| Grids: Hex | hex grid | keep | 1 hex = 1 zone |
| Grids: Square | — | later | Maybe tier |
| Eras: Fantasy | the setting | keep | |
| Eras: Modern, Future | — | later | Maybe tier |
| Scene media: Audio, Video, Image, Document, Description, Tool, Cue | — | drop | Story-scene handouts, not map objects. Candidates for the chapter designer (VTTER-75) |

## Place types (`SceneTypes.xml`)

### Building

| Program (kind) | Model kind | Mark | Notes |
|---|---|---|---|
| Building (Enclosure) | Enclosure | keep | Substance *concrete* → `stone` |
| Floor (Surface) | Enclosure | fix | A storey: `z` = its level. Its floor is an Environment space |
| Stairs (Route) | Route `fill` | keep | Connects storeys (`ends` on two `z` levels) |
| Elevator (Route) | Route `fill` | later | Modern. A fantasy **lift** (a rope-and-pulley platform) can reuse it |
| Escalator (Route) | — | drop | Modern only |
| Room (Enclosure) | Enclosure | keep | |
| Bed Rooom (×2) | Enclosure | fix | Spelling (*Bedroom*); listed twice in the source, keep one |
| Family Rooom | Enclosure | fix | Rename **Hall** |
| Living Rooom | Enclosure | fix | Rename **Common room** |
| Bath Rooom | Enclosure | fix | Rename **Bathhouse** |
| Kitchen | Enclosure | keep | |
| Door (Portal) | Portal | keep | `blocks: move+sight` while shut |
| Secret Door | Portal | keep | `hidden` |
| Trap Door (×2) | Portal | fix | Listed under both Door and Opening; keep one |
| Gate | Portal | keep | `blocks: move` (you see through it) |
| Portculis | Portal | fix | Spelling (*Portcullis*). `blocks: move` |
| Opening (Portal) | Portal | keep | No `blocks` |
| Hole | Portal | keep | |
| Arrow Slit | Portal | keep | `blocks: move` only |
| Window | Portal | keep | Substance *glass*. `blocks: move` |

### Buildings and Civil

| Program (kind) | Model kind | Mark | Notes |
|---|---|---|---|
| Buildings (Enclosure) | — | drop | A folder heading, not a place |
| Castle, Fortress, House, Hut | Enclosure | keep | |
| Civil (Surface) | — | drop | A folder heading |
| Building (under Civil) | — | drop | Duplicate of Building |
| Road (Route) | Route `fill` | keep | Substance *asphalt* → `packed-earth` |
| Trail (Route) | Route `fill` | keep | |
| Highway (Route) | Route `fill` | fix | Rename **Highroad** |
| Freeway (Route) | — | later | Modern |
| Parking Lot (Surface) | — | later | Modern |

### Regions

| Program (kind) | Model kind | Mark | Notes |
|---|---|---|---|
| Country (Surface) | Enclosure | fix | Rename **Realm**. No wall: a border |
| State (Surface) | Enclosure | fix | Rename **Province** |
| County (Surface) | Enclosure | fix | |
| City (Surface) | Enclosure | fix | Kind change |
| Villiage (Surface) | Enclosure | fix | Spelling (*Village*); kind change |
| Continent (Surface) | Enclosure | later | World maps |
| Island (Surface) | Enclosure | keep | Its ground is an Environment space |

### Terrain

| Program (kind) | Model kind | Mark | Notes |
|---|---|---|---|
| Terrain (Surface) | — | drop | A folder heading |
| Desert | Environment space | keep | `sand` |
| Forest | Environment space | keep | `difficult`, `cover`; dense forest also `blocks-sight` |
| Jungle | Environment space | keep | `difficult`, `cover`, `obscured` |
| Swamp | Environment space | keep | `difficult` |
| Mountain | Environment space | keep | `difficult`; height on the map's height grid |
| Valley | Environment space | keep | |
| Lake | Environment space | keep | `deep-water` |
| Pond (Route) | Environment space | fix | Wrong kind in the source: a pond is an area, not a line |
| Canyon (Route) | Route `fill` | keep | Height on the height grid |
| River (Route) | Route `fill` | keep | `deep-water`, `ends` |
| Underground (Surface) | Enclosure | fix | Kind change; `z` below 0 |
| Cavern (Surface) | Enclosure | fix | Kind change; its floor is an Environment space (`rock`) |
| Tunnel (Route) | Route `fill` | keep | |
| Planet Surface (Surface) | Enclosure | later | World maps |
| Ice Cap | Environment space | keep | `ice` |
| Ocean | Environment space | keep | `deep-water` |
| Sea | Environment space | keep | `deep-water` |

### Sky and space (Maybe)

| Program | Mark | Notes |
|---|---|---|
| Terrestrial, High Orbit, Low Orbit, Upper Atmosphere, Lower Atmosphere | later | Maybe tier. Enclosures with `z` |
| Universe, Galaxy, Nebula, Solar System, Black Hole | later | Maybe tier. Enclosures |
| Star, Red Giant, White Dwarf, Pulsar, Quasar, Gas Giant | later | Maybe tier. Static Objects with `burning` |
| Planet, Moon, Asteroid, Comet, Meteor | later | Maybe tier. Enclosures (you can land) or Static Objects (you can't) |
| Asteroid Belt (Route) | later | Maybe tier. Route `fill`, `difficult` |
| Satelite (Route) | later | Spelling (*Satellite*). In the source it groups the bodies that orbit; as a type it is an orbit Route |

## Substances

Each becomes an **Environment space type** with default properties the author can change.

| Program | Type | Mark | Default properties |
|---|---|---|---|
| dirt | `earth` | fix | — |
| rock | `rock` | keep | — |
| sand | `sand` | keep | `difficult` (deep sand) |
| forest | `forest` | keep | `difficult`, `cover` |
| jungle | `jungle` | keep | `difficult`, `cover`, `obscured` |
| swamp | `swamp` | keep | `difficult` |
| ice | `ice` | keep | `difficult` |
| snow | `snow` | keep | `difficult` |
| water | `water` | keep | `deep-water` (shallow water is `difficult` instead) |
| sea | `water` | fix | Merged with water |
| fire | `fire` | keep | `burning` |
| concrete | `stone` | fix | Fantasy setting |
| steel | `iron` | fix | Fantasy setting |
| glass | `glass` | keep | For Portals (windows) |
| asphalt | `packed-earth` | fix | Fantasy setting |
| clear | — | drop | Means "no substance"; an object without a type has none |
| sky, space | — | later | Maybe tier |

## Marker styles (`Styles.xml`)

| Program | Model | Mark | Notes |
|---|---|---|---|
| Team (blue) | Entity side **Hero** | fix | Renamed to the rules' word |
| Hostile (red) | Entity side **Foe** | fix | Renamed to the rules' word |
| Friendly (green) | Entity side **Friendly** (NPC) | keep | |
| Neutral (grey) | Entity side **Neutral** (NPC) | keep | |

The app keeps the colour idea and takes the actual colours from its own theme.

## Traps (added 2026-11-27, VTTER-129)

Not from the cartography program: added at the author's request. Each is a **Static Object** type that brings `hazard`
and `hidden` as defaults (a trap that fires on a trigger is a property, layered model §10). The numbers are in
`data/map.json`, anchored on the GM guide's steam vent (Notice DC 12, dodge DC 12, 2d6).

| Type | Hidden (Notice DC) | Hazard: damage · dodge DC · trigger · frequency |
|---|---|---|
| Pressure plate | 12 | 1d6 · 12 · enter · each (link it to what it sets off) |
| Spike pit | 12 | 2d6 · 12 · enter · each |
| Snare | 12 | 1d4 · 12 · enter · once |
| Dart trap | 12 | 1d6 · 12 · enter · each |
| Falling block | 16 | 3d6 · 16 · enter · once |

They fire during play once map triggers (VTTER-110) are built. Until then they are placed, configured and kept out of
a player's view.
