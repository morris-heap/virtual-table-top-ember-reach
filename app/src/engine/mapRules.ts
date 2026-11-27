// What a map means at one hex, and what it costs to move there (docs/map-model/properties.md,
// core rules §6.3). Pure. Movement numbers come from data/core.json `movement`.
//
// Properties at a hex are worked out in the catalog's order:
//   1. collect  every object at the hex, and every Enclosure above them on the `on` chain
//   2. inherit  an Enclosure's properties apply to everything inside it
//   3. shelter  an Enclosure with `shelter` stops weather from the layers above it
//   4. cover    the object an Entity stands on removes the properties it `covers` from what lies beneath
//   5. stack    each property combines with its own rule (max, top, each, sum)

import core from '../../../data/core.json'
import { edgeBetween, hexCount, neighbours, type Grid } from './hex.ts'
import { effectiveCovers, effectiveProps, onEdges, propertyDef, typeDef, type MapDoc, type MapObject, type PropValue } from './mapModel.ts'
import { decodeRuns } from './runs.ts'

export const MOVEMENT = core.movement

/** The zones it costs to enter a Difficult hex: one Difficult source or many, it never costs more than the cap (§6.3). */
export const DIFFICULT_COST = Math.min(MOVEMENT.difficultCost, MOVEMENT.difficultCap)

type MapLike = Pick<MapDoc, 'width' | 'height' | 'objects'>

/** One property's result at a hex, with the objects it came from. */
export interface Resolved {
  value: PropValue | PropValue[]
  sources: string[]
}

/** Lookups built once per objects array, so resolving every hex of a 100×100 map stays cheap. */
interface MapIndex {
  byId: Map<string, MapObject>
  atHex: MapObject[][]
  atEdge: Map<number, MapObject[]>
  chains: Map<string, MapObject[]>
  props: Map<string, Record<string, PropValue>>
}

const INDEXES = new WeakMap<readonly MapObject[], MapIndex>()

function indexOf(map: MapLike): MapIndex {
  const cached = INDEXES.get(map.objects)
  if (cached) return cached
  const n = hexCount({ width: map.width, height: map.height })
  const atHex: MapObject[][] = Array.from({ length: n }, () => [])
  const atEdge = new Map<number, MapObject[]>()
  for (const o of map.objects) {
    if (o.kind === 'entity') continue
    const edges = onEdges(o)
    for (const i of decodeRuns(o.at)) {
      if (edges) {
        const list = atEdge.get(i) ?? []
        list.push(o)
        atEdge.set(i, list)
      } else if (i >= 0 && i < n) atHex[i].push(o)
    }
  }
  const index: MapIndex = { byId: new Map(map.objects.map(o => [o.id, o])), atHex, atEdge, chains: new Map(), props: new Map() }
  INDEXES.set(map.objects, index)
  return index
}

/** The `on` chain from an object up to the top, the object first. Stops at a loop. */
function chain(ix: MapIndex, id: string): MapObject[] {
  const hit = ix.chains.get(id)
  if (hit) return hit
  const out: MapObject[] = []
  const seen = new Set<string>()
  let cur = ix.byId.get(id)
  while (cur && !seen.has(cur.id)) {
    out.push(cur)
    seen.add(cur.id)
    cur = cur.on ? ix.byId.get(cur.on) : undefined
  }
  ix.chains.set(id, out)
  return out
}

function propsOf(ix: MapIndex, o: MapObject) {
  let p = ix.props.get(o.id)
  if (!p) { p = effectiveProps(o); ix.props.set(o.id, p) }
  return p
}

/** The objects whose own location includes hex `i` (not edges, not Entities), in map order. */
export const objectsAtHex = (map: MapLike, i: number): MapObject[] => indexOf(map).atHex[i] ?? []

/** The objects lying on edge `e`. */
export const objectsAtEdge = (map: MapLike, e: number): MapObject[] => indexOf(map).atEdge.get(e) ?? []

