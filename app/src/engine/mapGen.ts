// Map generators (VTTER-74): maze, cave, and rooms-and-corridors. Pure: the same seed always gives the
// same map, and there is always a path from the start marker to the exit marker. Output is ordinary map
// objects (docs/map-model/), so a generated map is edited exactly like a hand-made one.

import type { Rng } from './dice.ts'
import { distance, indexOf, inGrid, neighbours, type Grid } from './hex.ts'
import { addObject, MAP_LIMITS, newMap, type MapDoc, type MapObject } from './mapModel.ts'
import { encodeRuns } from './runs.ts'

export const GENERATORS = [
  { id: 'maze', label: 'Maze' },
  { id: 'cave', label: 'Cave' },
  { id: 'rooms', label: 'Rooms and corridors' },
] as const
export type GeneratorId = (typeof GENERATORS)[number]['id']

/** A seeded RNG (mulberry32), so a seed typed by the author always gives the same map. */
export function seededRng(seed: string): Rng {
  // FNV-1a over the seed's characters.
  let h = 2166136261
  for (let k = 0; k < seed.length; k++) {
    h ^= seed.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng: Rng, n: number) => Math.floor(rng() * n)

/** A carved layout: which hexes are open floor, the rooms (if any), and the start and exit. */
interface Layout {
  open: Uint8Array
  rooms: number[][]
  corridors: Set<number>
  start: number
  exit: number
}

/** Breadth-first distances over open hexes from `from` (-1 where unreachable). */
function reach(g: Grid, open: Uint8Array, from: number): Int32Array {
  const dist = new Int32Array(open.length).fill(-1)
  dist[from] = 0
  const queue = [from]
  for (let k = 0; k < queue.length; k++) {
    const cur = queue[k]
    for (const nb of neighbours(g, cur)) {
      if (open[nb] && dist[nb] < 0) { dist[nb] = dist[cur] + 1; queue.push(nb) }
    }
  }
  return dist
}

/** The open hex farthest (by steps) from `from`. */
function farthest(dist: Int32Array): number {
  let best = 0
  for (let i = 1; i < dist.length; i++) if (dist[i] > dist[best]) best = i
  return best
}

/** Step hex by hex from `a` toward `b`, always to the neighbour closest to `b`. Returns every hex walked, both ends included. */
function walk(g: Grid, a: number, b: number): number[] {
  const out = [a]
  let cur = a
  while (cur !== b) {
    let best = cur
    let bestD = Infinity
    for (const nb of neighbours(g, cur)) {
      const d = distance(g, nb, b)
      if (d < bestD) { bestD = d; best = nb }
    }
    cur = best
    out.push(cur)
  }
  return out
}

/** Belt and braces: if the exit can't be reached, carve a straight walk to it. */
function ensurePath(g: Grid, l: Layout) {
  if (reach(g, l.open, l.start)[l.exit] >= 0) return
  for (const i of walk(g, l.start, l.exit)) {
    if (!l.open[i]) { l.open[i] = 1; l.corridors.add(i) }
  }
}

function maze(g: Grid, rng: Rng): Layout {
  // Cells sit on even columns and even rows. On flat-topped odd-q hexes, (2c, 2r) reaches (2c+2, 2r)
  // through (2c+1, 2r), and (2c, 2r+2) through (2c, 2r+1), so the maze is a grid maze drawn in hexes.
  const cw = Math.ceil(g.width / 2)
  const ch = Math.ceil(g.height / 2)
  const open = new Uint8Array(g.width * g.height)
  const seen = new Uint8Array(cw * ch)
  const cellHex = (c: number, r: number) => indexOf(g, 2 * c, 2 * r)
  const stack: [number, number][] = [[0, 0]]
  seen[0] = 1
  open[cellHex(0, 0)] = 1
  while (stack.length) {
    const [c, r] = stack[stack.length - 1]
    const options = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dc, dr]) => [c + dc, r + dr] as const)
      .filter(([nc, nr]) => nc >= 0 && nr >= 0 && nc < cw && nr < ch && !seen[nr * cw + nc])
    if (!options.length) { stack.pop(); continue }
    const [nc, nr] = options[pick(rng, options.length)]
    seen[nr * cw + nc] = 1
    // The hex between the two cells.
    const between = nc !== c ? indexOf(g, 2 * Math.min(c, nc) + 1, 2 * r) : indexOf(g, 2 * c, 2 * Math.min(r, nr) + 1)
    open[between] = 1
    open[cellHex(nc, nr)] = 1
    stack.push([nc, nr])
  }
  const start = cellHex(0, 0)
  return { open, rooms: [], corridors: new Set(), start, exit: farthest(reach(g, open, start)) }
}

