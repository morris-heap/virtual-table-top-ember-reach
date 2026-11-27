### 2026-11-27 — Traps as Static Objects, and a starting open or closed state (VTTER-129)

**Decision:** Product rules for the companion app's maps. No change to the d20 rules, so the rules stay at **v0.4**.

1. **Five trap Static Object types:** Pressure plate, Spike pit, Snare, Dart trap and Falling block. Each brings
   `hazard` and `hidden` as defaults the author can change. This is the layered model's §10 ("a trap that fires on a
   trigger is a property"): the types are catalog conveniences carrying that property, like Steam vents.
2. **Their numbers** are catalog defaults in `data/map.json`, anchored on the GM guide's steam vent (Notice DC 12,
   dodge DC 12, 2d6): Pressure plate 1d6, Spike pit 2d6, Snare 1d4 (once), Dart trap 1d6, all dodge and Notice DC 12;
   Falling block 3d6, dodge and Notice DC 16 (once). For a level-1 hero with Grace +2, a Spike pit averages 2.6 damage,
   the same as the steam vent, and a Falling block 6.0.
3. **Traps fire during play once map triggers (VTTER-110) are built.** Until then they are placed, configured, drawn as
   a warning triangle (dashed while Hidden) and kept out of a player's view.
4. **Starts open** (`open`) is the starting state of something that opens: Door, Secret door, Trap door, Gate,
   Portcullis, and Chest. It goes on nothing else, and the API refuses it there.
5. **It changes sight, not movement.** What changes when open is data (`whenOpen` on each type): an open Door, Secret
   door or Trap door no longer blocks sight; a Gate or Portcullis never blocks sight, open or shut. You still go through
   a Portal that opens either way (2026-11-27, maps before chapters), and opening and shutting during play is table
   state (VTTER-87). Sight acts with fog of war (VTTER-111).
6. **It changes the drawing:** an open door or gate is drawn swung open on its hinge, an open portcullis raised, an open
   trap door as a hole, an open chest with its lid up.
7. **A player never receives a Hidden object** (its own `hidden` or its type's), nor anything layered on one, as
   `properties.md` already said ("GM-only until spotted"). Spotting is table state, so until VTTER-87 every Hidden
   object stays out of the player view. A secret door taken out leaves its wall's gap visible to players; filling that
   gap is follow-up work for when the player view is served (VTTER-75).

**Why:**
- The author wants traps to place, and doors, gates and chests that start open or shut, with sight depending on what
  the thing is: you see through bars, not through a shut door.
- Keeping movement as it was respects the locked decision that open and shut are table state, and nothing at the table
  can open a door yet.
- Every trap defaults to Hidden, so the player view had to stop sending Hidden objects before traps could be useful.

**Affects:** data/map.json (five trap types, `opens` on Chest, `whenOpen` on five Portals, the `open` property),
app/ (`engine/mapModel.ts` `effectiveProps`, `propertyAllowed`, `startsOpen`, `isTrap`, `mapWarnings`;
`maps/PropertyPanel.tsx`; `engine/mapArt.ts` `openLeaf`; `maps/MapCanvas.tsx`), api/src/map.ts (`requires` check,
`playerViewOfMap` drops Hidden objects), docs/map-model/properties.md, docs/map-model/inventory.md.
