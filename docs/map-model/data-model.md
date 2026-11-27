# Map data model (VTTER-86)

The stored shape of a map, its limits, how it is versioned and where it lives. Back to the [map model](README.md).
The decision record is [ADR 0011](../adr/0011-layered-map-objects.md).

## Two things, kept apart

| | The **map** | The **table state** |
|---|---|---|
| Is | What the author made: terrain, walls, doors, traps, foe start positions | What has happened in one Game: where Entities are, what the party has explored, which hidden things are revealed, which `once` triggers have fired |
| Written by | The author, in the editor | The Game, during play (VTTER-87) |
| Stored | One item per map under the author (below) | With the Game's live state (VTTER-87) |
| Shared | Read by a Game's members only through the Game, like the adventure (ADR 0006) | Per Game |

One map can be played by many Games, and a Game never edits the author's map. The GM edits the map during
play (VTTER-90) through the editor, not through table state.

## Coordinates

- **Hexes** are flat-topped, in a rectangle `width × height`. A hex is stored as one integer, its **index**
  `i = row × width + col` (0 to 9,999 on a Large map). The engine converts to axial `q,r` for distance and
  neighbours. Distance in hexes is distance in zones.
- **Edges:** each hex owns three of its six edges: north (`d = 0`), north-east (`d = 1`) and south-east (`d = 2`).
  Edge index `e = d × (width × height) + i`. Every edge has exactly one index, and a straight wall along a row is
  one run (the north edges of hexes 310 to 317 are edges 310 to 317).
- **Locations** (`at`) are **runs**: a flat list `[start, length, start, length, …]` over hex indexes, or over edge
  indexes when the object is an `edge` Route. A 200-hex forest is about 20 runs, or 40 numbers.

## The shape

```ts
type Kind = 'space' | 'enclosure' | 'route' | 'portal' | 'static' | 'entity'

interface MapDoc {
  schemaVersion: 1
  id: string              // UUID, bare (the table key adds the map# prefix)
  name: string
  size: 'small' | 'medium' | 'large'   // from data/map.json
  width: number
  height: number
  heights?: Uint8Array    // optional: one storey value per hex (DynamoDB binary, 1 byte per hex)
  objects: MapObject[]
  updatedAt: string
}

interface MapObject {
  id: string              // short and map-local: "o1", "o2" …
  kind: Kind
  type: string            // from the type catalog in data/map.json: "forest", "room", "river", "door"
  name?: string           // the author's label: "Forge corridor"
  at: number[]            // runs of hex indexes, or of edge indexes for an edge Route and a Portal in one
  line?: 'fill' | 'edge'  // Routes only. fill = occupies hexes (river); edge = lies on edges (wall)
  ends?: [number, number] // Routes only, optional: start and end hex (a river's source and mouth)
  on?: string             // the object this one sits on: the layer stack
  links?: string[]        // objects this connects to: a Portal to the wall or river it crosses
  covers?: string[]       // property names this hides beneath it, for an Entity on it (a bridge: ["deep-water"])
  z?: number              // storey, for Enclosures above or below ground (0 = ground)
  props?: Record<string, PropValue>   // names and values checked against data/map.json
  gmOnly?: boolean
  note?: string           // GM-only text
  ref?: { foe?: string; npc?: string } // Entities only: a start position for an adventure's foe or NPC
}

type PropValue = boolean | number | string | { [k: string]: boolean | number | string }
```

Heroes never appear on the stored map. An Entity on a map is a **start position** for a foe or NPC from the
adventure. Live positions are table state.

## Example: the Forge corridor

Scene 3 of *The Soot King's Hearth* ([GM guide §5](../../rules/gm-guide.md)) on a small map (30 × 30, so 900 hexes
and edge offsets of 900 per direction). The corridor is rows 10–12, columns 10–17. Its wall runs along the top and
bottom (north edges of rows 10 and 13) and closes the east end (the north-east and south-east edges of column 17); the west end stays
open. The door is in the east wall. The full walk-through is paper test (d) in [paper-tests.md](paper-tests.md).

