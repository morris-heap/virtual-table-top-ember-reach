// The layered map model (docs/map-model/, ADR 0011): the stored shape, the catalog in data/map.json,
// migration and editing. Pure. The API validates every save; `mapWarnings` mirrors its checks so the
// editor can say what's wrong before saving.

import mapData from '../../../data/map.json'
import { edgeCount, hexCount, type Grid } from './hex.ts'
import { addToRuns, decodeRuns, removeFromRuns } from './runs.ts'

export type Kind = 'space' | 'enclosure' | 'route' | 'portal' | 'static' | 'entity'
export type PropScalar = boolean | number | string
export type PropValue = PropScalar | { [k: string]: PropScalar }

export interface MapObject {
  id: string
  kind: Kind
  type: string
  name?: string
  at: number[]
  line?: 'fill' | 'edge'
  ends?: [number, number]
  on?: string
  links?: string[]
  covers?: string[]
  z?: number
  props?: Record<string, PropValue>
  gmOnly?: boolean
  note?: string
  ref?: { foe?: string; npc?: string }
}

export interface MapDoc {
  schemaVersion: number
  id: string
  name: string
  size: string
  width: number
  height: number
  objects: MapObject[]
  updatedAt: string
}

/** What a map list shows. */
export interface MapSummary { id: string; name: string; size: string; width: number; height: number; updatedAt: string }

export interface ValueSpec {
  type: 'flag' | 'number' | 'text' | 'enum' | 'object'
  min?: number
  max?: number
  options?: string[]
  fields?: Record<string, ValueSpec>
  grants?: string[]
}

export interface PropertyDef {
  name: string
  label: string
  group: string
  value: ValueSpec
  acts: 'now' | 'later' | 'describes'
  stack: 'max' | 'top' | 'each' | 'sum' | 'none'
  help: string
  /** Only types with this flag can carry the property (`open` needs a type that opens, VTTER-129). */
  requires?: 'opens'
}

export interface TypeDef {
  id: string
  label: string
  kind: Kind
  line?: 'fill' | 'edge'
  placement?: 'edge' | 'hex'
  opens?: boolean
  covers?: string[]
  props?: Record<string, PropValue>
  /** What changes when it starts open: these override its properties (`false` turns one off). VTTER-129. */
  whenOpen?: Record<string, PropValue>
}

export interface SizeDef { id: string; label: string; max: number; paidLater?: boolean }

export const MAP_SCHEMA_VERSION = mapData.schemaVersion
export const KINDS = mapData.kinds as Kind[]
export const KIND_LABELS = mapData.kindLabels as Record<Kind, string>
export const SIZES = mapData.sizes as SizeDef[]
export const ALLOWED_SIZES = mapData.allowedSizes
export const MIN_SIDE = mapData.minSide
export const MAP_LIMITS = mapData.limits
export const PROPERTIES = mapData.properties as PropertyDef[]
export const TYPES = mapData.types as TypeDef[]

const PROPERTY_BY_NAME = new Map(PROPERTIES.map(p => [p.name, p]))
const TYPE_BY_ID = new Map(TYPES.map(t => [t.id, t]))

export const propertyDef = (name: string) => PROPERTY_BY_NAME.get(name)
export const typeDef = (id: string) => TYPE_BY_ID.get(id)
export const typesOfKind = (kind: Kind) => TYPES.filter(t => t.kind === kind)
export const sizeDef = (id: string) => SIZES.find(s => s.id === id)

/** What the editor calls an object: the author's name, else its type's label. */
export const objectLabel = (o: Pick<MapObject, 'name' | 'type'>) => o.name || typeDef(o.type)?.label || o.type

/** True when an object's `at` lists edge indexes rather than hexes: an edge Route, or a Portal placed on an edge. */
export function onEdges(o: Pick<MapObject, 'kind' | 'type' | 'line'>): boolean {
  if (o.kind === 'route') return o.line === 'edge'
  if (o.kind === 'portal') return typeDef(o.type)?.placement !== 'hex'
  return false
}