/**
 * The default object an Entity stands on at a hex: the highest object there that covers something
 * (a bridge, a ford), else nothing. On a tie, the later object.
 */
function defaultStandingOn(ix: MapIndex, here: MapObject[]): string | null {
  let best: MapObject | null = null
  let bestDepth = -1
  for (const o of here) {
    if (!effectiveCovers(o).length) continue
    const d = chain(ix, o.id).length
    if (d >= bestDepth) { best = o; bestDepth = d }
  }
  return best?.id ?? null
}

/**
 * Every property at hex `i`, for an Entity standing on `standingOn`. Leave it out to stand on the
 * default (a bridge or ford, if one is there); pass the id of something else (the river) to be under it.
 */
export function resolveHex(map: MapLike, i: number, standingOn?: string | null): Record<string, Resolved> {
  const ix = indexOf(map)
  // 1. Collect, with each object's layer depth (its chain length) so `top` can pick the highest.
  const here = ix.atHex[i] ?? []
  const collected = new Map<string, { o: MapObject; depth: number }>()
  for (const o of here) {
    const c = chain(ix, o.id)
    collected.set(o.id, { o, depth: c.length })
    // 2. Inherit: Enclosures up the chain apply even where they don't list this hex themselves.
    c.slice(1).forEach((up, k) => {
      if (up.kind === 'enclosure' && !collected.has(up.id)) collected.set(up.id, { o: up, depth: c.length - 1 - k })
    })
  }
  const entries = [...collected.values()]

  // 3. Shelter: weather from anything above a sheltering Enclosure that contains this hex is stopped.
  const shelteredFrom = new Set<string>()
  for (const { o } of entries) {
    if (o.kind === 'enclosure' && propsOf(ix, o).shelter === 'weather') {
      for (const up of chain(ix, o.id).slice(1)) shelteredFrom.add(up.id)
    }
  }

  // 4. Cover: the object stood on hides the listed properties of everything except itself and what sits on it.
  const standId = standingOn === undefined ? defaultStandingOn(ix, here) : standingOn
  const coverer = standId ? collected.get(standId)?.o : undefined
  const covered = new Set(coverer ? effectiveCovers(coverer) : [])
  const onTopOfCoverer = (o: MapObject) => coverer !== undefined && chain(ix, o.id).some(x => x.id === coverer.id)

  // 5. Stack.
  const values = new Map<string, { value: PropValue; depth: number; source: string; order: number }[]>()
  const push = (name: string, value: PropValue, depth: number, source: string, order: number) => {
    const list = values.get(name) ?? []
    list.push({ value, depth, source, order })
    values.set(name, list)
  }
  entries.forEach(({ o, depth }, order) => {
    for (const [name, value] of Object.entries(propsOf(ix, o))) {
      if (name === 'weather') {
        if (shelteredFrom.has(o.id)) continue
        push(name, value, depth, o.id, order)
        // A weather bundle grants its ticked properties, which then stack by their own rules.
        if (typeof value === 'object') {
          for (const [g, on] of Object.entries(value)) if (on === true && g !== 'name') push(g, true, depth, o.id, order)
        }
        continue
      }
      if (covered.has(name) && !onTopOfCoverer(o)) continue
      push(name, value, depth, o.id, order)
    }
  })

  const out: Record<string, Resolved> = {}
  for (const [name, list] of values) {
    const rule = propertyDef(name)?.stack ?? 'top'
    const sources = [...new Set(list.map(x => x.source))]
    if (rule === 'each') { out[name] = { value: list.map(x => x.value), sources }; continue }
    if (rule === 'max') {
      const best = list.reduce((a, b) => (rank(b.value) > rank(a.value) ? b : a))
      out[name] = { value: best.value, sources }
      continue
    }
    if (rule === 'sum' && list.every(x => typeof x.value === 'number')) {
      out[name] = { value: list.reduce((n, x) => n + (x.value as number), 0), sources }
      continue
    }
    // top (and none): the highest layer wins; on a tie, the later object.
    const top = list.reduce((a, b) => (b.depth > a.depth || (b.depth === a.depth && b.order > a.order) ? b : a))
    out[name] = { value: top.value, sources: [top.source] }
  }
  return out
}

