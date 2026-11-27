import { describe, expect, it } from 'vitest'
import mapData from '../../../data/map.json'
import {
  addObject, chainOf, effectiveProps, isTrap, MAP_LIMITS, propertyAllowed, propertyDef, startsOpen, typeDef, MAP_SCHEMA_VERSION, mapWarnings, MapTooNewError, migrateMap, MIN_SIDE, newMap,
  onEdges, paint, PROPERTIES, removeObject, SIZES, TYPES, updateObject, type MapDoc,
} from './mapModel.ts'

const doc = (): MapDoc => ({ ...newMap('Forge corridor', 'small'), id: 'x', updatedAt: '' })

describe('the catalog in data/map.json', () => {
  it('gives every type a known kind, and every default property a catalog entry', () => {
    const names = new Set(PROPERTIES.map(p => p.name))
    for (const t of TYPES) {
      expect(mapData.kinds).toContain(t.kind)
      for (const p of Object.keys(t.props ?? {})) expect(names).toContain(p)
      for (const c of t.covers ?? []) expect(names).toContain(c)
      if (t.kind === 'route') expect(['fill', 'edge']).toContain(t.line)
    }
    expect(new Set(TYPES.map(t => t.id)).size).toBe(TYPES.length)
  })

  it('marks only the movement properties as acting now', () => {
    expect(PROPERTIES.filter(p => p.acts === 'now').map(p => p.name).sort()).toEqual(['blocks', 'difficult', 'impassable'])
  })

  it('has the three size tiers and start and exit markers', () => {
    expect(SIZES.map(s => [s.id, s.max])).toEqual([['small', 30], ['medium', 50], ['large', 100]])
    expect(TYPES.find(t => t.id === 'start')?.kind).toBe('static')
    expect(TYPES.find(t => t.id === 'exit')?.kind).toBe('static')
  })
})

describe('a new map', () => {
  it('takes its size tier as the default and clamps to the tier and the minimum side', () => {
    expect(newMap('A', 'medium')).toMatchObject({ width: 50, height: 50, schemaVersion: MAP_SCHEMA_VERSION })
    expect(newMap('A', 'small', 2, 99)).toMatchObject({ width: MIN_SIDE, height: 30 })
  })
})

describe('migrate on read', () => {
  it('reads version 1 as it is', () => {
    expect(migrateMap(doc())).toEqual(doc())
  })

  it('refuses a map from a newer app rather than half-reading it', () => {
    expect(() => migrateMap({ ...doc(), schemaVersion: MAP_SCHEMA_VERSION + 1 })).toThrow(MapTooNewError)
  })
})

describe('editing objects', () => {
  it('adds objects with short ids and their type kind and line', () => {
    let m = doc()
    const a = addObject(m, 'cavern'); m = a.map
    const b = addObject(m, 'wall', { on: a.id }); m = b.map
    expect([a.id, b.id]).toEqual(['o1', 'o2'])
    expect(m.objects[1]).toMatchObject({ kind: 'route', line: 'edge', on: 'o1' })
    expect(onEdges(m.objects[1])).toBe(true)
    expect(onEdges({ kind: 'portal', type: 'bridge' })).toBe(false)
    expect(onEdges({ kind: 'portal', type: 'door' })).toBe(true)
  })

  it('paints and erases hexes', () => {
    let m = addObject(doc(), 'forest').map
    m = paint(m, 'o1', [5, 6, 7])
    m = paint(m, 'o1', [6], true)
    expect(m.objects[0].at).toEqual([5, 1, 7, 1])
  })

  it('moves children down a layer and drops links when an object is removed', () => {
    let m = doc()
    m = addObject(m, 'cavern').map
    m = addObject(m, 'corridor', { on: 'o1' }).map
    m = addObject(m, 'wall', { on: 'o2' }).map
    m = addObject(m, 'door', { on: 'o2', links: ['o3'] }).map
    m = removeObject(m, 'o2')
    expect(m.objects.find(o => o.id === 'o3')?.on).toBe('o1')
    m = removeObject(m, 'o3')
    expect(m.objects.find(o => o.id === 'o4')?.links).toBeUndefined()
  })

  it('merges type defaults with the object, and false turns a default off', () => {
    let m = addObject(doc(), 'forest').map
    expect(effectiveProps(m.objects[0])).toEqual({ difficult: true, cover: true })
    m = updateObject(m, 'o1', { props: { difficult: false } })
    expect(effectiveProps(m.objects[0])).toEqual({ cover: true })
  })
})