/**
 * The object's properties: its type's defaults, overridden by its own. A flag set to `false` turns a default off.
 * Something that starts open (`open`) also takes its type's `whenOpen` changes: an open door stops blocking sight.
 */
export function effectiveProps(o: MapObject): Record<string, PropValue> {
  const type = typeDef(o.type)
  const merged: Record<string, PropValue> = { ...(type?.props ?? {}), ...(o.props ?? {}) }
  if (merged.open === true && type?.opens && type.whenOpen) Object.assign(merged, type.whenOpen)
  for (const [k, v] of Object.entries(merged)) if (v === false) delete merged[k]
  return merged
}

/** Whether a type can carry a property: `open` only goes on something that opens. */
export function propertyAllowed(def: PropertyDef, type: string): boolean {
  return def.requires !== 'opens' || typeDef(type)?.opens === true
}

/** True when something that opens starts open (`open` on a type that opens). */
export const startsOpen = (o: MapObject) => typeDef(o.type)?.opens === true && effectiveProps(o).open === true

/** True when an object is a trap: it carries a Hazard, from its type or its own properties. */
export const isTrap = (o: MapObject) => effectiveProps(o).hazard !== undefined

/** What the object covers for an Entity standing on it: its own list, else its type's. */
export const effectiveCovers = (o: MapObject): string[] => o.covers ?? typeDef(o.type)?.covers ?? []

export class MapTooNewError extends Error {
  constructor() { super('This map was saved by a newer version of the app. Update the app to open it.') }
}

/**
 * Bring a stored map up to the current schema. One step per version; v1 is current, so this only
 * refuses maps from a newer app, never half-reading them (data-model.md, "Versioning").
 */
export function migrateMap(raw: MapDoc): MapDoc {
  const v = raw.schemaVersion ?? 1
  if (v > MAP_SCHEMA_VERSION) throw new MapTooNewError()
  // Future steps go here: if (v < 2) raw = v1to2(raw) …
  return { ...raw, schemaVersion: MAP_SCHEMA_VERSION, objects: raw.objects ?? [] }
}

/** An empty map: one cavern Enclosure with a rock floor would be presumptuous, so it really is empty. */
export function newMap(name: string, size: string, width?: number, height?: number): Omit<MapDoc, 'id' | 'updatedAt'> {
  const max = sizeDef(size)?.max ?? SIZES[0].max
  const side = (n: number | undefined) => Math.min(max, Math.max(MIN_SIDE, Math.round(n ?? max)))
  return { schemaVersion: MAP_SCHEMA_VERSION, name, size, width: side(width), height: side(height), objects: [] }
}

