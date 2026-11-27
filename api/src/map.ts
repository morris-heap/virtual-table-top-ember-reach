// A map (VTTER-74): the layered map object model (docs/map-model/, ADR 0011) and its validation.
// Every kind, type and property is checked against data/map.json, and every object is rebuilt field by
// field, so nothing the client invents reaches the table. The app repeats these checks (app/src/engine/mapModel.ts).
import mapData from '../../data/map.json'
import { fail, int, list, obj, oneOf, text } from './sheet.ts'

const L = mapData.limits
const KINDS = mapData.kinds
const SCHEMA_VERSION = mapData.schemaVersion

type ValueSpec = {
  type: string
  min?: number
  max?: number
  options?: string[]
  fields?: Record<string, ValueSpec>
  grants?: string[]
}
type TypeDef = { id: string; kind: string; line?: string; placement?: string }

const PROPERTIES = new Map(mapData.properties.map(p => [p.name, p as { name: string; value: ValueSpec }]))
const TYPES = new Map((mapData.types as TypeDef[]).map(t => [t.id, t]))
const SIZES = new Map(mapData.sizes.map(s => [s.id, s]))

export type PropScalar = boolean | number | string
export type PropValue = PropScalar | { [k: string]: PropScalar }

export interface MapObject {
  id: string
  kind: string
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

export interface MapDraft {
  schemaVersion: number
  name: string
  size: string
  width: number
  height: number
  objects: MapObject[]
}

export interface MapRecord extends MapDraft {
  id: string
  createdAt: string
  updatedAt: string
}

export type MapSummary = Pick<MapRecord, 'id' | 'name' | 'size' | 'width' | 'height' | 'updatedAt'>

export const MAPS_PER_USER = L.mapsPerUser

const OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/

/** A map saved by a newer app is refused, never half-read (data-model.md, "Versioning"). */
export function migrateMap<T extends { schemaVersion?: number }>(raw: T): T & { schemaVersion: number } {
  const v = raw.schemaVersion ?? 1
  if (!Number.isInteger(v) || v < 1) fail('schemaVersion must be a whole number from 1')
  if (v > SCHEMA_VERSION) fail('This map was saved by a newer version of the app. Update the app to open it.')
  // Future steps go here: if (v < 2) raw = v1to2(raw) …
  return { ...raw, schemaVersion: SCHEMA_VERSION }
}

function value(spec: ValueSpec, v: unknown, where: string): PropValue {
  switch (spec.type) {
    case 'flag':
      if (typeof v !== 'boolean') fail(`${where} must be true or false`)
      return v
    case 'number':
      return int(v, where, spec.min ?? 0, spec.max ?? 1000)
    case 'text':
      if (typeof v !== 'string') fail(`${where} must be a string`)
      return text(v, where, { max: spec.max ?? L.textMax })
    case 'enum':
      return oneOf(v, where, spec.options ?? [], '') || fail(`${where} must be one of: ${(spec.options ?? []).join(', ')}`)
    case 'object': {
      const o = obj(v, where)
      const out: Record<string, PropScalar> = {}
      for (const [k, x] of Object.entries(o)) {
        const field = spec.fields?.[k]
        if (field) out[k] = value(field, x, `${where}.${k}`) as PropScalar
        else if (spec.grants?.includes(k)) out[k] = value({ type: 'flag' }, x, `${where}.${k}`) as PropScalar
        else fail(`${where} has an unknown field "${k}"`)
      }
      return out
    }
    default:
      return fail(`${where} has an unsupported value`)
  }
}

/** Runs `[start, length, …]`, every index inside `[0, limit)`. */
function runs(v: unknown, where: string, limit: number): number[] {
  const r = list(v, where, L.runNumbersMax)
  if (r.length % 2) fail(`${where} must be pairs of start and length`)
  for (let k = 0; k < r.length; k += 2) {
    const start = r[k]
    const len = r[k + 1]
    if (!Number.isInteger(start) || !Number.isInteger(len) || (start as number) < 0 || (len as number) < 1 || (start as number) + (len as number) > limit) {
      fail(`${where} reaches outside the map`)
    }
  }
  return r as number[]
}

function objectOf(raw: unknown, i: number, hexes: number): MapObject {
  const where = `objects[${i}]`
  const o = obj(raw, where)
  if (typeof o.id !== 'string' || !OBJECT_ID.test(o.id)) fail(`${where}.id must be a short id like "o1"`)
  const kind = oneOf(o.kind, `${where}.kind`, KINDS, '')
  if (!kind) fail(`${where}.kind is required`)
  if (typeof o.type !== 'string' || !TYPES.has(o.type)) fail(`${where}.type is not a known map type`)
  const type = TYPES.get(o.type)!
  if (type.kind !== kind) fail(`${where}.type "${type.id}" is a ${type.kind} type, not ${kind}`)

  const out: MapObject = { id: o.id, kind, type: type.id, at: [] }
  if (o.line !== undefined) {
    if (kind !== 'route') fail(`${where}.line is only for a Route`)
    out.line = oneOf(o.line, `${where}.line`, ['fill', 'edge'], 'fill') as 'fill' | 'edge'
  } else if (kind === 'route') out.line = (type.line ?? 'fill') as 'fill' | 'edge'
  const edges = kind === 'route' ? out.line === 'edge' : kind === 'portal' && type.placement !== 'hex'
  out.at = runs(o.at, `${where}.at`, edges ? 3 * hexes : hexes)

  if (o.ends !== undefined) {
    if (kind !== 'route') fail(`${where}.ends is only for a Route`)
    const e = list(o.ends, `${where}.ends`, 2)
    if (e.length !== 2) fail(`${where}.ends must be two hexes`)
    out.ends = [int(e[0], `${where}.ends`, 0, hexes - 1), int(e[1], `${where}.ends`, 0, hexes - 1)]
  }
  if (o.name !== undefined && o.name !== '') out.name = text(o.name, `${where}.name`, { max: L.nameMax })
  if (o.note !== undefined && o.note !== '') out.note = text(o.note, `${where}.note`, { max: L.noteMax })
  if (o.on !== undefined) {
    if (typeof o.on !== 'string' || !OBJECT_ID.test(o.on)) fail(`${where}.on must be an object id`)
    out.on = o.on
  }
  if (o.links !== undefined) {
    out.links = list(o.links, `${where}.links`, L.linksPerObject).map((l, k) => {
      if (typeof l !== 'string' || !OBJECT_ID.test(l)) fail(`${where}.links[${k}] must be an object id`)
      return l
    })
  }
  if (o.covers !== undefined) {
    out.covers = list(o.covers, `${where}.covers`, L.propsPerObject).map((c, k) => {
      if (typeof c !== 'string' || !PROPERTIES.has(c)) fail(`${where}.covers[${k}] is not a known property`)
      return c
    })
  }
  if (o.z !== undefined) out.z = int(o.z, `${where}.z`, -20, 20)
  if (o.gmOnly !== undefined) {
    if (typeof o.gmOnly !== 'boolean') fail(`${where}.gmOnly must be true or false`)
    if (o.gmOnly) out.gmOnly = true
  }
  if (o.props !== undefined) {
    const props = obj(o.props, `${where}.props`)
    const names = Object.keys(props)
    if (names.length > L.propsPerObject) fail(`${where} can have at most ${L.propsPerObject} properties`)
    out.props = {}
    for (const name of names) {
      const def = PROPERTIES.get(name)
      if (!def) fail(`${where}.props.${name} is not a known property`)
      const v = props[name]
      // `false` turns off a flag the type gives by default.
      out.props[name] = v === false && def.value.type === 'flag' ? false : value(def.value, v, `${where}.props.${name}`)
    }
  }
  if (o.ref !== undefined) {
    if (kind !== 'entity') fail(`${where}.ref is only for an Entity`)
    const ref = obj(o.ref, `${where}.ref`)
    out.ref = {}
    if (ref.foe !== undefined) out.ref.foe = text(ref.foe, `${where}.ref.foe`, { max: L.nameMax })
    if (ref.npc !== undefined) out.ref.npc = text(ref.npc, `${where}.ref.npc`, { max: L.nameMax })
  }
  return out
}

/** Validate a map from the client. Throws ValidationError with a message the author can act on. */
export function parseMap(body: unknown): MapDraft {
  const b = migrateMap(obj(body, 'map') as { schemaVersion?: number } & Record<string, unknown>)
  const size = oneOf(b.size, 'size', mapData.allowedSizes, '')
  if (!size) fail(`size must be one of: ${mapData.allowedSizes.join(', ')}`)
  const max = SIZES.get(size)!.max
  const width = int(b.width, 'width', mapData.minSide, max)
  const height = int(b.height, 'height', mapData.minSide, max)
  const name = text(b.name, 'name', { min: 1, max: L.nameMax })
  const hexes = width * height

  const objects = list(b.objects, 'objects', L.objects).map((o, i) => objectOf(o, i, hexes))
  const byId = new Map<string, MapObject>()
  for (const o of objects) {
    if (byId.has(o.id)) fail(`Object id "${o.id}" is used twice`)
    byId.set(o.id, o)
  }
  for (const o of objects) {
    if (o.on !== undefined && !byId.has(o.on)) fail(`${o.id} sits on "${o.on}", which isn't on this map`)
    for (const l of o.links ?? []) if (!byId.has(l)) fail(`${o.id} links to "${l}", which isn't on this map`)
    // Walk the `on` chain: no loops, and no deeper than the limit.
    const seen = new Set<string>()
    let cur: MapObject | undefined = o
    while (cur) {
      if (seen.has(cur.id)) fail(`${o.id} sits on itself through its layers`)
      seen.add(cur.id)
      if (seen.size > L.onDepth) fail(`${o.id} is more than ${L.onDepth} layers deep`)
      cur = cur.on ? byId.get(cur.on) : undefined
    }
  }

  const draft: MapDraft = { schemaVersion: SCHEMA_VERSION, name, size, width, height, objects }
  const bytes = new TextEncoder().encode(JSON.stringify(draft)).length
  if (bytes > L.itemBytesMax) {
    fail(`This map is too big to save (${Math.ceil(bytes / 1000)} KB of ${L.itemBytesMax / 1000} KB). Merge areas or remove objects.`)
  }
  return draft
}

/**
 * What a player in a Game receives (ADR 0011 §4, data-model.md "What each reader receives"). Built in the
 * API so a hidden object never reaches the client. Removes:
 * - every GM-only object, and everything layered on one (a secret room's floor would give the room away);
 * - every Entity, because Entities are shown only where the party can see them now, and sight is fog of war (VTTER-111);
 * - every `note`.
 * Links to removed objects are dropped. No remaining object sits on a removed one, because a removed
 * object takes everything layered on it with it.
 * The Game route that serves it arrives with chapters (VTTER-75).
 */
export function playerViewOfMap<T extends MapDraft>(map: T): T {
  const byId = new Map(map.objects.map(o => [o.id, o]))
  const hidden = new Set<string>()
  const isHidden = (o: MapObject): boolean => {
    const seen = new Set<string>()
    let cur: MapObject | undefined = o
    while (cur && !seen.has(cur.id)) {
      if (cur.gmOnly || cur.kind === 'entity') return true
      seen.add(cur.id)
      cur = cur.on ? byId.get(cur.on) : undefined
    }
    return false
  }
  for (const o of map.objects) if (isHidden(o)) hidden.add(o.id)
  const objects = map.objects
    .filter(o => !hidden.has(o.id))
    .map(o => {
      const { note: _note, gmOnly: _gm, ref: _ref, ...rest } = o
      const links = rest.links?.filter(l => !hidden.has(l))
      const out: MapObject = { ...rest }
      if (links) out.links = links
      if (!links?.length) delete out.links
      return out
    })
  return { ...map, objects }
}