function cave(g: Grid, rng: Rng): Layout {
  const n = g.width * g.height
  let open = new Uint8Array(n)
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = 0; i < n; i++) open[i] = rng() < 0.55 ? 1 : 0
    // Smooth: a hex becomes rock with 4+ rock neighbours (the map's border counts as rock), floor with 2 or fewer.
    for (let step = 0; step < 4; step++) {
      const next = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        const nbs = neighbours(g, i)
        const rock = 6 - nbs.length + nbs.filter(x => !open[x]).length
        next[i] = rock >= 4 ? 0 : rock <= 2 ? 1 : open[i]
      }
      open = next
    }
    // Keep the biggest cave; everything else fills in.
    const region = new Int32Array(n).fill(-1)
    let bestStart = -1
    let bestSize = 0
    for (let i = 0; i < n; i++) {
      if (!open[i] || region[i] >= 0) continue
      const d = reach(g, open, i)
      let size = 0
      for (let j = 0; j < n; j++) if (d[j] >= 0) { region[j] = i; size++ }
      if (size > bestSize) { bestSize = size; bestStart = i }
    }
    if (bestSize >= Math.max(2, n * 0.15)) {
      for (let i = 0; i < n; i++) if (region[i] !== bestStart) open[i] = 0
      const exit = farthest(reach(g, open, bestStart))
      const start = farthest(reach(g, open, exit))
      return { open, rooms: [], corridors: new Set(), start, exit }
    }
  }
  // Very small or very unlucky: a cave that is one walk across the map.
  open = new Uint8Array(n)
  const start = 0
  const exit = n - 1
  const l: Layout = { open, rooms: [], corridors: new Set(), start, exit }
  open[start] = 1
  open[exit] = 1
  ensurePath(g, l)
  return l
}

function rooms(g: Grid, rng: Rng): Layout {
  const n = g.width * g.height
  const open = new Uint8Array(n)
  const taken = new Uint8Array(n)
  const placed: number[][] = []
  const target = Math.max(2, Math.min(12, Math.round(n / 120)))
  for (let tries = 0; tries < target * 30 && placed.length < target; tries++) {
    const w = Math.min(g.width - 2, 3 + pick(rng, 5))
    const h = Math.min(g.height - 2, 2 + pick(rng, 4))
    if (w < 1 || h < 1) break
    const c0 = 1 + pick(rng, Math.max(1, g.width - w - 1))
    const r0 = 1 + pick(rng, Math.max(1, g.height - h - 1))
    const hexes: number[] = []
    let clash = false
    for (let c = c0 - 1; c <= c0 + w && !clash; c++) {
      for (let r = r0 - 1; r <= r0 + h; r++) {
        if (inGrid(g, c, r) && taken[indexOf(g, c, r)]) { clash = true; break }
      }
    }
    if (clash) continue
    for (let c = c0; c < c0 + w; c++) for (let r = r0; r < r0 + h; r++) if (inGrid(g, c, r)) hexes.push(indexOf(g, c, r))
    if (!hexes.length) continue
    for (const i of hexes) { taken[i] = 1; open[i] = 1 }
    placed.push(hexes)
  }
  if (!placed.length) {
    // Too small for a walled room: the whole map is one room.
    const all = Array.from({ length: n }, (_, i) => i)
    all.forEach(i => (open[i] = 1))
    return { open, rooms: [all], corridors: new Set(), start: 0, exit: n - 1 }
  }
  // Join the rooms left to right, so the corridors read as a route through the dungeon.
  const centre = (hexes: number[]) => hexes[Math.floor(hexes.length / 2)]
  placed.sort((a, b) => (centre(a) % g.width) - (centre(b) % g.width))
  const corridors = new Set<number>()
  for (let k = 1; k < placed.length; k++) {
    for (const i of walk(g, centre(placed[k - 1]), centre(placed[k]))) {
      if (!open[i]) { open[i] = 1; corridors.add(i) }
    }
  }
  const start = centre(placed[0])
  const last = placed[placed.length - 1]
  const exit = placed.length > 1 ? centre(last) : last[last.length - 1]
  return { open, rooms: placed, corridors, start, exit: exit === start ? last[0] : exit }
}

