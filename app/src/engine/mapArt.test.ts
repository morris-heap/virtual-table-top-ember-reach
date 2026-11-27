import { describe, expect, it } from 'vitest'
import mapData from '../../../data/map.json'
import { DIRECTIONS, edgeSegment, hexCenter, hexCount, indexOf, neighbour, ownedEdge, type Grid } from './hex.ts'
import {
  artKey, artOf, chainSegments, drawOrder, edgeChains, hasTexture, isWide, pointInRings, routeLines, scatterDecor, shapeOf,
  smoothLine, textureOf, traceOutline, type Pt,
} from './mapArt.ts'
import { generateMap } from './mapGen.ts'
import type { MapObject } from './mapModel.ts'
import { decodeRuns, encodeRuns } from './runs.ts'

const g: Grid = { width: 12, height: 10 }
const at = (col: number, row: number) => indexOf(g, col, row)
const ring = (c: number, r: number) => DIRECTIONS.map(d => neighbour(g, at(c, r), d)!) // the six around a hex

const centre = (i: number) => hexCenter(g, i, 1)

/** Every member's centre is inside the shape, and every hex beside it that isn't a member is outside. */
function enclosesExactly(hexes: number[], seed = 'map-1|obj') {
  const rings = shapeOf(g, hexes, seed)
  const set = new Set(hexes)
  for (const i of hexes) expect(pointInRings(rings, centre(i).x, centre(i).y), `member ${i}`).toBe(true)
  for (const i of hexes) for (const d of DIRECTIONS) {
    const nb = neighbour(g, i, d)
    if (nb === null || set.has(nb)) continue
    expect(pointInRings(rings, centre(nb).x, centre(nb).y), `outsider ${nb}`).toBe(false)
  }
}

const SETS: Record<string, number[]> = {
  'a single hex': [at(5, 5)],
  'a line': [at(2, 2), at(3, 2), at(4, 2), at(5, 2), at(6, 2)],
  'a blob': [at(5, 5), ...ring(5, 5)],
  'a ring with a hole': ring(5, 5),
  'two separate blobs': [at(1, 1), at(2, 1), at(9, 8), at(10, 8)],
  'hexes on the map border': [at(0, 0), at(1, 0), at(0, 1), at(11, 9), at(11, 8)],
  'a zigzag': [at(1, 5), at(2, 5), at(3, 4), at(4, 4), at(5, 5), at(6, 5), at(7, 4)],
}

describe('outlines', () => {
  for (const [name, hexes] of Object.entries(SETS)) {
    it(`enclose exactly ${name}`, () => enclosesExactly(hexes))
  }

  it('enclose exactly a whole map and a random cave', () => {
    const all = Array.from({ length: hexCount(g) }, (_, i) => i)
    enclosesExactly(all)
    const cave = generateMap('cave', 'Cave', 'small', 'seed-7', 20, 20)
    const big: Grid = { width: 20, height: 20 }
    for (const o of cave.objects.filter(o => o.kind === 'space')) {
      const hexes = decodeRuns(o.at)
      const rings = shapeOf(big, hexes, 'x')
      for (const i of hexes) { const c = hexCenter(big, i, 1); expect(pointInRings(rings, c.x, c.y)).toBe(true) }
    }
  })

  it('trace one ring for a hex and a ring plus a hole for a ring of hexes', () => {
    expect(traceOutline(g, [at(5, 5)])).toHaveLength(1)
    expect(traceOutline(g, [at(5, 5)])[0]).toHaveLength(6)
    expect(traceOutline(g, ring(5, 5))).toHaveLength(2)
    expect(traceOutline(g, [at(1, 1), at(9, 8)])).toHaveLength(2)
  })

  it('ignore indexes outside the map', () => {
    expect(traceOutline(g, [-1, hexCount(g), 2.5])).toEqual([])
  })

  it('are the same every time for the same map, and differ between maps', () => {
    const hexes = SETS['a blob']
    expect(shapeOf(g, hexes, 'map-1|a')).toEqual(shapeOf(g, hexes, 'map-1|a'))
    expect(shapeOf(g, hexes, 'map-1|a')).not.toEqual(shapeOf(g, hexes, 'map-2|a'))
  })

  it('are rounded, not hexagonal: many more points than hex corners', () => {
    expect(shapeOf(g, [at(5, 5)], 's')[0].length).toBeGreaterThan(6)
  })
})

