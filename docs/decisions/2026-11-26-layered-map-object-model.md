### 2026-11-26 — The layered map object model (VTTER-86)

**Decision:** Product rules for the companion app's maps. The only game-rule change is the Terrain entry below, so
the rules are at **v0.4**. Details in [docs/map-model/](../map-model/README.md) and [ADR 0011](../adr/0011-layered-map-objects.md).

1. **Everything on a map is an object**, in one of six kinds, using Heath's names: **Environment space**,
   **Enclosure**, **Route**, **Portal**, **Static Object** (the map) and **Entity** (what moves and acts).
   This answers VTTER-86's open question 1.
2. **An Environment space covers one or more hexes.** It carries ground conditions only. Regions and storeys
   (realm, village, building, floor) are **Enclosures**. The program's Surface is split between the two.
3. **A Route is any line**: river, road, fence, wall, stairs, and patrol paths (a Route with `patrol`). It declares
   `fill` (it occupies hexes) or `edge` (it lies between hexes, like a fence). This answers question 4.
4. **Properties flow down the `on` chain.** An Enclosure with `shelter` stops weather from above, and nothing else
   is stopped implicitly. This answers question 2.
5. **Each property names its stacking rule** (`max`, `top`, `each`, `sum`). A Portal or upper storey **covers** the
   properties it lists, for an Entity standing on it. This answers question 3.
6. **Triggers** are `enter`, `leave`, `start-of-turn` and `touch`, firing `each` time, `once`, `once-per-entity` or
   `once-per-round`. "While inside" effects end when the Entity leaves. This answers question 5.
7. **When a trigger fires, the app asks the affected player to roll, and the GM can undo it.** Effects use only
   existing Tests. This answers question 6.
8. **1 hex = 1 zone**, and terrain costs zones (the Terrain rule below). This answers question 7.
9. **Height** is an optional grid on the map, in storeys. A cliff is where neighbours differ by 1 or more.
   Climbing is a proposal that needs its own rule before it acts. This answers question 8.
10. **A trap that fires on a trigger is a property; a trap that acts by itself every round is an Entity.**
11. **The cartography program's content is generic** (real-world place nouns, generic marker styles), with no names
    from another game. Modern-sounding room names are renamed. This answers question 9.
12. **One DynamoDB item per map**, `map#<uuid>` under its author, capped at 350 KB and 500 objects.
    The map is the author's template; positions, explored hexes and revealed secrets are the Game's table state.
13. **The API decides what a player receives.** GM-only objects and fog of war are filtered server-side.

**Why:**
- Heath's program already proved the "everything is an object, in layers" idea. Six kinds described every one of
  its place types, and all four paper tests (a nested world, stacked mud, fire and snowstorm, a river with a bridge,
  the steam vent trap) fit with no special cases.
- One object per hex would need about 600 KB on a 100×100 map, over DynamoDB's 400 KB item limit. Areas need about 75–200 KB.
- Splitting Surface keeps "which layer am I in" apart from "what is the ground like".
- Filtering in the client would hand a hidden trap to anyone who opens dev tools.

**Affects:** docs/map-model/ (new: README, properties, data-model, paper-tests, inventory),
docs/adr/0011-layered-map-objects.md (new), docs/mockups/map-editor.html (new), CLAUDE.md, README.md.
Jira: VTTER-74 rewritten against the model; later phases filed as backlog stories VTTER-110 to VTTER-114. No `data/` change beyond the
Terrain entry: `data/map.json` arrives with VTTER-74.
