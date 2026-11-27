// Hex grid geometry for maps (docs/map-model/data-model.md, "Coordinates"). Pure.
//
// Hexes are flat-topped, in a `width × height` rectangle with odd columns sitting half a hex lower
// ("odd-q"). A hex is one integer, its index `i = row × width + col`. Each hex owns three of its six
// edges: north (d = 0), north-east (d = 1) and south-east (d = 2), and edge index `e = d × (width × height) + i`.

export interface Grid { width: number; height: number }

/** The six directions, clockwise from north. The first three are the edges a hex owns. */
export const DIRECTIONS = ['n', 'ne', 'se', 's', 'sw', 'nw'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const hexCount = (g: Grid) => g.width * g.height
export const edgeCount = (g: Grid) => 3 * hexCount(g)

export const colOf = (g: Grid, i: number) => i % g.width
export const rowOf = (g: Grid, i: number) => Math.floor(i / g.width)
export const indexOf = (g: Grid, col: number, row: number) => row * g.width + col

export function inGrid(g: Grid, col: number, row: number) {
  return col >= 0 && row >= 0 && col < g.width && row < g.height
}

export const isHex = (g: Grid, i: number) => Number.isInteger(i) && i >= 0 && i < hexCount(g)
export const isEdge = (g: Grid, e: number) => Number.isInteger(e) && e >= 0 && e < edgeCount(g)

/** Column and row offsets of each direction, for an even and an odd column. */
const STEP: Record<Direction, [[number, number], [number, number]]> = {
  n: [[0, -1], [0, -1]],
  ne: [[1, -1], [1, 0]],
  se: [[1, 0], [1, 1]],
  s: [[0, 1], [0, 1]],
  sw: [[-1, 0], [-1, 1]],
  nw: [[-1, -1], [-1, 0]],
}

/** The hex in direction `d` from `i`, or null past the edge of the map. */
export function neighbour(g: Grid, i: number, d: Direction): number | null {
  const col = colOf(g, i)
  const row = rowOf(g, i)
  const [dc, dr] = STEP[d][col & 1]
  return inGrid(g, col + dc, row + dr) ? indexOf(g, col + dc, row + dr) : null
}

export function neighbours(g: Grid, i: number): number[] {
  const out: number[] = []
  for (const d of DIRECTIONS) {
    const n = neighbour(g, i, d)
    if (n !== null) out.push(n)
  }
  return out
}

/** Axial coordinates (q, r) of a hex, for distance. */
export function axial(g: Grid, i: number): { q: number; r: number } {
  const col = colOf(g, i)
  const row = rowOf(g, i)
  return { q: col, r: row - (col - (col & 1)) / 2 }
}

/** Distance in hexes, which is distance in zones (1 hex = 1 zone, core rules §6.3). */
export function distance(g: Grid, a: number, b: number) {
  const p = axial(g, a)
  const q = axial(g, b)
  const dq = p.q - q.q
  const dr = p.r - q.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** The edge index for hex `i`'s own edge in direction 0 (n), 1 (ne) or 2 (se). */
export const ownedEdge = (g: Grid, i: number, d: 0 | 1 | 2) => d * hexCount(g) + i

const OPPOSITE: Record<Direction, Direction> = { n: 's', ne: 'sw', se: 'nw', s: 'n', sw: 'ne', nw: 'se' }

/** The edge shared by two neighbouring hexes, or null if they aren't neighbours. */
export function edgeBetween(g: Grid, a: number, b: number): number | null {
  for (let d = 0; d < 6; d++) {
    const dir = DIRECTIONS[d]
    if (neighbour(g, a, dir) !== b) continue
    if (d < 3) return ownedEdge(g, a, d as 0 | 1 | 2)
    return ownedEdge(g, b, DIRECTIONS.indexOf(OPPOSITE[dir]) as 0 | 1 | 2)
  }
  return null
}

/** The hex that owns an edge, its direction, and the hex on the other side (null on the map's border). */
export function edgeHexes(g: Grid, e: number): { owner: number; d: 0 | 1 | 2; other: number | null } {
  const n = hexCount(g)
  const d = Math.floor(e / n) as 0 | 1 | 2
  const owner = e % n
  return { owner, d, other: neighbour(g, owner, DIRECTIONS[d]) }
}

/** The six edges around a hex: its own three, and the three its neighbours own. Missing ones (border) are left out. */
export function edgesAround(g: Grid, i: number): number[] {
  const out = [ownedEdge(g, i, 0), ownedEdge(g, i, 1), ownedEdge(g, i, 2)]
  for (const dir of ['s', 'sw', 'nw'] as const) {
    const n = neighbour(g, i, dir)
    if (n !== null) out.push(ownedEdge(g, n, DIRECTIONS.indexOf(OPPOSITE[dir]) as 0 | 1 | 2))
  }
  return out
}

// --- Drawing (flat-topped hexes of circumradius `size`) ---

/** Centre of a hex in pixels, for a hex of circumradius `size`. */
export function hexCenter(g: Grid, i: number, size: number): { x: number; y: number } {
  const col = colOf(g, i)
  const row = rowOf(g, i)
  const h = Math.sqrt(3) * size
  return { x: size + col * 1.5 * size, y: h / 2 + row * h + (col & 1 ? h / 2 : 0) }
}

/** The six corners of a hex, clockwise from the east corner. */
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k
    out.push([cx + size * Math.cos(a), cy + size * Math.sin(a)])
  }
  return out
}

/** The two corner points of a hex's own edge d (0 n, 1 ne, 2 se), in pixels. */
export function edgeSegment(g: Grid, e: number, size: number): [[number, number], [number, number]] {
  const { owner, d } = edgeHexes(g, e)
  const { x, y } = hexCenter(g, owner, size)
  const c = hexCorners(x, y, size)
  // Corners clockwise from east (y down): 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE.
  if (d === 0) return [c[4], c[5]]
  if (d === 1) return [c[5], c[0]]
  return [c[0], c[1]]
}

/** Pixel size of the whole map. */
export function gridPixels(g: Grid, size: number) {
  const h = Math.sqrt(3) * size
  return { width: size * (1.5 * g.width + 0.5), height: h * (g.height + 0.5) }
}

/** The hex under a pixel, or null outside the map. */
export function hexAt(g: Grid, x: number, y: number, size: number): number | null {
  // Fractional axial from pixel, then cube-round.
  const px = x - size
  const py = y - (Math.sqrt(3) * size) / 2
  const q = ((2 / 3) * px) / size
  const r = ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / size
  let rx = Math.round(q)
  let rz = Math.round(r)
  const ry = Math.round(-q - r)
  const dx = Math.abs(rx - q)
  const dz = Math.abs(rz - r)
  const dy = Math.abs(ry - (-q - r))
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dz > dy) rz = -rx - ry
  const col = rx
  const row = rz + (rx - (rx & 1)) / 2
  return inGrid(g, col, row) ? indexOf(g, col, row) : null
}

/** The edge nearest a pixel, or null outside the map. */
export function edgeAt(g: Grid, x: number, y: number, size: number): number | null {
  const i = hexAt(g, x, y, size)
  if (i === null) return null
  let best: number | null = null
  let bestD = Infinity
  for (const e of edgesAround(g, i)) {
    const [[x1, y1], [x2, y2]] = edgeSegment(g, e, size)
    const d = (x - (x1 + x2) / 2) ** 2 + (y - (y1 + y2) / 2) ** 2
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}