/** The next free short id ("o1", "o2" …). */
export function nextObjectId(objects: readonly MapObject[]): string {
  let n = 0
  for (const o of objects) {
    const m = /^o(\d+)$/.exec(o.id)
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `o${n + 1}`
}

/** Add an object of a type, with its type's kind and line. Returns the new map and the object's id. */
export function addObject<M extends Pick<MapDoc, 'objects'>>(map: M, type: string, init: Partial<MapObject> = {}): { map: M; id: string } {
  const t = typeDef(type)
  if (!t) throw new Error(`Unknown map type "${type}"`)
  const id = nextObjectId(map.objects)
  const o: MapObject = { id, kind: t.kind, type, at: [], ...init }
  if (t.kind === 'route') o.line = init.line ?? t.line ?? 'fill'
  return { map: { ...map, objects: [...map.objects, o] }, id }
}

export function updateObject<M extends Pick<MapDoc, 'objects'>>(map: M, id: string, patch: Partial<MapObject>): M {
  return { ...map, objects: map.objects.map(o => (o.id === id ? clean({ ...o, ...patch }) : o)) }
}

/** Drop empty optional fields so saved maps stay small. */
function clean(o: MapObject): MapObject {
  const out = { ...o }
  if (!out.name) delete out.name
  if (!out.note) delete out.note
  if (!out.gmOnly) delete out.gmOnly
  if (!out.on) delete out.on
  if (out.links && !out.links.length) delete out.links
  if (out.props && !Object.keys(out.props).length) delete out.props
  return out
}

/**
 * Remove an object. What sat on it moves down to whatever it sat on, so nothing is orphaned,
 * and links to it are dropped.
 */
export function removeObject<M extends Pick<MapDoc, 'objects'>>(map: M, id: string): M {
  const gone = map.objects.find(o => o.id === id)
  if (!gone) return map
  const objects = map.objects
    .filter(o => o.id !== id)
    .map(o => clean({
      ...o,
      on: o.on === id ? gone.on : o.on,
      links: o.links?.filter(l => l !== id),
    }))
  return { ...map, objects }
}

/** Paint (add) or erase indexes on an object's location. */
export function paint<M extends Pick<MapDoc, 'objects'>>(map: M, id: string, indexes: number[], erase = false): M {
  return {
    ...map,
    objects: map.objects.map(o => (o.id === id ? { ...o, at: erase ? removeFromRuns(o.at, indexes) : addToRuns(o.at, indexes) } : o)),
  }
}

/** The objects sitting directly on `id` (or on nothing, for null), in map order. */
export const childrenOf = (map: Pick<MapDoc, 'objects'>, id: string | null) =>
  map.objects.filter(o => (o.on ?? null) === id)

/** The `on` chain from an object up to the top, the object itself first. Stops at a loop. */
export function chainOf(map: Pick<MapDoc, 'objects'>, id: string): MapObject[] {
  const byId = new Map(map.objects.map(o => [o.id, o]))
  const out: MapObject[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) {
    out.push(cur)
    seen.add(cur.id)
    cur = cur.on ? byId.get(cur.on) : undefined
  }
  return out
}

function checkValue(spec: ValueSpec, v: unknown, where: string, out: string[]) {
  switch (spec.type) {
    case 'flag':
      if (typeof v !== 'boolean') out.push(`${where} must be yes or no.`)
      return
    case 'number':
      if (typeof v !== 'number' || !Number.isInteger(v) || v < (spec.min ?? -Infinity) || v > (spec.max ?? Infinity)) {
        out.push(`${where} must be a whole number from ${spec.min} to ${spec.max}.`)
      }
      return
    case 'text':
      if (typeof v !== 'string' || v.length > (spec.max ?? MAP_LIMITS.textMax)) out.push(`${where} must be text up to ${spec.max ?? MAP_LIMITS.textMax} characters.`)
      return
    case 'enum':
      if (typeof v !== 'string' || !spec.options?.includes(v)) out.push(`${where} must be one of: ${spec.options?.join(', ')}.`)
      return
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) { out.push(`${where} must be a group of values.`); return }
      for (const [k, x] of Object.entries(v)) {
        const field = spec.fields?.[k]
        if (field) checkValue(field, x, `${where} ${k}`, out)
        else if (spec.grants?.includes(k)) checkValue({ type: 'flag' }, x, `${where} ${k}`, out)
        else out.push(`${where} has an unknown field "${k}".`)
      }
    }
  }
}

/**
 * Everything wrong with a map, in plain words. Empty means the API will accept it.
 * Same rules as api/src/map.ts (data-model.md, "Size and limits").
 */