```json
{
  "schemaVersion": 1,
  "id": "7d1f…",
  "name": "Forge corridor",
  "size": "small",
  "width": 30,
  "height": 30,
  "objects": [
    { "id": "o1", "kind": "enclosure", "type": "cavern", "name": "The Forge vent", "at": [0, 900] },
    { "id": "o2", "kind": "space", "type": "rock-floor", "on": "o1", "at": [0, 900] },
    { "id": "o3", "kind": "enclosure", "type": "corridor", "name": "Forge corridor", "on": "o1",
      "at": [310, 8, 340, 8, 370, 8] },
    { "id": "o4", "kind": "route", "type": "wall", "line": "edge", "on": "o3",
      "at": [310, 8, 400, 8, 1217, 1, 1247, 1, 1277, 1, 2117, 1, 2147, 1, 2177, 1], "props": { "blocks": "move+sight" } },
    { "id": "o5", "kind": "portal", "type": "door", "on": "o3", "links": ["o4"], "at": [1247, 1],
      "props": { "blocks": "move+sight" } },
    { "id": "o6", "kind": "space", "type": "steam-vents", "name": "Steam vents", "on": "o3",
      "at": [342, 3], "gmOnly": true,
      "props": {
        "hidden": 12,
        "hazard": { "damage": "2d6", "dodge": 12, "on": "enter", "every": "each" }
      },
      "note": "Notice DC 12 to spot. Dodge DC 12 or 2d6." },
    { "id": "o7", "kind": "entity", "type": "foe", "on": "o3", "at": [377, 1],
      "ref": { "foe": "Hollow Sentry" }, "gmOnly": true }
  ],
  "updatedAt": "2026-11-26T00:00:00Z"
}
```

## Size and limits

DynamoDB caps one item at **400 KB**. The numbers below assume a Large 100×100 map.

| Part | Size | Why |
|---|---|---|
| Fixed fields | < 1 KB | |
| `heights` | **10 KB** (10,000 hexes × 1 byte, binary) | Optional, only when the author uses height |
| One object | about **150–400 bytes** | id, kind, type, a few props, a few runs |
| 500 objects (the cap) | about **75–200 KB** | Room to spare under 400 KB |
| One object **per hex** instead | about **600 KB** (10,000 × ~60 bytes) | Over the limit. Environment spaces cover areas for this reason |

Limits, all in `data/map.json` so they change without code (VTTER-74 adds the file):

| Limit | Value | Enforced by |
|---|---|---|
| Objects per map | 500 | API, on save |
| Properties per object | 16 | API |
| `on` chain depth | 8 | API (also refuses loops) |
| `name` / `note` length | 80 / 1,000 characters | API |
| Runs per object | 2,000 numbers | API |
| Whole item | 350 KB | API refuses the save with a clear message, leaving headroom under 400 KB |

The API also checks: every `kind`, `type` and property name is in `data/map.json`; every `on`, `links` id exists in
the same map; every index is inside the grid; `line` and `ends` only on Routes; `ref` only on Entities.

## Versioning

- `schemaVersion` starts at **1**.
- The app and API **migrate on read** with one pure function per step (`1 → 2`), the same way the character sheet
  converts the old `testBonus` field (decisions 2026-11-24). Saves always write the latest version.
- A new property or type is a `data/map.json` change, not a schema change. A schema change is only a change to the
  shape above.
- A map saved by a newer app than the one reading it is refused with "update the app", never half-read.

## Storage

- **One item per map** in `vtter-game`, under the author: key `ownerId` (the author's Cognito `sub`) + `id` =
  `map#<uuid>`, with `kind: "map"` (CLAUDE.md: every item is keyed `<kind>#<id>` and carries `kind`).
  The prefix is storage only: the app, chapters and Games use the bare UUID.
- Lists are native DynamoDB lists and maps, never JSON strings. `heights` is a native binary attribute.
- A user's own maps are listed with `begins_with(id, "map#")` in their partition. No `gsi1` entry: maps are never
  listed across partitions.
- Members read a Game's map **through the Game**, the same as its adventure (ADR 0006). The map item's key never
  leaves the API.

## What each reader receives

| Reader | Receives |
|---|---|
| The author, in the editor | The whole map, including `gmOnly` objects and notes |
| The GM of a Game | The whole map, plus the Game's table state |
| A player in a Game | **Only** hexes the party (or, in per-token vision, their own hero) can see now or has explored, and only objects in them that are not `gmOnly` (unless revealed in table state). Entities only where the party can see them **now**. No `note` fields |
| A friend reading a `friends`-visible adventure ([ADR 0009](../adr/0009-friends.md)) | The chapter's map read-only, behind the same both-sides-`accepted` check and the same single 404 for every refusal. Like the adventure text, it is the author's material, so GM-only objects are included. An author who also runs a Game for that friend keeps the adventure `private` |
| Anyone else | Nothing |

The **API** builds the player view. The client never receives what it must not show, so opening dev tools reveals
nothing ([ADR 0011](../adr/0011-layered-map-objects.md)).

Table state for fog of war: one **explored** bitset per Game and map in party vision, or one per hero in per-token
vision. 10,000 bits = **1.25 KB** each on a Large map. The vision mode is a Game setting, not part of the map.

## Slabs (VTTER-91)

A slab is a copied region: the same `MapObject` shape, cut to the selected hexes and renumbered from 0, with
`gmOnly` objects, notes, Entities and anything identifying the author removed. It is written as text
(`ERSLAB1:` + base64url of the compressed JSON). Pasting validates it exactly like a save, against
`data/map.json` and the limits above, and refuses anything malformed.
