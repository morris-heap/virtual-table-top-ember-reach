### 2026-11-27 — Maps ship before chapters (VTTER-74)

**Decision:** Product rules for the companion app's maps. No change to the d20 rules, so the rules stay at **v0.4**.

1. **Maps are their own thing first.** An author can make, generate, save, rename and delete maps now, from
   `data/map.json` and the [map model](../map-model/README.md). Chapters (VTTER-75) don't exist yet, so **attaching a map to
   a chapter**, refusing to delete a map a chapter uses, and **reading a Game's map through the Game** move to VTTER-75.
2. **At most 3 maps per author** (`data/map.json` `limits.mapsPerUser`). A 4th is refused with "You can have 3 maps.
   Delete one to make another." All three size tiers are open for now; Large is meant to be paid later, and no
   billing is built.
3. **What a player receives is filtered in the API**, as ADR 0011 says. Until fog of war (VTTER-111) can say what the
   party sees, a player's view leaves out **every Entity**, every GM-only object **and everything layered on one**,
   and every `note`.
4. **Movement acts now.** `difficult`, `impassable` and an edge that blocks `move` give the cost to enter a hex
   (core rules §6.3). A Portal that opens (a door, a gate) lets you through its wall, because open and shut is
   table state (VTTER-87); a window or arrow slit doesn't. A weather bundle's Difficult counts toward that cost, which
   is what the cap is for (paper test b). Every other property is stored and shown, marked "acts later".
5. **Generated maps** (maze, cave, rooms and corridors) come from a seed: the same seed gives the same map, and there
   is always a path from Start to Exit.

**Why:**
- Chapters are a story-designer feature with their own decisions to make. Building a stand-in chapter list here would
  have fixed their shape before VTTER-75 designs it.
- The map counter is two writes, not a transaction, the same trade-off as the Game roster (ADR 0006): no new IAM
  action, and it can only err towards refusing, which a recount repairs.
- Hiding what sits on a GM-only object keeps a secret room's floor from giving the room away.

**Affects:** data/map.json (new), app/src/engine/ (`hex`, `runs`, `mapModel`, `mapRules`, `mapGen`), api/ (`map.ts`,
`map-store.ts`, `/maps` routes), docs/map-model/README.md, CLAUDE.md. The editor screens follow in a second PR.
No rules text and no game numbers.
