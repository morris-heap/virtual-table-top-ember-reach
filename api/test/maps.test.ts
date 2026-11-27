import { describe, expect, it } from 'vitest'
import mapData from '../../data/map.json'
import { handle, MapLimitReached, type MapStore } from '../src/handler.ts'
import { MAPS_PER_USER, migrateMap, parseMap, playerViewOfMap, type MapDraft, type MapRecord } from '../src/map.ts'
import { ValidationError } from '../src/sheet.ts'
import { MemoryPortraits } from './portraits-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const MAP = '55555555-5555-4555-8555-555555555555'
const uuid = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`

type RawObject = {
  id: string; kind: string; type: string; at: number[]; name?: string; on?: string; line?: string; ends?: number[]
  links?: string[]; covers?: string[]; props?: Record<string, unknown>; gmOnly?: boolean; note?: string; ref?: object
}
type RawMap = { schemaVersion?: number; name: string; size: string; width: number; height: number; objects: RawObject[] }

/** The Forge corridor from docs/map-model/data-model.md, the reference example. */
const forge = (): RawMap => ({
  schemaVersion: 1,
  name: 'Forge corridor',
  size: 'small',
  width: 30,
  height: 30,
  objects: [
    { id: 'o1', kind: 'enclosure', type: 'cavern', name: 'The Forge vent', at: [0, 900] },
    { id: 'o2', kind: 'space', type: 'rock-floor', on: 'o1', at: [0, 900] },
    { id: 'o3', kind: 'enclosure', type: 'corridor', name: 'Forge corridor', on: 'o1', at: [310, 8, 340, 8, 370, 8] },
    { id: 'o4', kind: 'route', type: 'wall', line: 'edge', on: 'o3',
      at: [310, 8, 400, 8, 1217, 1, 1247, 1, 1277, 1, 2117, 1, 2147, 1, 2177, 1], props: { blocks: 'move+sight' } },
    { id: 'o5', kind: 'portal', type: 'door', on: 'o3', links: ['o4'], at: [1247, 1], props: { blocks: 'move+sight' } },
    { id: 'o6', kind: 'space', type: 'steam-vents', name: 'Steam vents', on: 'o3', at: [342, 3], gmOnly: true,
      props: { hidden: 12, hazard: { damage: '2d6', dodge: 12, on: 'enter', every: 'each' } },
      note: 'Notice DC 12 to spot. Dodge DC 12 or 2d6.' },
    { id: 'o7', kind: 'entity', type: 'foe', on: 'o3', at: [377, 1], ref: { foe: 'Hollow Sentry' }, gmOnly: true },
  ],
})

/** In memory, with the same cap rule as DynamoMapStore. */
class MemoryMaps implements MapStore {
  rows = new Map<string, MapRecord & { ownerId: string }>()
  private key = (o: string, id: string) => `${o}/${id}`
  async list(ownerId: string) {
    return [...this.rows.values()].filter(r => r.ownerId === ownerId)
      .map(({ id, name, size, width, height, updatedAt }) => ({ id, name, size, width, height, updatedAt }))
  }
  async get(ownerId: string, id: string) {
    const r = this.rows.get(this.key(ownerId, id))
    if (!r) return null
    const { ownerId: _o, ...rest } = r
    return rest
  }
  async save(ownerId: string, id: string, draft: MapDraft) {
    const old = this.rows.get(this.key(ownerId, id))
    if (!old && (await this.list(ownerId)).length >= MAPS_PER_USER) throw new MapLimitReached()
    const now = new Date().toISOString()
    this.rows.set(this.key(ownerId, id), { ...draft, id, ownerId, createdAt: old?.createdAt ?? now, updatedAt: now })
    return (await this.get(ownerId, id))!
  }
  async delete(ownerId: string, id: string) {
    return this.rows.delete(this.key(ownerId, id))
  }
}

const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any> }

function world() {
  const maps = new MemoryMaps()
  const call = (method: string, path: string, opts: { owner?: string; body?: unknown; raw?: string } = {}): Promise<Reply> => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (opts.owner) headers.Authorization = `Bearer token-${opts.owner}`
    const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(new Request(`https://api.test${path}`, { method, headers, body }), {
      store: {} as never, profiles: {} as never, adventures: {} as never, maps, games: {} as never, friends: {} as never,
      chat: {} as never, presence: {} as never, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken,
    }) as unknown as Promise<Reply>
  }
  return { maps, call }
}