/** Split runs into pieces of at most `max` numbers, so no object breaks the runs-per-object limit. */
export function chunkRuns(runs: number[], max = MAP_LIMITS.runNumbersMax): number[][] {
  const size = Math.max(2, max - (max % 2))
  const out: number[][] = []
  for (let k = 0; k < runs.length; k += size) out.push(runs.slice(k, k + size))
  return out
}

const LABEL: Record<GeneratorId, { enclosure: string; name: string }> = {
  maze: { enclosure: 'underground', name: 'The maze' },
  cave: { enclosure: 'cavern', name: 'The cave' },
  rooms: { enclosure: 'underground', name: 'The dungeon' },
}

/**
 * Generate a map. The same kind, size and seed always give the same map. The layers are:
 * an Enclosure over the whole map, a rock floor on it, solid rock wherever it isn't carved,
 * rooms and corridors as Enclosures (rooms-and-corridors), and Start and Exit markers.
 */
export function generateMap(kind: GeneratorId, name: string, size: string, seed: string, width?: number, height?: number): Omit<MapDoc, 'id' | 'updatedAt'> {
  let map = newMap(name, size, width, height)
  const g: Grid = { width: map.width, height: map.height }
  const n = g.width * g.height
  const rng = seededRng(`${kind}:${g.width}x${g.height}:${seed}`)
  const layout = kind === 'maze' ? maze(g, rng) : kind === 'cave' ? cave(g, rng) : rooms(g, rng)
  ensurePath(g, layout)

  const add = (type: string, init: Partial<MapObject>) => {
    const r = addObject(map, type, init)
    map = r.map
    return r.id
  }
  const all = [0, n]
  const base = add(LABEL[kind].enclosure, { name: LABEL[kind].name, at: all })
  add('rock-floor', { on: base, at: all })
  const rock: number[] = []
  for (let i = 0; i < n; i++) if (!layout.open[i]) rock.push(i)
  chunkRuns(encodeRuns(rock)).forEach((at, k, parts) => add('solid-rock', { on: base, at, name: parts.length > 1 ? `Rock ${k + 1}` : 'Rock' }))
  layout.rooms.forEach((hexes, k) => add('room', { on: base, at: encodeRuns(hexes), name: `Room ${k + 1}` }))
  if (layout.corridors.size) {
    chunkRuns(encodeRuns(layout.corridors)).forEach((at, k, parts) => add('corridor', { on: base, at, name: parts.length > 1 ? `Corridor ${k + 1}` : 'Corridors' }))
  }
  add('start', { on: base, at: [layout.start, 1], name: 'Start' })
  add('exit', { on: base, at: [layout.exit, 1], name: 'Exit' })
  return map
}

/** Where the Start and Exit markers are, if the map has them. */
export function markers(map: Pick<MapDoc, 'objects'>): { start?: number; exit?: number } {
  const at = (type: string) => map.objects.find(o => o.type === type)?.at[0]
  return { start: at('start'), exit: at('exit') }
}
