# ADR 0011: The layered map object model, GM-only data and fog of war

- **Status:** Accepted (2026-11-26).
- **Jira:** VTTER-86 (in VTTER-46, UI / UX). Shapes VTTER-74, VTTER-84, VTTER-85, VTTER-87, VTTER-90 and VTTER-91.

## Context

Five backlog stories need a map: the hex map designer (VTTER-74), terrain (VTTER-84), map objects (VTTER-85), the
GM-only layer (VTTER-90) and slabs (VTTER-91). Each would otherwise invent its own idea of what a map holds.
Heath's cartography program (C#, 2012–2015) already had a working answer: everything is an object, objects stack
in layers, and a handful of element kinds describe any place. Heath gave permission to use it.

Constraints from what is already decided:

- **One hex = one zone** (VTTER-74, 2026-11-22; core rules §6.3), and terrain costs zones (decisions 2026-11-26).
- **Players roll all dice.** Map effects use existing Tests; the GM never rolls.
- **Scope** (decisions 2026-11-25, amended 2026-11-26): fog of war is in; dynamic lighting and 3D terrain are out.
- **Storage:** one DynamoDB table `vtter-game`, 400 KB per item, `<kind>#<id>` keys with a `kind` attribute,
  native lists and maps (ADR 0003, 0005, 0008).
- **Reading through the Game:** members read a Game's adventure through the Game, never directly (ADR 0006).

## Decision

### 1. Six kinds of object

Environment space, Enclosure, Route, Portal, Static Object and Entity, as defined in the
[map model](../map-model/README.md). Every object has a kind, a type from `data/map.json`, properties from
`data/map.json`, locations (`at`, as runs of hex or edge indexes), `on` (the object beneath it) and `links`.
Properties combine in one fixed order (collect, inherit, shelter, cover, stack) and each property names its own
stacking rule ([properties.md](../map-model/properties.md)).

### 2. One item per map, under its author

Key `ownerId` + `id: map#<uuid>`, `kind: "map"`. No `gsi1` entry, because maps are never listed across partitions.
A Large map with the 500-object cap fits in about 75–200 KB, and the API refuses a save over 350 KB
([data-model.md](../map-model/data-model.md#size-and-limits)). Environment spaces cover **areas**, not single hexes:
one object per hex would need about 600 KB on a Large map, over the 400 KB limit.

### 3. The map is the author's template; play is table state

The stored map holds what the author made, including foe start positions. Where Entities are, which hexes the
party has explored, which hidden objects are revealed and which `once` triggers have fired belong to the **Game's
live state** (VTTER-87), not the map. One map can be played by many Games, and play never edits it.

### 4. The API decides what a player receives

| Reader | Receives |
|---|---|
| Author | The whole map |
| GM of the Game | The whole map and the table state |
| Player in the Game | Only hexes the party (or, in per-token vision, their own hero) can see now or has explored; in them, only objects that are not GM-only (or have been revealed); Entities only where the party can see them now; no `note` fields |

This filtering happens **in the API**. The client never receives a hidden trap or an unexplored room. Hiding it in
the client would hand the whole map to anyone who opens dev tools, which is the same reason VTTER-90 strips GM-only
fields server-side. Like every Game read, the map read goes through the caller's member pointer.

### 5. Fog of war: party vision or per-token vision, the GM's choice

- Each hero has a `sight` in zones (default **3**, the far end of Far in §6.3). Sight is a hex line-of-sight
  that stops at `blocks-sight` hexes and edges.
- **The GM picks the vision mode per Game**, and can switch it at any time:

  | Mode | A player sees | Explored state |
  |---|---|---|
  | **Party vision** | what **any** hero sees | one bitset per Game and map |
  | **Per-token vision** | only what **their own** hero sees | one bitset per hero, Game and map |

  The setting lives on the Game (its allowed values in `data/game.json` when it is built), not on the map.
  Switching from per-token to party vision merges the heroes' explored sets; switching back keeps each
  hero's own set.
- **The GM always sees everything**, and can also **view as** the party (party vision) or as any one hero
  (per-token vision): the same fog of war the players get, drawn over the GM's full map. The GM's view is never
  filtered; "view as" is a display overlay on data the GM already receives.
- Explored hexes are 1.25 KB per bitset on a Large map, so even per-token vision for a party of eight is 10 KB.
  Players keep seeing explored terrain; they see Entities only in current sight.
- **Cost:** line of sight from one hero covers at most 37 hexes at sight 3 (1 + 6 + 12 + 18, the hex and its three rings), so
  recomputing after every move is cheap at any party size. The work is the API filter and the live-state
  plumbing, which is why fog of war ships after VTTER-87, not in VTTER-74.
- **Not included:** light sources, bright and dim light, darkvision-style rules, and vision that differs by
  Entity type. Those are dynamic lighting, which stays out of scope.

### 6. Triggers prompt the player, and the GM can undo

When an acting property fires (a hidden steam vent on `enter`), the app stops the move and asks the affected
player to roll the Test the property names. The app applies the result by the core rules. The GM can cancel or
undo it, which restores the state from before the trigger. A GM-only trigger is revealed when it fires.

### 7. Versioning and untrusted input

`schemaVersion` starts at 1; the app and API migrate on read and always write the latest. Every save, and every
pasted slab (VTTER-91), is validated against `data/map.json` and the limits (kinds, types, property names, ids that
exist, indexes inside the grid, `on` depth and no loops). Anything malformed is refused with a clear message.

## Consequences

- VTTER-74 builds on this model rather than on its own five hex states (open, blocked, difficult, hazard, door):
  those become Environment space types, `impassable`, and Portals. Its Jira description is rewritten to match.
- `data/map.json` (added by VTTER-74) holds the kinds, the type catalog, the property catalog and the limits.
  New types and properties are data changes.
- The player view of a map is a new, filtered response shape. It needs `/security-check` attention when it is
  built, in the same way as `GET /games/public`.
- A friend who can read a `friends`-visible adventure ([ADR 0009](0009-friends.md)) reads its maps the same way,
  GM-only objects included, behind the same friendship check. That is the author's choice to share, so it is not
  filtered like a player view.
- Effects marked *needs a rule* in the property catalog (`deep-water`, `obscured`, cliffs) must go through
  `/change-rule` before the story that makes them act.
- Fog of war widens the app's scope. The 2026-11-25 scope decision is amended, not removed: dynamic lighting and
  3D terrain remain out.

## Alternatives considered

- **One object per hex** (VTTER-84's "terrain object = 1 space"). Simple to edit hex by hex, but too big for one
  DynamoDB item on a Large map and repetitive (200 identical forest hexes). Rejected; a single-hex space is still
  allowed.
- **Surface as one kind** (the cartography program). It did two jobs, ground conditions and nested regions. Split
  into Environment space and Enclosure at Heath's suggestion, so "what layer am I in" and "what is the ground like"
  never mix.
- **One item per object, or a map split across items.** Avoids the size limit entirely but turns every map load
  into a query plus a `BatchGetItem` and makes saving a map non-atomic. Not needed at these sizes. Revisit only if
  maps outgrow 350 KB.
- **Fog of war filtered in the client.** Cheap, but leaks the whole map to anyone who reads the response. Rejected.
- **Only one vision mode.** Party vision alone is simpler, but some tables want heroes to split up and keep
  secrets. Per-token vision alone makes a cooperative table pass information by voice anyway. The GM's toggle
  costs one more explored set per hero (1.25 KB each), so both are offered.