describe('warnings (same rules as the API)', () => {
  it('accepts the data-model example', () => {
    const m: MapDoc = {
      ...doc(),
      objects: [
        { id: 'o1', kind: 'enclosure', type: 'cavern', name: 'The Forge vent', at: [0, 900] },
        { id: 'o3', kind: 'enclosure', type: 'corridor', on: 'o1', at: [310, 8, 340, 8, 370, 8] },
        { id: 'o4', kind: 'route', type: 'wall', line: 'edge', on: 'o3', at: [310, 8, 400, 8, 1217, 1], props: { blocks: 'move+sight' } },
        { id: 'o5', kind: 'portal', type: 'door', on: 'o3', links: ['o4'], at: [1247, 1] },
        { id: 'o6', kind: 'space', type: 'steam-vents', on: 'o3', at: [342, 3], gmOnly: true, note: 'Notice DC 12.',
          props: { hidden: 12, hazard: { damage: '2d6', dodge: 12, on: 'enter', every: 'each' } } },
        { id: 'o7', kind: 'entity', type: 'foe', on: 'o3', at: [377, 1], ref: { foe: 'Hollow Sentry' }, gmOnly: true },
      ],
    }
    expect(mapWarnings(m)).toEqual([])
  })

  it('flags unknown types and properties, bad values, outside indexes, loops and the object cap', () => {
    const base = doc()
    const bad = (objects: MapDoc['objects']) => mapWarnings({ ...base, objects })
    expect(bad([{ id: 'o1', kind: 'space', type: 'lava-lamp', at: [] }]).join()).toMatch(/unknown type/)
    expect(bad([{ id: 'o1', kind: 'space', type: 'mud', at: [], props: { gravitas: true } }]).join()).toMatch(/unknown property/)
    expect(bad([{ id: 'o1', kind: 'space', type: 'mud', at: [], props: { hidden: 99 } }]).join()).toMatch(/whole number/)
    expect(bad([{ id: 'o1', kind: 'space', type: 'mud', at: [899, 2] }]).join()).toMatch(/outside the map/)
    expect(bad([{ id: 'o1', kind: 'route', type: 'wall', line: 'edge', at: [2699, 1] }])).toEqual([])
    expect(bad([
      { id: 'o1', kind: 'space', type: 'mud', at: [], on: 'o2' },
      { id: 'o2', kind: 'space', type: 'mud', at: [], on: 'o1' },
    ]).join()).toMatch(/itself/)
    expect(bad([{ id: 'o1', kind: 'space', type: 'mud', at: [], ref: { foe: 'x' } }]).join()).toMatch(/only an Entity/)
    const many = Array.from({ length: MAP_LIMITS.objects + 1 }, (_, k) => ({ id: `o${k + 1}`, kind: 'space' as const, type: 'mud', at: [] }))
    expect(bad(many).join()).toMatch(/at most 500 objects/)
  })

  it('stops an on chain deeper than the limit', () => {
    let m = doc()
    for (let k = 0; k <= MAP_LIMITS.onDepth; k++) m = addObject(m, 'room', k ? { on: `o${k}` } : {}).map
    expect(chainOf(m, `o${MAP_LIMITS.onDepth + 1}`)).toHaveLength(MAP_LIMITS.onDepth + 1)
    expect(mapWarnings(m).join()).toMatch(/layers deep/)
  })
})

