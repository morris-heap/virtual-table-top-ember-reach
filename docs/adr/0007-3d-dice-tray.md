# ADR 0007: 3D dice tray (renderer and physics)

- **Status:** Accepted (2026-11-24)
- **Jira:** VTTER-79

## Context

The Test roller computes results with a random number generator. VTTER-79 adds a tray of 3D dice that the player gathers
and throws with the mouse, with real physics, numbered faces, colors and sound, and a total read from the resting dice.
We needed a renderer and a physics engine that run in the browser, work with convex polyhedra (d4 to d20, including the
d10's kite faces), and don't weigh down the app's first load.

## Decision

- **three.js** draws the dice, and **cannon-es** simulates them. Both load in one lazy chunk (`import('./scene')`) that
  only the Dice tray tab requests, so the Test roller's first load is unchanged (about 357 kB; the tray chunk is about 640 kB
  before gzip).
- **Die geometry is generated, not modelled.** `app/src/engine/polyhedra.ts` builds each solid from its vertices and
  finds the faces with a small convex hull. Face numbers, the texture layout and face normals come from the same data,
  so the picture, the physics shape and the result reading can't disagree.
- **Result reading is pure math.** `engine/diceReading.ts` rotates each face normal by the die's final orientation and
  reads the face that points up (a d4 reads its top vertex). A die more than 7 degrees from flat is cocked.
  The scene never decides a number.
- **Numbers are drawn at runtime** onto a canvas atlas (one cell per face) tinted by the chosen colors, so recoloring
  needs no image files.
- **Sound is synthesized** with the Web Audio API (`dice/sound.ts`), so there are no audio files to license.
- **A d100 is two d10 dice** (tens 00-90 and units 0-9), and 00 + 0 counts as 100.
- **Without WebGL** the tray falls back to a plain roller that uses the same pool and the injectable RNG.

## Alternatives considered

- **Rapier (WASM)** has better stacking and settling, but it adds a WASM binary and an async init, and cannon-es already
  handles a pile of up to 20 convex dice well enough. Revisit if dice pile up badly or the frame rate drops.
- **Prerecorded roll animations** would make results easy to control, but the ticket requires interactive throws driven by
  the mouse, and the result must come from the dice, not the animation.
- **A d4 read by its face-down side** is common in software, but a physical d4 is read at its top corner, so we do that.

## Consequences

- **The result is not an RNG draw.** It is whatever the physics produces. Throws are not seedable, so the tray has no
  deterministic unit tests. The face mapping, cocked detection, throw velocity, totals, colors and sound parameters are
  all unit tested, and the scene is checked by hand in a browser.
- **Dice are not provably fair in the statistical sense.** Hand-made polyhedra with equal faces are fair enough for a
  tabletop companion. Anything needing audited randomness should use the Test roller.
- **Dice-heavy pools cost frame rate**, so a throw is capped at 20 physical dice. Convex-vs-convex collision is the cost,
  and d20s are the worst case. The scene steps physics at most 3 times a frame (the dice slow a little instead of the page
  stalling), lets resting dice sleep, adds rolling friction on the felt, and ends a roll after 10 seconds of real time.
- **The tray grows with the pool** (`trayScale`: floor area proportional to the dice count, up to 1.7x), and an **Expand**
  button fills the window. The camera refits, so dice look smaller in a bigger tray but stay readable.
- **Mouse speed is read from each event's own timestamp.** A busy page handles queued events in one batch, and timing them
  when handled would read a hard flick as a still mouse and throw the dice weakly.
- **Colors stay on the device** and are never sent to the API.
- Multiplayer synchronization of rolls is out of scope.