describe('walls and fences', () => {
  it('join neighbouring edges into one continuous line', () => {
    // Three north edges of a row of hexes don't touch (odd columns sit lower), but a hex's own n, ne and se do.
    const i = at(4, 4)
    const lines = edgeChains(g, [ownedEdge(g, i, 0), ownedEdge(g, i, 1), ownedEdge(g, i, 2)])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveLength(4)
  })

  it('cover every edge exactly once, and keep separate runs separate', () => {
    const edges = [ownedEdge(g, at(1, 1), 0), ownedEdge(g, at(1, 1), 1), ownedEdge(g, at(8, 7), 2)]
    const lines = edgeChains(g, edges)
    expect(lines).toHaveLength(2)
    expect(lines.reduce((n, l) => n + l.length - 1, 0)).toBe(edges.length)
    // Each segment of the chains is one of the edges.
    const key = ([a, b]: [Pt, Pt]) => [a, b].map(p => p.map(v => Math.round(v * 1000)).join(',')).sort().join('|')
    const want = new Set(edges.map(e => key(edgeSegment(g, e, 1))))
    for (const l of lines) for (let k = 0; k < l.length - 1; k++) expect(want.has(key([l[k], l[k + 1]]))).toBe(true)
  })

  it('close a loop of edges around one hex', () => {
    const i = at(5, 5)
    const around = [0, 1, 2].map(d => ownedEdge(g, i, d as 0 | 1 | 2))
    for (const [dir, d] of [['s', 0], ['sw', 1], ['nw', 2]] as const) around.push(ownedEdge(g, neighbour(g, i, dir)!, d))
    const lines = edgeChains(g, around)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveLength(7)
    expect(lines[0][0]).toEqual(lines[0][6])
  })

  it('split at a junction of three', () => {
    const o: Pt = [0, 0]
    expect(chainSegments([[o, [1, 0]], [o, [0, 1]], [o, [-1, 0]]])).toHaveLength(3)
  })
})

describe('roads and rivers', () => {
  it('pass through every route hex', () => {
    const hexes = SETS['a zigzag']
    const lines = routeLines(g, hexes)
    const points = new Set(lines.flat().map(p => p.map(v => Math.round(v * 1000)).join(',')))
    for (const i of hexes) expect(points.has([centre(i).x, centre(i).y].map(v => Math.round(v * 1000)).join(','))).toBe(true)
  })

  it('draw a lone hex as a one-point line', () => {
    expect(routeLines(g, [at(3, 3)])).toEqual([[[centre(at(3, 3)).x, centre(at(3, 3)).y]]])
  })

  it('tell a line from an area', () => {
    expect(isWide(g, SETS['a line'])).toBe(false)
    expect(isWide(g, SETS['a blob'])).toBe(true)
  })

  it('smooth a line but keep its ends', () => {
    const line: Pt[] = [[0, 0], [1, 0], [1, 1], [2, 1]]
    const s = smoothLine(line)
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1]).toEqual([2, 1])
    expect(s.length).toBeGreaterThan(line.length)
  })
})

describe('decoration', () => {
  const hexes = SETS['a blob']

  it('is the same every time, from the map id and hex index', () => {
    expect(scatterDecor(g, hexes, 'map-1', 2)).toEqual(scatterDecor(g, hexes, 'map-1', 2))
    expect(scatterDecor(g, hexes, 'map-1', 2)).not.toEqual(scatterDecor(g, hexes, 'map-2', 2))
  })

  it("stays put in a hex when other hexes change", () => {
    const one = scatterDecor(g, [at(5, 5)], 'm', 3).map(d => [d.x, d.y])
    const inBlob = scatterDecor(g, hexes, 'm', 3).filter(d => Math.hypot(d.x - centre(at(5, 5)).x, d.y - centre(at(5, 5)).y) < 0.8)
    expect(inBlob.map(d => [d.x, d.y])).toEqual(one)
  })

  it('lies inside its own hex', () => {
    for (const d of scatterDecor(g, hexes, 'm', 4)) {
      const near = hexes.map(i => Math.hypot(d.x - centre(i).x, d.y - centre(i).y))
      expect(Math.min(...near)).toBeLessThan(0.75)
    }
  })

  it('marks the rim, and can be denser there', () => {
    const d = scatterDecor(g, hexes, 'm', 0, 3)
    expect(d.length).toBe(18)
    expect(d.every(x => x.rim)).toBe(true)
  })
})

