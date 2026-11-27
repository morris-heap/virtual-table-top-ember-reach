// The map editor's view: pan and zoom, which hexes are on screen, and what each hex looks like. Pure, so the
// canvas component only draws. A 100×100 map is 10,000 hexes; only the visible ones are ever drawn.

import { gridPixels, hexCount, type Grid } from './hex.ts'
import { effectiveProps, onEdges, typeDef, type MapDoc, type MapObject } from './mapModel.ts'
import { decodeRuns } from './runs.ts'

/** Hex circumradius in screen pixels, and where the map's top-left corner sits on screen. */
export interface View { size: number; x: number; y: number }

export const MIN_HEX = 4
export const MAX_HEX = 64

const clampSize = (s: number) => Math.min(MAX_HEX, Math.max(MIN_HEX, s))

/** The whole map in a `width × height` box, centred. Never smaller than MIN_HEX, so a Large map on a phone pans. */
export function fitView(g: Grid, width: number, height: number): View {
  const unit = gridPixels(g, 1)
  const size = clampSize(Math.min(width / unit.width, height / unit.height) * 0.96)
  const px = gridPixels(g, size)
  return { size, x: (width - px.width) / 2, y: (height - px.height) / 2 }
}

/** Zoom by `factor`, keeping the point (px, py) on screen fixed. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const size = clampSize(v.size * factor)
  const k = size / v.size
  return { size, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
}

export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x + dx, y: v.y + dy })

/** The columns and rows with any part on screen (inclusive), clamped to the grid. Empty when the map is off screen. */
export function visibleRange(g: Grid, v: View, width: number, height: number) {
  const h = Math.sqrt(3) * v.size
  const col0 = Math.max(0, Math.floor((-v.x - 2 * v.size) / (1.5 * v.size)))
  const col1 = Math.min(g.width - 1, Math.ceil((width - v.x) / (1.5 * v.size)))
  const row0 = Math.max(0, Math.floor((-v.y - h) / h))
  const row1 = Math.min(g.height - 1, Math.ceil((height - v.y) / h))
  return { col0, col1, row0, row1 }
}

/** How a hex is filled. Each key is a CSS colour `--map-<key>` in index.css. */
export type Fill = 'floor' | 'rock' | 'rough' | 'water' | 'fire' | 'forest' | 'mud' | 'snow' | 'road' | 'room' | 'bridge'

const TYPE_FILL: Record<string, Fill> = {
  forest: 'forest', jungle: 'forest', swamp: 'mud', mud: 'mud', ice: 'snow', 'ice-cap': 'snow', snow: 'snow',
  'shallow-water': 'water', 'steam-vents': 'fire',
}

export function fillOf(o: MapObject): Fill {
  const p = effectiveProps(o)
  if (p.impassable === true) return 'rock'
  if (TYPE_FILL[o.type]) return TYPE_FILL[o.type]
  if (p.burning === true) return 'fire'
  if (p['deep-water'] !== undefined) return 'water'
  if (p.difficult === true) return 'rough'
  if (o.kind === 'route') return 'road'
  if (o.kind === 'portal') return 'bridge'
  if (o.kind === 'enclosure') return 'room'
  return 'floor'
}

/** What to draw at each hex, worked out once per edit rather than once per frame. */
export interface Paint {
  /** The object whose colour fills each hex (the highest layer), or -1 for an empty hex. Indexes into `objects`. */
  fill: Int32Array
  /** Static Objects and Entities, drawn as a mark on top of the fill. */
  marks: { hex: number; o: MapObject }[]
  /** Hexes inside a GM-only object (or something layered on one), outlined in the GM colour. */
  gm: Uint8Array
  /** Edge Routes and edge Portals, drawn as lines. */
  edges: { e: number; o: MapObject }[]
}

export function paintOf(map: Pick<MapDoc, 'width' | 'height' | 'objects'>): Paint {
  const n = hexCount(map)
  const fill = new Int32Array(n).fill(-1)
  const rank = new Int32Array(n).fill(-1)
  const gm = new Uint8Array(n)
  const marks: Paint['marks'] = []
  const edges: Paint['edges'] = []
  const byId = new Map(map.objects.map(o => [o.id, o]))
  const depthOf = (o: MapObject) => {
    let d = 0
    const seen = new Set<string>()
    for (let cur: MapObject | undefined = o; cur && !seen.has(cur.id); cur = cur.on ? byId.get(cur.on) : undefined) { seen.add(cur.id); d++ }
    return d
  }
  const gmOf = (o: MapObject) => {
    const seen = new Set<string>()
    for (let cur: MapObject | undefined = o; cur && !seen.has(cur.id); cur = cur.on ? byId.get(cur.on) : undefined) {
      if (cur.gmOnly) return true
      seen.add(cur.id)
    }
    return false
  }
  map.objects.forEach((o, k) => {
    const at = decodeRuns(o.at)
    if (onEdges(o)) { for (const e of at) edges.push({ e, o }); return }
    const isGm = gmOf(o)
    if (o.kind === 'static' || o.kind === 'entity') {
      for (const hex of at) if (hex < n) { marks.push({ hex, o }); if (isGm) gm[hex] = 1 }
      return
    }
    // Higher layers win; on the same layer, the later object.
    const r = depthOf(o) * 100000 + k
    for (const hex of at) {
      if (hex >= n) continue
      if (r > rank[hex]) { rank[hex] = r; fill[hex] = k }
      if (isGm) gm[hex] = 1
    }
  })
  return { fill, marks, gm, edges }
}

/** A one- or two-letter mark for a Static Object or Entity. */
export function markOf(o: MapObject): string {
  if (o.type === 'start') return 'S'
  if (o.type === 'exit') return 'E'
  if (o.kind === 'entity') return o.type === 'foe' ? 'F' : 'N'
  return (typeDef(o.type)?.label ?? o.type).slice(0, 1).toUpperCase()
}
