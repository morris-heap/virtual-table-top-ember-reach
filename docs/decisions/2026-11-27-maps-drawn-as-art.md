### 2026-11-27 — Maps are drawn as art over an invisible hex rules layer (VTTER-119)

**Decision:** Product rules for the companion app's maps. No change to the d20 rules, so the rules stay at **v0.4**.

1. **The hexes are the rules layer and are never drawn as the map.** Movement, terrain, triggers and hit testing
   still work hex by hex (`hex.ts`, `mapRules.ts`), and the stored map is unchanged. Only the drawing changed.
2. **Each Environment space, Enclosure and hex Portal is one smooth shape**, traced from its hexes, rounded, and
   given a little noise seeded by the map and object. Walls and fences are continuous lines along their edges; roads,
   rivers and corridors are smooth paths through hex centres; doors, gates, windows and openings are symbols on their edge.
3. **Textures are generated in code**, one per type id (`textureOf` in `app/src/engine/mapArt.ts`), with no image files.
   A new type in `data/map.json` gets a texture there, and a unit test fails until it has one.
4. **Decoration is never stored.** Rocks, tufts, trees and ripples are scattered from the map id and hex index, so they
   stay put between redraws and cost nothing in the 350 KB map item.
5. **The grid is hidden for viewing**, fades in while painting or erasing, and a **Grid** toggle shows it all the time.
6. **Art stops at a straight frame** just inside the map's zigzag border. The border hexes still exist and the grid
   shows them whole.
7. **Zoomed far out, the map draws flat colours** (no textures, outlines or decoration), so a 100×100 map stays quick
   on a phone. Shapes are built once per object and rebuilt only when that object's type or hexes change.

**Amended 2026-11-27 (VTTER-123):**
- Outlines are also relaxed (Taubin smoothing, which keeps a shape's size), so a 7-hex Hut reads as round and a river
  or trail two hexes wide is one smooth band, not a hex staircase.
- **A Bridge is a plank deck with rails**, laid along its own hexes, or across the route under it when it is one hex.
  A Trap door is a square hatch on each of its hexes. Other hex Portals keep the smooth shape.
- The frame sits 0.3 hex radii further in, so the rounded border notches never show.
- **Pinch zoom follows every map app:** fingers apart zooms in, fingers together zooms out.

**Amended 2026-11-27 (VTTER-126):**
- **Walls and doors follow the shapes they lie on.** A wall edge on an Enclosure's or space's boundary is drawn along
  that shape's smoothed outline (the Enclosure the wall sits on first, then any Enclosure, then any space), and a door
  sits on the same curve. A wall on no boundary stays straight and meets the curve exactly. Walls still block on their
  hex edges: only the drawing moved.
- **A bridge over a route crosses it**, and is as wide as the hexes it was painted on. A one-hex-wide bridge keeps the
  plain width.

**Why:**
- A field of coloured hexes reads as a spreadsheet, not a place. Keeping the hexes underneath keeps every rule exact,
  while the picture can look drawn.
- Seeding from the map and hex (not storing art) keeps the drawing stable without spending item size or API work.
- Still inside the scope lock (2026-11-25): no lighting, per-token vision, 3D terrain or uploaded art.

**Affects:** app/ (`engine/mapArt.ts`, `maps/MapCanvas.tsx`, `maps/textures.ts`, `maps/MapEditor.tsx`, `index.css`).
No rules text, `data/`, API or infra changes.