describe('/maps', () => {
  it('requires sign-in', async () => {
    const { call } = world()
    expect((await call('GET', '/maps')).status).toBe(401)
    expect((await call('PUT', `/maps/${MAP}`, { body: forge() })).status).toBe(401)
  })

  it('saves, reads, lists, renames and deletes a map', async () => {
    const { call } = world()
    const saved = await call('PUT', `/maps/${MAP}`, { owner: A, body: forge() })
    expect(saved.status).toBe(200)
    const m = await saved.json()
    expect(m).toMatchObject({ id: MAP, name: 'Forge corridor', schemaVersion: 1, width: 30 })
    expect(m.objects).toHaveLength(7)

    const got = await (await call('GET', `/maps/${MAP}`, { owner: A })).json()
    expect(got.objects).toEqual(m.objects)

    const renamed = await (await call('PUT', `/maps/${MAP}`, { owner: A, body: { ...forge(), name: 'The vent' } })).json()
    expect(renamed.name).toBe('The vent')

    const list = await (await call('GET', '/maps', { owner: A })).json()
    expect(list.limit).toBe(MAPS_PER_USER)
    expect(list.maps).toEqual([expect.objectContaining({ id: MAP, name: 'The vent', size: 'small' })])
    expect(list.maps[0]).not.toHaveProperty('objects')

    expect((await call('DELETE', `/maps/${MAP}`, { owner: A })).status).toBe(204)
    expect((await call('GET', `/maps/${MAP}`, { owner: A })).status).toBe(404)
    expect((await call('DELETE', `/maps/${MAP}`, { owner: A })).status).toBe(404)
  })

  it("never shows one author's map to another", async () => {
    const { call } = world()
    await call('PUT', `/maps/${MAP}`, { owner: A, body: forge() })
    expect((await call('GET', `/maps/${MAP}`, { owner: B })).status).toBe(404)
    expect((await (await call('GET', '/maps', { owner: B })).json()).maps).toEqual([])
    expect((await call('DELETE', `/maps/${MAP}`, { owner: B })).status).toBe(404)
  })

  it('never returns the owner id or the storage prefix', async () => {
    const { call } = world()
    const text = await (await call('PUT', `/maps/${MAP}`, { owner: A, body: forge() })).text()
    expect(text).not.toContain(A)
    expect(text).not.toContain('map#')
    expect(await (await call('GET', `/maps/${MAP}`, { owner: A })).text()).not.toContain(A)
  })

  it(`refuses a map past the ${MAPS_PER_USER}-map cap with a clear 409, and allows one again after a delete`, async () => {
    const { call } = world()
    for (let k = 1; k <= MAPS_PER_USER; k++) expect((await call('PUT', `/maps/${uuid(k)}`, { owner: A, body: forge() })).status).toBe(200)
    const over = await call('PUT', `/maps/${uuid(99)}`, { owner: A, body: forge() })
    expect(over.status).toBe(409)
    expect((await over.json()).error).toBe(`You can have ${MAPS_PER_USER} maps. Delete one to make another.`)
    // Saving one you already have is not a new map.
    expect((await call('PUT', `/maps/${uuid(1)}`, { owner: A, body: forge() })).status).toBe(200)
    // Someone else's maps don't count against you.
    expect((await call('PUT', `/maps/${uuid(99)}`, { owner: B, body: forge() })).status).toBe(200)
    await call('DELETE', `/maps/${uuid(2)}`, { owner: A })
    expect((await call('PUT', `/maps/${uuid(99)}`, { owner: A, body: forge() })).status).toBe(200)
  })

  it('rejects an id that is not a UUID, and bad JSON', async () => {
    const { call } = world()
    expect((await call('GET', '/maps/forge', { owner: A })).status).toBe(400)
    expect((await call('PUT', `/maps/${MAP}`, { owner: A, raw: '{' })).status).toBe(400)
    expect((await call('GET', `/maps/${MAP}/extra`, { owner: A })).status).toBe(404)
  })

  it('takes a map body bigger than other routes allow, up to the map limit', async () => {
    const { call } = world()
    // Past the general 256 KB body cap, a map is still read and refused for its name length (400), not its body (413).
    const big = forge()
    big.objects[0] = { ...big.objects[0], name: 'x'.repeat(300 * 1024) }
    expect((await call('PUT', `/maps/${MAP}`, { owner: A, body: big })).status).toBe(400)
    big.objects[0] = { ...big.objects[0], name: 'x'.repeat(500 * 1024) }
    expect((await call('PUT', `/maps/${MAP}`, { owner: A, body: big })).status).toBe(413)
  })
})