describe('textures', () => {
  it('cover every Environment space, Enclosure, fill Route and hex Portal in data/map.json', () => {
    const drawn = mapData.types.filter(t =>
      t.kind === 'space' || t.kind === 'enclosure' || (t.kind === 'route' && t.line === 'fill') || (t.kind === 'portal' && t.placement === 'hex'))
    expect(drawn.length).toBeGreaterThan(40)
    for (const t of drawn) expect(hasTexture(t.id), t.id).toBe(true)
  })

  it('fall back on the properties for an unknown type', () => {
    expect(textureOf({ id: 'a', kind: 'space', type: 'lava-lake', at: [], props: { burning: true } })).toBe('fire')
    expect(textureOf({ id: 'a', kind: 'space', type: 'mystery', at: [] })).toBe('flagstone')
  })
})

describe('what each object draws', () => {
  const obj = (o: Partial<MapObject>): MapObject => ({ id: 'o', kind: 'space', type: 'lake', at: encodeRuns(SETS['a blob']), ...o })

  it('draws spaces and enclosures as shapes, walls as lines, doors on their edges, and marks as nothing', () => {
    expect(artOf(g, obj({}), 'm')?.kind).toBe('shape')
    expect(artOf(g, obj({ kind: 'enclosure', type: 'room' }), 'm')?.kind).toBe('shape')
    expect(artOf(g, obj({ kind: 'route', type: 'wall', line: 'edge', at: [ownedEdge(g, at(2, 2), 0), 1] }), 'm')?.kind).toBe('edges')
    expect(artOf(g, obj({ kind: 'portal', type: 'door', at: [ownedEdge(g, at(2, 2), 0), 1] }), 'm')?.kind).toBe('portal')
    expect(artOf(g, obj({ kind: 'portal', type: 'bridge' }), 'm')?.kind).toBe('shape')
    expect(artOf(g, obj({ kind: 'static', type: 'tree' }), 'm')).toBeNull()
  })

  it('gives a narrow road lines only, and a wide one a shape as well', () => {
    const narrow = artOf(g, obj({ kind: 'route', type: 'road', line: 'fill', at: encodeRuns(SETS['a line']) }), 'm')
    const wide = artOf(g, obj({ kind: 'route', type: 'road', line: 'fill' }), 'm')
    expect(narrow?.kind === 'route' && narrow.rings).toBeNull()
    expect(wide?.kind === 'route' && wide.rings?.length).toBe(1)
  })

  it('keys a drawing on what it depends on, not on names or properties', () => {
    const a = obj({})
    expect(artKey({ ...a, name: 'Lake', props: { hidden: 12 } }, 'm')).toBe(artKey(a, 'm'))
    expect(artKey({ ...a, at: encodeRuns([at(1, 1)]) }, 'm')).not.toBe(artKey(a, 'm'))
    expect(artKey({ ...a, type: 'mud' }, 'm')).not.toBe(artKey(a, 'm'))
  })

  it('orders drawings lower layers first, like the fill', () => {
    const objects: MapObject[] = [
      { id: 'room', kind: 'enclosure', type: 'room', at: [], on: 'cave' },
      { id: 'cave', kind: 'enclosure', type: 'cavern', at: [] },
      { id: 'pool', kind: 'space', type: 'pond', at: [], on: 'room' },
      { id: 'tree', kind: 'static', type: 'tree', at: [] },
      { id: 'floor', kind: 'space', type: 'stone', at: [], on: 'cave' },
    ]
    expect(drawOrder({ objects }).map(o => o.id)).toEqual(['cave', 'room', 'floor', 'pool'])
  })
})

describe('performance', () => {
  it('builds every drawing for a 100×100 map quickly', () => {
    const big = generateMap('cave', 'Big', 'large', 'perf', 100, 100)
    const grid: Grid = { width: 100, height: 100 }
    const t0 = performance.now()
    for (const o of big.objects) artOf(grid, o, 'perf')
    // A generous budget for CI; locally this takes a few tens of milliseconds.
    expect(performance.now() - t0).toBeLessThan(2000)
  })
})