describe('traps (VTTER-129)', () => {
  const TRAPS = ['pressure-plate', 'spike-pit', 'snare', 'dart-trap', 'falling-block']

  it('are Static Objects that bring a Hazard and a Hidden Notice DC from data/map.json', () => {
    for (const id of TRAPS) {
      const t = typeDef(id)!
      expect(t.kind, id).toBe('static')
      const hazard = t.props?.hazard as Record<string, unknown>
      expect(hazard, id).toMatchObject({ on: 'enter' })
      expect(typeof hazard.damage).toBe('string')
      expect(typeof t.props?.hidden).toBe('number')
      // The trap's defaults are values the property catalog accepts (the API checks the same).
      const spec = propertyDef('hazard')!.value.fields!
      expect(spec.every.options).toContain(hazard.every)
      expect(hazard.dodge as number).toBeGreaterThanOrEqual(spec.dodge.min!)
      expect(hazard.dodge as number).toBeLessThanOrEqual(spec.dodge.max!)
      expect(isTrap({ id: 'o', kind: 'static', type: id, at: [] }), id).toBe(true)
    }
  })

  it('match the GM guide steam vent for the everyday ones (dodge DC 12, Notice DC 12)', () => {
    for (const id of ['pressure-plate', 'spike-pit', 'snare', 'dart-trap']) {
      expect((typeDef(id)!.props!.hazard as { dodge: number }).dodge, id).toBe(12)
      expect(typeDef(id)!.props!.hidden, id).toBe(12)
    }
    expect(typeDef('spike-pit')!.props!.hazard).toMatchObject({ damage: '2d6' }) // the steam vent's 2d6
  })

  it('counts any Static Object given a Hazard as a trap, and nothing else', () => {
    expect(isTrap({ id: 'o', kind: 'static', type: 'chest', at: [] })).toBe(false)
    expect(isTrap({ id: 'o', kind: 'static', type: 'chest', at: [], props: { hazard: { damage: '1d4', dodge: 8, on: 'touch', every: 'once' } } })).toBe(true)
  })
})

describe('starting open or closed (VTTER-129)', () => {
  const o = (type: string, open?: boolean) => ({ id: 'o', kind: typeDef(type)!.kind, type, at: [], ...(open === undefined ? {} : { props: { open } }) })

  it('offers Starts open only on things that open: the five Portals and the Chest', () => {
    const open = propertyDef('open')!
    const opens = TYPES.filter(t => propertyAllowed(open, t.id)).map(t => t.id).sort()
    expect(opens).toEqual(['chest', 'door', 'gate', 'portcullis', 'secret-door', 'trap-door'])
    expect(propertyAllowed(propertyDef('cover')!, 'wall')).toBe(true) // other properties are unaffected
  })

  it('stops a door, secret door or trap door blocking sight when it starts open', () => {
    for (const type of ['door', 'secret-door', 'trap-door']) {
      expect(effectiveProps(o(type)).blocks, type).toBe('move+sight')
      expect(effectiveProps(o(type, false)).blocks, type).toBe('move+sight')
      expect(effectiveProps(o(type, true)).blocks, type).toBeUndefined()
      expect(startsOpen(o(type, true))).toBe(true)
    }
  })

  it('never lets a gate or portcullis block sight, open or closed', () => {
    for (const type of ['gate', 'portcullis']) {
      expect(effectiveProps(o(type)).blocks, type).toBe('move')
      expect(effectiveProps(o(type, true)).blocks, type).toBeUndefined()
    }
  })

  it('changes nothing else when it starts open: a secret door is still Hidden', () => {
    expect(effectiveProps(o('secret-door', true)).hidden).toBe(12)
  })

  it('ignores Starts open on a type that does not open, and warns about it', () => {
    const win = { id: 'o1', kind: 'portal' as const, type: 'window', at: [], props: { open: true } }
    expect(effectiveProps(win).blocks).toBe('move') // a window keeps its own blocks
    expect(startsOpen(win)).toBe(false)
    const m = { ...doc(), objects: [{ id: 'o1', kind: 'portal' as const, type: 'window', at: [0, 1], props: { open: true } }] }
    expect(mapWarnings(m).join()).toMatch(/only something that opens can have Starts open/)
  })
})
