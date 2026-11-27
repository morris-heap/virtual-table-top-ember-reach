// Maps drawn as art (VTTER-119). The hexes stay the rules layer; this works out the shapes drawn over them:
// smooth outlines traced from an object's hexes, continuous wall lines, smooth paths through route hexes, and
// seeded decoration. Pure, in world units where a hex's circumradius is 1 (multiply by the view's hex size).
// Nothing here is stored: the same map always gives the same drawing.

import { DIRECTIONS, edgeSegment, hexCenter, hexCorners, hexCount, neighbour, type Direction, type Grid } from './hex.ts'
import { seededRng } from './mapGen.ts'
import { onEdges, type MapDoc, type MapObject } from './mapModel.ts'
import { fillOf } from './mapView.ts'
import { decodeRuns } from './runs.ts'

export type Pt = [number, number]
export type Ring = Pt[]

/** Side k of a hex runs from corner k to corner k + 1 (corners clockwise from east), and faces this neighbour. */
const SIDE_DIR: Direction[] = ['se', 's', 'sw', 'nw', 'n', 'ne']

const keyOf = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`

function cornersOf(g: Grid, i: number): Pt[] {
  const { x, y } = hexCenter(g, i, 1)
  return hexCorners(x, y, 1)
}

/**
 * The outline of a set of hexes: one closed ring per boundary (outer edges and holes alike), with hex corners as
 * points. Sides on the map's border are included. Outer rings and holes wind in opposite directions.
 */
export function traceOutline(g: Grid, hexes: Iterable<number>): Ring[] {
  const n = hexCount(g)
  const member = new Uint8Array(n)
  for (const i of hexes) if (Number.isInteger(i) && i >= 0 && i < n) member[i] = 1
  // Directed boundary sides, keyed by their start corner. Three hexes meet at a corner and are all neighbours,
  // so a corner has either no boundary sides or exactly one in and one out: chaining is never ambiguous.
  const next = new Map<string, { from: Pt; to: Pt; toKey: string }>()
  for (let i = 0; i < n; i++) {
    if (!member[i]) continue
    const c = cornersOf(g, i)
    for (let k = 0; k < 6; k++) {
      const nb = neighbour(g, i, SIDE_DIR[k])
      if (nb !== null && member[nb]) continue
      const from = c[k]
      const to = c[(k + 1) % 6]
      next.set(keyOf(from), { from, to, toKey: keyOf(to) })
    }
  }
  const rings: Ring[] = []
  for (const startKey of [...next.keys()]) {
    if (!next.has(startKey)) continue
    const ring: Ring = []
    let key = startKey
    for (let side = next.get(key); side; side = next.get(key)) {
      next.delete(key)
      ring.push(side.from)
      key = side.toKey
    }
    rings.push(ring)
  }
  return rings
}

/** Hex corners on the map's outer border, so a shape filling the map edge isn't roughened past it. */
function borderCorners(g: Grid): Set<string> {
  const out = new Set<string>()
  const n = hexCount(g)
  for (let i = 0; i < n; i++) {
    const c = cornersOf(g, i)
    for (let k = 0; k < 6; k++) {
      if (neighbour(g, i, SIDE_DIR[k]) !== null) continue
      out.add(keyOf(c[k]))
      out.add(keyOf(c[(k + 1) % 6]))
    }
  }
  return out
}

const borderCache = new Map<string, Set<string>>()
function bordersOf(g: Grid) {
  const k = `${g.width}x${g.height}`
  let s = borderCache.get(k)
  if (!s) { s = borderCorners(g); borderCache.set(k, s) }
  return s
}

/** The largest jitter `roughen` applies, as a share of the hex radius. Keeps every outline clear of hex centres. */
export const ROUGHEN_MAX = 0.15

/**
 * Nudges each corner by a little seeded noise, so a long straight run of hex sides doesn't read as hexagonal.
 * The noise is keyed by the corner's position, so two shapes sharing a boundary are nudged the same way and
 * stay matched. Corners on the map's border stay put.
 */
export function roughen(g: Grid, ring: Ring, seed: string, amount = 0.12): Ring {
  const a = Math.min(Math.abs(amount), ROUGHEN_MAX)
  const border = bordersOf(g)
  return ring.map(p => {
    const k = keyOf(p)
    if (border.has(k)) return p
    const rng = seededRng(`${seed}|${k}`)
    return [p[0] + (rng() * 2 - 1) * a, p[1] + (rng() * 2 - 1) * a] as Pt
  })
}

/** Chaikin corner-cutting on a closed ring: each pass replaces every side with points at 1/4 and 3/4 along it. */
export function smoothRing(ring: Ring, passes = 2): Ring {
  let pts = ring
  for (let p = 0; p < passes && pts.length > 2; p++) {
    const out: Ring = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = out
  }
  return pts
}

/** Taubin's two weights: a shrinking step, then a slightly stronger inflating one, so wiggles fade but size stays. */
const TAUBIN_LAMBDA = 0.5
const TAUBIN_MU = -0.53
/** How many shrink-and-inflate rounds `relax` runs. Enough to turn a 7-hex flower round and a staircase into a band. */
export const RELAX_ROUNDS = 24

/**
 * Taubin smoothing: each point moves toward the middle of its two neighbours, then back out a little further.
 * Hex-sized zigzags (alternating corners) vanish in one round and petal-sized bumps in a few, while the shape's
 * overall size and position are kept, unlike plain averaging, which shrinks it. `pinned` points never move (map
 * border corners, a line's two ends).
 */
export function relax(pts: Pt[], closed: boolean, pinned: (k: number) => boolean = () => false, rounds = RELAX_ROUNDS): Pt[] {
  const n = pts.length
  if (n < 3) return pts
  let cur = pts.map(p => [p[0], p[1]] as Pt)
  const step = (w: number) => {
    const next = cur.map(p => [p[0], p[1]] as Pt)
    for (let k = 0; k < n; k++) {
      if (pinned(k)) continue
      if (!closed && (k === 0 || k === n - 1)) continue
      const a = cur[(k - 1 + n) % n]
      const b = cur[(k + 1) % n]
      next[k] = [cur[k][0] + w * ((a[0] + b[0]) / 2 - cur[k][0]), cur[k][1] + w * ((a[1] + b[1]) / 2 - cur[k][1])]
    }
    cur = next
  }
  for (let r = 0; r < rounds; r++) { step(TAUBIN_LAMBDA); step(TAUBIN_MU) }
  return cur
}

/** An open line made smooth: relaxed with both ends pinned, then rounded. A closed loop (first point = last) is smoothed as a ring. */
export function smoothLine(line: Pt[], passes = 2): Pt[] {
  if (line.length > 3 && keyOf(line[0]) === keyOf(line[line.length - 1])) {
    const ring = smoothRing(relax(line.slice(0, -1), true), passes)
    return [...ring, ring[0]]
  }
  let pts = relax(line, false)
  for (let p = 0; p < passes && pts.length > 2; p++) {
    const out: Pt[] = [pts[0]]
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]
      const b = pts[k + 1]
      if (k > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      if (k < pts.length - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    out.push(pts[pts.length - 1])
    pts = out
  }
  return pts
}

/**
 * The smooth outline of a set of hexes: traced, roughened by `seed`, relaxed (Taubin) so no hex silhouette is
 * left, then rounded. Corners on the map's border stay pinned, so a shape that fills to the edge still does.
 */
export function shapeOf(g: Grid, hexes: Iterable<number>, seed: string): Ring[] {
  const border = bordersOf(g)
  return traceOutline(g, hexes).map(r => {
    const pinned = r.map(p => border.has(keyOf(p)))
    return smoothRing(relax(roughen(g, r, seed), true, k => pinned[k]))
  })
}

/** Even-odd point-in-shape over every ring, so holes count as outside. */
export function pointInRings(rings: Ring[], x: number, y: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a]
      const [xb, yb] = ring[b]
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside
    }
  }
  return inside
}

/** Joins segments that share end points into as few polylines as possible. Junctions (3+ segments) split lines. */
export function chainSegments(segments: [Pt, Pt][]): Pt[][] {
  const at = new Map<string, number[]>()
  const ends = segments.map(([a, b]) => [keyOf(a), keyOf(b)] as const)
  ends.forEach(([a, b], s) => {
    for (const k of [a, b]) {
      const list = at.get(k)
      if (list) list.push(s)
      else at.set(k, [s])
    }
  })
  const used = new Uint8Array(segments.length)
  const lines: Pt[][] = []
  const walk = (startKey: string, s: number) => {
    const line: Pt[] = []
    let key = startKey
    let seg: number | undefined = s
    while (seg !== undefined && !used[seg]) {
      used[seg] = 1
      const [ka, kb] = ends[seg]
      const forward = ka === key
      const [pa, pb] = segments[seg]
      if (line.length === 0) line.push(forward ? pa : pb)
      line.push(forward ? pb : pa)
      key = forward ? kb : ka
      const here: number[] = at.get(key) ?? []
      // Carry on only through a plain bend (exactly two segments meet), never through a junction.
      seg = here.length === 2 ? here.find(x => !used[x]) : undefined
    }
    if (line.length > 1) lines.push(line)
  }
  // Open chains start at ends and junctions; whatever is left is a closed loop.
  for (const [k, list] of at) if (list.length !== 2) for (const s of list) if (!used[s]) walk(k, s)
  for (let s = 0; s < segments.length; s++) if (!used[s]) walk(ends[s][0], s)
  return lines
}

/** Edge Routes (walls, fences): one continuous polyline per run of joined edges. */
export function edgeChains(g: Grid, edges: Iterable<number>): Pt[][] {
  const segs: [Pt, Pt][] = []
  const seen = new Set<number>()
  for (const e of edges) {
    if (seen.has(e) || !Number.isInteger(e) || e < 0 || e >= 3 * hexCount(g)) continue
    seen.add(e)
    segs.push(edgeSegment(g, e, 1))
  }
  return chainSegments(segs)
}

/**
 * Fill Routes (roads, rivers, corridors): polylines through the centres of neighbouring route hexes. A hex with no
 * route neighbour is a line of one point, so it is still drawn.
 */
export function routeLines(g: Grid, hexes: Iterable<number>): Pt[][] {
  const n = hexCount(g)
  const set = new Set<number>()
  for (const i of hexes) if (Number.isInteger(i) && i >= 0 && i < n) set.add(i)
  const centre = (i: number): Pt => { const { x, y } = hexCenter(g, i, 1); return [x, y] }
  const segs: [Pt, Pt][] = []
  const lonely: Pt[][] = []
  for (const i of set) {
    let any = false
    for (const d of DIRECTIONS) {
      const nb = neighbour(g, i, d)
      if (nb === null || !set.has(nb)) continue
      any = true
      if (nb > i) segs.push([centre(i), centre(nb)])
    }
    if (!any) lonely.push([centre(i)])
  }
  return [...chainSegments(segs), ...lonely]
}

/** True when some hex in the set has three or more set neighbours, so the route is an area rather than a line. */
export function isWide(g: Grid, hexes: Iterable<number>): boolean {
  const set = new Set(hexes)
  for (const i of set) {
    let k = 0
    for (const d of DIRECTIONS) {
      const nb = neighbour(g, i, d)
      if (nb !== null && set.has(nb)) k++
    }
    if (k >= 3) return true
  }
  return false
}

/** One scattered detail: where it sits, a random pick (0–1) for its look, a size (0–1), a turn, and whether it sits on the shape's rim. */
export interface Decor { x: number; y: number; v: number; r: number; rot: number; rim: boolean }

/**
 * Small details scattered over a set of hexes. Each hex is seeded by the map id and its own index, so a detail stays
 * put when other hexes change. `density` is the expected count per hex; rim hexes (with a neighbour outside the set)
 * get `rimDensity` instead, for rubble along a cave wall. Every point lies inside its own hex.
 */
export function scatterDecor(g: Grid, hexes: Iterable<number>, mapId: string, density: number, rimDensity = density): Decor[] {
  const n = hexCount(g)
  const set = new Set<number>()
  for (const i of hexes) if (Number.isInteger(i) && i >= 0 && i < n) set.add(i)
  const out: Decor[] = []
  for (const i of [...set].sort((a, b) => a - b)) {
    let rim = false
    for (const d of DIRECTIONS) {
      const nb = neighbour(g, i, d)
      if (nb !== null && !set.has(nb)) { rim = true; break }
    }
    const rng = seededRng(`${mapId}:${i}`)
    const want = rim ? rimDensity : density
    const count = Math.floor(want) + (rng() < want - Math.floor(want) ? 1 : 0)
    const { x, y } = hexCenter(g, i, 1)
    for (let k = 0; k < count; k++) {
      // Within 0.7 of the centre: always inside the hex, whose inner radius is about 0.87.
      const a = rng() * Math.PI * 2
      const d = Math.sqrt(rng()) * 0.7
      out.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, v: rng(), r: rng(), rot: rng() * Math.PI * 2, rim })
    }
  }
  return out
}

/** The texture each type is drawn with. Patterns are generated in code (app/src/maps/textures.ts), never image files. */
export type Texture =
  | 'land' | 'earth' | 'grass' | 'forest' | 'sand' | 'mud' | 'swamp' | 'rubble' | 'rock' | 'cave' | 'flagstone' | 'wood'
  | 'iron' | 'glass' | 'snow' | 'ice' | 'shallows' | 'water' | 'deep' | 'fire' | 'steam' | 'chasm' | 'road' | 'dirt' | 'stairs'

const TYPE_TEXTURE: Record<string, Texture> = {
  // Environment spaces.
  earth: 'earth', rock: 'rock', 'rock-floor': 'cave', 'solid-rock': 'rock', chasm: 'chasm', stone: 'flagstone', iron: 'iron',
  'packed-earth': 'earth', glass: 'glass', grassland: 'grass', meadow: 'grass', valley: 'grass', sand: 'sand', desert: 'sand',
  forest: 'forest', jungle: 'forest', swamp: 'swamp', mud: 'mud', rubble: 'rubble', mountain: 'rock', ice: 'ice', 'ice-cap': 'ice',
  snow: 'snow', 'shallow-water': 'shallows', water: 'water', pond: 'water', lake: 'water', sea: 'deep', ocean: 'deep',
  fire: 'fire', 'brush-fire': 'fire', 'steam-vents': 'steam',
  // Enclosures.
  realm: 'land', province: 'land', county: 'land', city: 'earth', village: 'earth', island: 'grass', underground: 'cave',
  cavern: 'cave', building: 'flagstone', castle: 'flagstone', fortress: 'flagstone', house: 'wood', hut: 'wood', shrine: 'flagstone',
  floor: 'flagstone', room: 'flagstone', bedroom: 'wood', hall: 'flagstone', 'common-room': 'wood', bathhouse: 'flagstone',
  kitchen: 'flagstone', corridor: 'flagstone',
  // Fill Routes.
  road: 'road', highroad: 'road', trail: 'dirt', path: 'dirt', stairs: 'stairs', shaft: 'chasm', tunnel: 'cave', canyon: 'rubble',
  river: 'water', ford: 'shallows',
  // Portals on a hex.
  'trap-door': 'wood', bridge: 'wood',
}

const FILL_TEXTURE: Record<string, Texture> = {
  floor: 'flagstone', room: 'flagstone', rock: 'rock', rough: 'rubble', water: 'water', fire: 'fire', forest: 'forest', mud: 'mud',
  snow: 'snow', road: 'road', bridge: 'wood',
}

/** The texture for a type id; an unknown type falls back on how its properties fill it (`fillOf`). */
export function textureOf(o: MapObject): Texture {
  return TYPE_TEXTURE[o.type] ?? FILL_TEXTURE[fillOf(o)] ?? 'land'
}

/** Whether a type id has its own texture (rather than the fallback). */
export const hasTexture = (type: string) => type in TYPE_TEXTURE

/** What gets drawn for one object, in world units. */
/**
 * A bridge drawn as a deck across a route: its centre, the unit direction it runs in, half its length, and its width
 * (all in hex radii). It runs along its own hexes when it has two or more, and across the route under it when it has one.
 */
export interface Bridge { cx: number; cy: number; ux: number; uy: number; half: number; width: number }

export const BRIDGE_WIDTH = 0.9
/** How far a bridge reaches past its end hex centres, so it lands on the banks. */
const BRIDGE_OVERHANG = 0.8

/** Where a bridge goes and which way it runs. `under` is the fill Route hexes beneath it, if any. */
export function bridgeOf(g: Grid, hexes: number[], under: ReadonlySet<number>): Bridge | null {
  const pts = hexes.filter(i => i >= 0 && i < hexCount(g)).map(i => hexCenter(g, i, 1))
  if (!pts.length) return null
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
  let ux = 1
  let uy = 0
  if (pts.length >= 2) {
    // The main axis of the hex centres (the larger eigenvector of their spread).
    let sxx = 0, syy = 0, sxy = 0
    for (const p of pts) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy) }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    ux = Math.cos(angle)
    uy = Math.sin(angle)
  } else {
    // Across the route: perpendicular to the way the route runs through this hex.
    const i = hexes[0]
    let dx = 0, dy = 0
    for (const d of DIRECTIONS) {
      const nb = neighbour(g, i, d)
      if (nb === null || !under.has(nb)) continue
      const c = hexCenter(g, nb, 1)
      let vx = c.x - cx, vy = c.y - cy
      // Opposite neighbours describe the same line, so fold them onto one side before adding.
      if (vx < 0 || (vx === 0 && vy < 0)) { vx = -vx; vy = -vy }
      dx += vx; dy += vy
    }
    const len = Math.hypot(dx, dy)
    if (len > 0) { ux = -dy / len; uy = dx / len }
  }
  let half = 0
  for (const p of pts) half = Math.max(half, Math.abs((p.x - cx) * ux + (p.y - cy) * uy))
  return { cx, cy, ux, uy, half: half + BRIDGE_OVERHANG, width: BRIDGE_WIDTH }
}

/** What gets drawn for one object, in world units. */
export type Art =
  | { kind: 'shape'; o: MapObject; texture: Texture; rings: Ring[] }
  | { kind: 'route'; o: MapObject; texture: Texture; lines: Pt[][]; rings: Ring[] | null }
  | { kind: 'edges'; o: MapObject; lines: Pt[][] }
  | { kind: 'portal'; o: MapObject; segments: [Pt, Pt][] }
  | { kind: 'bridge'; o: MapObject; bridge: Bridge }
  | { kind: 'hatch'; o: MapObject; centres: Pt[] }

/** The hexes of the fill Routes under a hex Portal, so a one-hex bridge can lie across them. */
function routeHexesUnder(o: MapObject, hexes: number[], others: readonly MapObject[]): Set<number> {
  const out = new Set<number>()
  const mine = new Set(hexes)
  for (const r of others) {
    if (r === o || r.kind !== 'route' || r.line === 'edge') continue
    const at = decodeRuns(r.at)
    if (at.some(i => mine.has(i))) for (const i of at) out.add(i)
  }
  return out
}

/** The drawing for one object, or null for Static Objects and Entities (drawn as marks, as before). */
export function artOf(g: Grid, o: MapObject, mapId: string, others: readonly MapObject[] = []): Art | null {
  if (o.kind === 'static' || o.kind === 'entity') return null
  const at = decodeRuns(o.at)
  const seed = `${mapId}|${o.id}`
  if (onEdges(o)) {
    if (o.kind === 'portal') return { kind: 'portal', o, segments: at.filter(e => e >= 0 && e < 3 * hexCount(g)).map(e => edgeSegment(g, e, 1)) }
    return { kind: 'edges', o, lines: edgeChains(g, at) }
  }
  if (o.kind === 'portal') {
    // A bridge is a deck across the water; any other Portal on a hex (a trap door) is a hatch on each hex.
    if (o.type === 'bridge') {
      const bridge = bridgeOf(g, at, routeHexesUnder(o, at, others))
      return bridge ? { kind: 'bridge', o, bridge } : null
    }
    return { kind: 'hatch', o, centres: at.filter(i => i >= 0 && i < hexCount(g)).map(i => { const c = hexCenter(g, i, 1); return [c.x, c.y] as Pt }) }
  }
  const texture = textureOf(o)
  if (o.kind === 'route') {
    // A route painted as an area (two or more hexes wide) is one smooth band; a thin one is a path through hex centres.
    const wide = isWide(g, at)
    return { kind: 'route', o, texture, lines: wide ? [] : routeLines(g, at).map(l => smoothLine(l)), rings: wide ? shapeOf(g, at, seed) : null }
  }
  return { kind: 'shape', o, texture, rings: shapeOf(g, at, seed) }
}

/**
 * What an object's drawing depends on, so the canvas rebuilds it only when this changes. A bridge also depends on
 * the routes under it, so its key carries its placement.
 */
export function artKey(o: MapObject, mapId: string, others: readonly MapObject[] = []): string {
  const base = `${mapId}|${o.kind}|${o.type}|${o.line ?? ''}|${o.at.join(',')}`
  if (o.kind !== 'portal' || o.type !== 'bridge') return base
  const at = decodeRuns(o.at)
  if (at.length !== 1) return base
  return `${base}|${[...routeHexesUnder(o, at, others)].sort((a, b) => a - b).join(',')}`
}

/** How far inside the map's outermost straight line the art's frame sits, so rounded border notches never show. */
export const FRAME_INSET = 0.3

/**
 * The straight frame the art is clipped to, in world units: inside the zigzag of the map's border hexes on all four
 * sides. Left and right, the border notches sit at x = 0.5 and x = 1.5 × width; top and bottom, at half a hex height
 * and at height × hex height. Smoothing can pull a notch in by up to about a quarter, hence the inset.
 */
export function frameOf(g: Grid): { x0: number; y0: number; x1: number; y1: number } {
  const h = Math.sqrt(3)
  return { x0: 0.5 + FRAME_INSET, y0: h / 2 + FRAME_INSET, x1: 1.5 * g.width - FRAME_INSET, y1: h * g.height - FRAME_INSET }
}

/** Bounding box of rings or lines, in world units. */
export function boundsOf(parts: Pt[][]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const part of parts) for (const [x, y] of part) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

/**
 * The objects with a drawing, in draw order: lower layers first, and on the same layer the earlier object first,
 * so the one that wins a hex in `paintOf` is also the one drawn on top.
 */
export function drawOrder(map: Pick<MapDoc, 'objects'>): MapObject[] {
  const byId = new Map(map.objects.map(o => [o.id, o]))
  const depthOf = (o: MapObject) => {
    let d = 0
    const seen = new Set<string>()
    for (let cur: MapObject | undefined = o; cur && !seen.has(cur.id); cur = cur.on ? byId.get(cur.on) : undefined) { seen.add(cur.id); d++ }
    return d
  }
  return map.objects
    .map((o, k) => ({ o, k, d: depthOf(o) }))
    .filter(({ o }) => o.kind !== 'static' && o.kind !== 'entity')
    .sort((a, b) => a.d - b.d || a.k - b.k)
    .map(({ o }) => o)
}