describe('parseMap: every kind, type and property is checked against data/map.json', () => {
  const bad = (patch: (m: ReturnType<typeof forge>) => void) => {
    const m = forge()
    patch(m)
    return () => parseMap(m)
  }

  it('accepts the reference example, rebuilt field by field', () => {
    const m = parseMap({ ...forge(), extra: 'dropped', objects: [{ ...forge().objects[0], sneaky: 1 }] })
    expect(m).not.toHaveProperty('extra')
    expect(m.objects[0]).not.toHaveProperty('sneaky')
  })

  it('refuses unknown kinds, types and properties, and a type on the wrong kind', () => {
    expect(bad(m => { m.objects[0].kind = 'portal-gun' })).toThrow(ValidationError)
    expect(bad(m => { m.objects[0].type = 'lava-lamp' })).toThrow(/not a known map type/)
    expect(bad(m => { m.objects[0].type = 'forest' })).toThrow(/is a space type, not enclosure/)
    expect(bad(m => { (m.objects[1] as { props?: object }).props = { gravitas: true } })).toThrow(/not a known property/)
    expect(bad(m => { m.objects[4].props = { blocks: 'everything' } })).toThrow(/must be one of/)
    expect(bad(m => { (m.objects[5].props as { hazard: object }).hazard = { damage: '2d6', poison: true } })).toThrow(/unknown field/)
    expect(bad(m => { (m.objects[1] as { covers?: string[] }).covers = ['gravitas'] })).toThrow(/not a known property/)
  })

  it('refuses sizes outside the tiers and the minimum side', () => {
    expect(bad(m => { m.size = 'huge' })).toThrow(/size/)
    expect(bad(m => { m.width = 31 })).toThrow(/width/)
    expect(bad(m => { m.height = mapData.minSide - 1 })).toThrow(/height/)
    expect(() => parseMap({ ...forge(), size: 'large', width: 100, height: 100, objects: [] })).not.toThrow()
  })

  it('refuses indexes outside the grid: hexes for areas, edges for edge Routes and Portals', () => {
    expect(bad(m => { m.objects[0].at = [0, 901] })).toThrow(/outside the map/)
    expect(bad(m => { m.objects[0].at = [-1, 1] })).toThrow(/outside the map/)
    expect(bad(m => { m.objects[0].at = [0] })).toThrow(/pairs/)
    expect(bad(m => { m.objects[3].at = [2699, 1] })).not.toThrow()
    expect(bad(m => { m.objects[3].at = [2700, 1] })).toThrow(/outside the map/)
    expect(bad(m => { m.objects[2].at = [1217, 1] })).toThrow(/outside the map/)
  })

  it('refuses ids that are unknown or reused, on loops, and chains deeper than the limit', () => {
    expect(bad(m => { m.objects[1].id = 'o1' })).toThrow(/used twice/)
    expect(bad(m => { m.objects[1].on = 'o99' })).toThrow(/isn't on this map/)
    expect(bad(m => { m.objects[4].links = ['o99'] })).toThrow(/isn't on this map/)
    expect(bad(m => { (m.objects[0] as { on?: string }).on = 'o3' })).toThrow(/itself/)
    const deep = { ...forge(), objects: Array.from({ length: mapData.limits.onDepth + 1 }, (_, k) => ({
      id: `o${k}`, kind: 'enclosure', type: 'room', at: [], ...(k ? { on: `o${k - 1}` } : {}),
    })) }
    expect(() => parseMap(deep)).toThrow(/layers deep/)
  })

  it('keeps line and ends to Routes and ref to Entities', () => {
    expect(bad(m => { (m.objects[0] as { line?: string }).line = 'fill' })).toThrow(/only for a Route/)
    expect(bad(m => { (m.objects[0] as { ends?: number[] }).ends = [0, 1] })).toThrow(/only for a Route/)
    expect(bad(m => { (m.objects[0] as { ref?: object }).ref = { foe: 'x' } })).toThrow(/only for an Entity/)
  })

  it('caps objects, properties per object, names and notes', () => {
    const many = { ...forge(), objects: Array.from({ length: mapData.limits.objects + 1 }, (_, k) => ({ id: `o${k}`, kind: 'space', type: 'mud', at: [] })) }
    expect(() => parseMap(many)).toThrow(/at most 500/)
    expect(bad(m => { m.objects[0].name = 'x'.repeat(mapData.limits.nameMax + 1) })).toThrow(/name/)
    expect(bad(m => { m.objects[5].note = 'x'.repeat(mapData.limits.noteMax + 1) })).toThrow(/note/)
  })

  it('refuses a map whose stored size would pass the item limit', () => {
    // 500 objects, each with the longest runs allowed: far past 350 KB.
    const objects = Array.from({ length: 200 }, (_, k) => ({
      id: `o${k}`, kind: 'space', type: 'mud', at: Array.from({ length: 1000 }, (_, j) => (j % 2 ? 1 : j * 4)),
    }))
    expect(() => parseMap({ ...forge(), size: 'large', width: 100, height: 100, objects })).toThrow(/too big to save/)
  })
})

describe('migrate on read', () => {
  it('reads schema version 1, and a map with no version as version 1', () => {
    expect(migrateMap({ schemaVersion: 1 }).schemaVersion).toBe(1)
    const { schemaVersion: _v, ...unversioned } = forge()
    expect(parseMap(unversioned).schemaVersion).toBe(1)
  })

  it('refuses a map from a newer app with "update the app"', () => {
    expect(() => parseMap({ ...forge(), schemaVersion: mapData.schemaVersion + 1 })).toThrow(/Update the app/)
  })
})

describe("a player's view of a map (ADR 0011 §4)", () => {
  const view = () => playerViewOfMap({ ...parseMap(forge()), id: MAP, createdAt: '', updatedAt: '' })

  it('contains no GM-only object and no note', () => {
    const v = view()
    expect(v.objects.map(o => o.id)).toEqual(['o1', 'o2', 'o3', 'o4', 'o5'])
    const text = JSON.stringify(v)
    expect(text).not.toContain('gmOnly')
    expect(text).not.toContain('"note"')
    expect(text).not.toContain('Steam vents')
    expect(text).not.toContain('Notice DC')
  })

  it('also hides everything layered on a GM-only object, and every Entity', () => {
    const m = parseMap({
      ...forge(),
      objects: [
        { id: 'o1', kind: 'enclosure', type: 'cavern', at: [0, 900] },
        { id: 's', kind: 'enclosure', type: 'room', name: 'Secret room', on: 'o1', at: [10, 3], gmOnly: true },
        { id: 'f', kind: 'space', type: 'stone', name: 'Its floor', on: 's', at: [10, 3] },
        { id: 'd', kind: 'portal', type: 'door', on: 'o1', links: ['s'], at: [910, 1], note: 'Locked' },
        { id: 'e', kind: 'entity', type: 'npc', on: 'o1', at: [5, 1], ref: { npc: 'Maren' } },
      ],
    })
    const v = playerViewOfMap(m)
    expect(v.objects.map(o => o.id)).toEqual(['o1', 'd'])
    expect(v.objects[1]).not.toHaveProperty('links')
    expect(v.objects[1]).not.toHaveProperty('note')
    expect(JSON.stringify(v)).not.toMatch(/Secret room|Its floor|Maren|Locked/)
  })

  it('leaves the author their whole map', () => {
    expect(parseMap(forge()).objects).toHaveLength(7)
  })

  it('hides every Hidden object, by its own Notice DC or its type\'s, and everything on one (VTTER-129)', () => {
    const m = parseMap({
      ...forge(),
      objects: [
        { id: 'o1', kind: 'enclosure', type: 'cavern', at: [0, 900] },
        { id: 't', kind: 'static', type: 'spike-pit', name: 'The pit', on: 'o1', at: [40, 1] }, // Hidden from its type
        { id: 'x', kind: 'static', type: 'statue', name: 'Hollow statue', on: 'o1', at: [50, 1], props: { hidden: 14 } },
        { id: 'y', kind: 'static', type: 'chest', name: 'Its key', on: 'x', at: [50, 1] },
        { id: 'sd', kind: 'portal', type: 'secret-door', on: 'o1', at: [960, 1] },
        { id: 'c', kind: 'static', type: 'chest', on: 'o1', at: [70, 1], links: ['t'] },
      ],
    })
    const v = playerViewOfMap(m)
    expect(v.objects.map(o => o.id)).toEqual(['o1', 'c'])
    expect(v.objects[1]).not.toHaveProperty('links') // its only link pointed at the hidden pit
    expect(JSON.stringify(v)).not.toMatch(/The pit|Hollow statue|Its key|spike-pit|secret-door/)
  })
})

describe('traps and a starting open or closed state (VTTER-129)', () => {
  const at = { door: 900 + 31, wall: 900 + 32 } // two edges (direction 1, hexes 31 and 32)

  it('saves a trap with its type, and keeps any value the author changes', () => {
    const m = parseMap({ ...forge(), objects: [
      { id: 't', kind: 'static', type: 'falling-block', at: [40, 1] },
      { id: 'u', kind: 'static', type: 'dart-trap', at: [41, 1], props: { hidden: 8 } },
    ] })
    expect(m.objects.map(o => o.type)).toEqual(['falling-block', 'dart-trap'])
    expect(m.objects[1].props).toEqual({ hidden: 8 })
  })

  it('accepts Starts open on things that open', () => {
    for (const [kind, type, place] of [['portal', 'door', at.door], ['portal', 'gate', at.door], ['portal', 'portcullis', at.door], ['static', 'chest', 40]] as const) {
      const m = parseMap({ ...forge(), objects: [{ id: 'p', kind, type, at: [place, 1], props: { open: true } }] })
      expect(m.objects[0].props, type).toEqual({ open: true })
    }
  })

  it('refuses Starts open on anything that does not open', () => {
    for (const [kind, type, place, line] of [['route', 'wall', at.wall, 'edge'], ['portal', 'window', at.door, undefined], ['static', 'statue', 40, undefined]] as const) {
      const raw = { id: 'p', kind, type, at: [place, 1], props: { open: true }, ...(line ? { line } : {}) }
      expect(() => parseMap({ ...forge(), objects: [raw] }), type).toThrow(/only goes on something that opens/)
    }
  })

  it('refuses a value for Starts open that is not a flag', () => {
    expect(() => parseMap({ ...forge(), objects: [{ id: 'p', kind: 'portal', type: 'door', at: [at.door, 1], props: { open: 'yes' } }] })).toThrow()
  })

  it('knows every trap type the app offers', () => {
    const traps = mapData.types.filter(t => t.kind === 'static' && (t as { props?: Record<string, unknown> }).props?.hazard)
    expect(traps.map(t => t.id).sort()).toEqual(['dart-trap', 'falling-block', 'pressure-plate', 'snare', 'spike-pit'])
  })
})