export function mapWarnings(map: Omit<MapDoc, 'id' | 'updatedAt'> & Partial<Pick<MapDoc, 'id' | 'updatedAt'>>): string[] {
  const out: string[] = []
  const L = MAP_LIMITS
  const size = sizeDef(map.size)
  if (!size || !ALLOWED_SIZES.includes(map.size)) out.push(`Size must be one of: ${ALLOWED_SIZES.join(', ')}.`)
  const max = size?.max ?? 0
  for (const [label, n] of [['Width', map.width], ['Height', map.height]] as const) {
    if (!Number.isInteger(n) || n < MIN_SIDE || n > max) out.push(`${label} must be from ${MIN_SIDE} to ${max} hexes.`)
  }
  if (!map.name.trim()) out.push('Give the map a name.')
  if (map.name.length > L.nameMax) out.push(`The map's name can be at most ${L.nameMax} characters.`)
  if (map.objects.length > L.objects) out.push(`A map can hold at most ${L.objects} objects.`)

  const grid: Grid = { width: map.width, height: map.height }
  const ids = new Set<string>()
  for (const o of map.objects) {
    const label = o.name ? `"${o.name}"` : `${o.id} (${typeDef(o.type)?.label ?? o.type})`
    if (ids.has(o.id)) out.push(`Object id ${o.id} is used twice.`)
    ids.add(o.id)
    const t = typeDef(o.type)
    if (!KINDS.includes(o.kind)) out.push(`${label} has an unknown kind.`)
    if (!t) out.push(`${label} has an unknown type.`)
    else if (t.kind !== o.kind) out.push(`${label} is a ${KIND_LABELS[t.kind]} type on a ${KIND_LABELS[o.kind] ?? o.kind}.`)
    if ((o.name ?? '').length > L.nameMax) out.push(`${label}: a name can be at most ${L.nameMax} characters.`)
    if ((o.note ?? '').length > L.noteMax) out.push(`${label}: a note can be at most ${L.noteMax} characters.`)
    if (o.at.length > L.runNumbersMax) out.push(`${label} covers too many separate pieces. Merge some.`)
    const limit = onEdges(o) ? edgeCount(grid) : hexCount(grid)
    for (const i of decodeRuns(o.at)) {
      if (i < 0 || i >= limit) { out.push(`${label} reaches outside the map.`); break }
    }
    if (o.line && o.kind !== 'route') out.push(`${label}: only a Route has a line.`)
    if (o.ends && o.kind !== 'route') out.push(`${label}: only a Route has ends.`)
    if (o.ref && o.kind !== 'entity') out.push(`${label}: only an Entity can point at a foe or NPC.`)
    const props = Object.entries(o.props ?? {})
    if (props.length > L.propsPerObject) out.push(`${label} has more than ${L.propsPerObject} properties.`)
    for (const [k, v] of props) {
      const def = propertyDef(k)
      if (!def) { out.push(`${label} has an unknown property "${k}".`); continue }
      if (!propertyAllowed(def, o.type)) { out.push(`${label}: only something that opens can have ${def.label}.`); continue }
      if (v === false && def.value.type === 'flag') continue
      checkValue(def.value, v, `${label} ${def.label}`, out)
    }
    for (const c of o.covers ?? []) if (!propertyDef(c)) out.push(`${label} covers an unknown property "${c}".`)
    if ((o.links ?? []).length > L.linksPerObject) out.push(`${label} has too many links.`)
  }
  for (const o of map.objects) {
    if (o.on && !ids.has(o.on)) out.push(`${o.id} sits on ${o.on}, which isn't on this map.`)
    for (const l of o.links ?? []) if (!ids.has(l)) out.push(`${o.id} links to ${l}, which isn't on this map.`)
    const chain = chainOf(map, o.id)
    const last = chain[chain.length - 1]
    if (last.on && ids.has(last.on)) out.push(`${o.id} sits on itself through its layers.`)
    else if (chain.length > L.onDepth) out.push(`${o.id} is more than ${L.onDepth} layers deep.`)
  }
  const bytes = new TextEncoder().encode(JSON.stringify(map)).length
  if (bytes > L.itemBytesMax) out.push(`This map is too big to save (${Math.ceil(bytes / 1000)} KB of ${L.itemBytesMax / 1000} KB). Merge areas or remove objects.`)
  return [...new Set(out)]
}