/** Order for `max`: yes beats no, a bigger number beats a smaller, and a value that blocks more beats one that blocks less. */
function rank(v: PropValue): number {
  if (v === true) return 1
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v.split('+').length
  return 0
}

const blocksMove = (v: PropValue | undefined) => typeof v === 'string' && v.split('+').includes('move')

/**
 * Can an Entity cross the edge between neighbouring hexes `a` and `b`? An edge Route that blocks
 * move (a wall, a fence) stops it, unless a Portal on that edge lets it through. A Portal lets you
 * through if it opens (a door, a gate: open or shut is table state, VTTER-87) or doesn't block move
 * (an opening). A window or arrow slit blocks on its own.
 */
export function canCross(map: MapLike, a: number, b: number): boolean {
  const ix = indexOf(map)
  const e = edgeBetween({ width: map.width, height: map.height }, a, b)
  if (e === null) return false
  const onEdge = ix.atEdge.get(e)
  if (!onEdge) return true
  const portals = onEdge.filter(o => o.kind === 'portal')
  if (portals.some(p => typeDef(p.type)?.opens || !blocksMove(propsOf(ix, p).blocks))) return true
  return !onEdge.some(o => blocksMove(propsOf(ix, o).blocks))
}

export type MoveCost = { cost: number } | { impassable: true }

/** The cost to enter hex `i` itself, ignoring edges: 1, the Difficult cost, or null for Impassable. */
export function hexCost(map: MapLike, i: number, standingOn?: string | null): number | null {
  const props = resolveHex(map, i, standingOn)
  if (props.impassable?.value === true) return null
  return props.difficult?.value === true ? DIFFICULT_COST : 1
}

/**
 * The cost in zones of Speed to step from hex `from` into its neighbour `to` (core rules §6.3, 1 hex = 1 zone):
 * 1 for open ground, `movement.difficultCost` for Difficult (never more than `movement.difficultCap`, however
 * many layers make it Difficult), and impassable for an Impassable hex or an edge you can't cross.
 */
export function enterCost(map: MapLike, from: number, to: number, standingOn?: string | null): MoveCost {
  if (!canCross(map, from, to)) return { impassable: true }
  const c = hexCost(map, to, standingOn)
  return c === null ? { impassable: true } : { cost: c }
}

/** The cheapest path from `start` to `goal`, in zones, or null if there is none. Proves a generated map can be crossed. */
export function shortestPath(map: MapLike, start: number, goal: number): { cost: number; path: number[] } | null {
  const grid: Grid = { width: map.width, height: map.height }
  const n = hexCount(grid)
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const costs = new Map<number, number | null>()
  const costInto = (to: number) => {
    if (!costs.has(to)) costs.set(to, hexCost(map, to))
    return costs.get(to)!
  }
  dist[start] = 0
  // Step costs are 1 or 2, so a bucket queue (Dial's algorithm) is enough.
  const buckets: number[][] = [[start]]
  for (let d = 0; d < buckets.length; d++) {
    for (const cur of buckets[d] ?? []) {
      if (dist[cur] !== d) continue
      if (cur === goal) {
        const path = [goal]
        while (path[0] !== start) path.unshift(prev[path[0]])
        return { cost: d, path }
      }
      for (const nb of neighbours(grid, cur)) {
        const c = costInto(nb)
        if (c === null || !canCross(map, cur, nb)) continue
        const nd = d + c
        if (nd < dist[nb]) {
          dist[nb] = nd
          prev[nb] = cur
          ;(buckets[nd] ??= []).push(nb)
        }
      }
    }
  }
  return null
}
