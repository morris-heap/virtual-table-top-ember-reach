import { describe, expect, it } from 'vitest'
import mapData from '../../../data/map.json'
import { DIRECTIONS, edgeHexes, edgesAround, edgeSegment, hexAt, hexCenter, hexCount, indexOf, neighbour, ownedEdge, type Grid } from './hex.ts'
import {
  artKey, artOf, BRIDGE_WIDTH, bridgeDeck, openLeaf, bridgeOf, PASSAGE_WIDTH, portalLength, portalSize, TOKEN_RADIUS, WALL_WIDTH, chainSegments, frameOf, guideOf, relax, shapeParts, snapChain, snapSegment, type Guide, drawOrder, edgeChains, hasTexture, isWide, pointInRings, routeLines, scatterDecor, shapeOf,
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
  'a two-hex-wide diagonal band': [3, 4, 5, 6, 7, 8].flatMap(k => [at(k, k - 2), at(k, k - 1)]),
  'a hex and its six neighbours (a hut)': [at(6, 5), ...ring(6, 5)],
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
    expect(artOf(g, obj({ kind: 'portal', type: 'bridge' }), 'm')?.kind).toBe('bridge')
    expect(artOf(g, obj({ kind: 'portal', type: 'trap-door' }), 'm')?.kind).toBe('hatch')
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

describe('smoothing (VTTER-123)', () => {
  /** How far each point of the outline is from the shape's middle, as max ÷ min. A circle is 1. */
  function roundness(hexes: number[]) {
    const [r] = shapeOf(g, hexes, 'm|hut')
    const cx = r.reduce((a, p) => a + p[0], 0) / r.length
    const cy = r.reduce((a, p) => a + p[1], 0) / r.length
    const d = r.map(p => Math.hypot(p[0] - cx, p[1] - cy))
    return Math.max(...d) / Math.min(...d)
  }

  const hut = () => [at(6, 5), ...ring(6, 5)]

  it('turns a 7-hex hut round rather than a flower of hexes', () => {
    // The raw outline swings between the outer corners (radius ≈ 2.65) and the notches (≈ 1.73): a ratio near 1.5.
    expect(roundness(hut())).toBeLessThan(1.15)
  })

  it('keeps the shape its size, unlike plain averaging', () => {
    const [r] = shapeOf(g, hut(), 'm|hut')
    let area = 0
    for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; area += a[0] * b[1] - b[0] * a[1] }
    // Seven hexes of radius 1 cover 7 × 2.598 ≈ 18.2.
    expect(Math.abs(area / 2)).toBeGreaterThan(18.2 * 0.85)
    expect(Math.abs(area / 2)).toBeLessThan(18.2 * 1.15)
  })

  it('removes a hex zigzag and leaves pinned points where they are', () => {
    const zigzag: Pt[] = Array.from({ length: 12 }, (_, k) => [k, k % 2 ? 0.5 : 0] as Pt)
    const out = relax(zigzag, false)
    expect(out[0]).toEqual(zigzag[0])
    expect(out[11]).toEqual(zigzag[11])
    const inner = out.slice(3, 9).map(p => p[1])
    expect(Math.max(...inner) - Math.min(...inner)).toBeLessThan(0.1)
    const pinned = relax([[0, 0], [1, 1], [2, 0], [1, -1]], true, k => k === 1)
    expect(pinned[1]).toEqual([1, 1])
  })

  it('draws a wide route as one band with no centre lines, and a thin one as lines', () => {
    const wide = artOf(g, { id: 'r', kind: 'route', type: 'river', line: 'fill', at: encodeRuns(SETS['a two-hex-wide diagonal band']) }, 'm')
    expect(wide?.kind === 'route' && wide.rings?.length).toBe(1)
    expect(wide?.kind === 'route' && wide.lines).toEqual([])
    const thin = artOf(g, { id: 'r', kind: 'route', type: 'river', line: 'fill', at: encodeRuns(SETS['a line']) }, 'm')
    expect(thin?.kind === 'route' && thin.lines.length).toBeGreaterThan(0)
  })
})

describe('bridges (VTTER-123)', () => {
  it('run along their own hexes when they have two or more', () => {
    const a = at(4, 4)
    const b = neighbour(g, a, 'se')!
    const br = bridgeOf(g, [a, b], new Set())!
    const len = Math.hypot(centre(b).x - centre(a).x, centre(b).y - centre(a).y)
    const along = (br.ux * (centre(b).x - centre(a).x) + br.uy * (centre(b).y - centre(a).y)) / len
    expect(Math.abs(along)).toBeCloseTo(1)
    // It reaches past both hex centres onto the banks.
    expect(br.half).toBeGreaterThan(len / 2)
  })

  it('lie across the river under a one-hex bridge', () => {
    // A river running straight down one column: the bridge must run left to right.
    const river = new Set([1, 2, 3, 4, 5, 6, 7].map(r => at(5, r)))
    const br = bridgeOf(g, [at(5, 4)], river)!
    expect(Math.abs(br.uy)).toBeLessThan(0.01)
    expect(Math.abs(br.ux)).toBeCloseTo(1)
    expect([br.cx, br.cy]).toEqual([centre(at(5, 4)).x, centre(at(5, 4)).y])
  })

  it('find the route under a one-hex bridge on the map, and rebuild when that route changes', () => {
    const riverAt = [1, 2, 3, 4, 5].map(r => at(5, r))
    const river: MapObject = { id: 'riv', kind: 'route', type: 'river', line: 'fill', at: encodeRuns(riverAt) }
    const bridge: MapObject = { id: 'b', kind: 'portal', type: 'bridge', at: encodeRuns([at(5, 3)]) }
    const art = artOf(g, bridge, 'm', [river, bridge])
    expect(art?.kind === 'bridge' && Math.abs(art.bridge.uy)).toBeLessThan(0.01)
    const moved = { ...river, at: encodeRuns([...riverAt, at(6, 3)]) }
    expect(artKey(bridge, 'm', [river, bridge])).not.toBe(artKey(bridge, 'm', [moved, bridge]))
  })
})

describe('the art frame (VTTER-123)', () => {
  /** Points every 1/200 of the way round the frame. */
  function around(f: { x0: number; y0: number; x1: number; y1: number }): Pt[] {
    const out: Pt[] = []
    for (let k = 0; k <= 200; k++) {
      const t = k / 200
      const x = f.x0 + (f.x1 - f.x0) * t
      const y = f.y0 + (f.y1 - f.y0) * t
      out.push([x, f.y0], [x, f.y1], [f.x0, y], [f.x1, y])
    }
    return out
  }

  it('sits inside the map hexes on all four sides, so no border notch shows', () => {
    for (const grid of [g, { width: 30, height: 20 }, { width: 5, height: 5 }]) {
      for (const [x, y] of around(frameOf(grid))) {
        expect(hexAt(grid, x, y, 1), `${grid.width}×${grid.height} at ${x.toFixed(2)},${y.toFixed(2)}`).not.toBeNull()
      }
    }
  })

  it('is filled by a shape that covers the whole map, all the way round', () => {
    const rings = shapeOf(g, Array.from({ length: hexCount(g) }, (_, i) => i), 'm|base')
    for (const [x, y] of around(frameOf(g))) expect(pointInRings(rings, x, y), `${x.toFixed(2)},${y.toFixed(2)}`).toBe(true)
  })
})

describe('walls and doors snap to the outline (VTTER-126)', () => {
  const hut = () => [at(6, 5), ...ring(6, 5)]

  /** The edges on the boundary of a set of hexes: one side inside, the other outside or off the map. */
  function boundary(hexes: number[]): number[] {
    const set = new Set(hexes)
    const out = new Set<number>()
    for (const h of hexes) for (const e of edgesAround(g, h)) {
      const { owner, other } = edgeHexes(g, e)
      if (set.has(owner) !== (other !== null && set.has(other))) out.add(e)
    }
    return [...out]
  }

  /** How far a point is from a closed polyline. */
  function offRing(r: Pt[], [x, y]: Pt): number {
    let best = Infinity
    for (let k = 0; k < r.length; k++) {
      const [ax, ay] = r[k]
      const [bx, by] = r[(k + 1) % r.length]
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)) : 0
      best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)))
    }
    return best
  }

  const hutParts = () => shapeParts(g, hut(), 'm|hut')

  it('maps every raw corner and side of a shape onto its smoothed outline', () => {
    const parts = hutParts()
    const gd = guideOf([parts])
    const [raw] = parts.raw
    const [smooth] = parts.rings
    expect(gd.corners.size).toBe(raw.length)
    expect(gd.sides.size).toBe(raw.length * 2) // both directions
    for (const p of gd.corners.values()) expect(offRing(smooth, p)).toBeLessThan(1e-9)
    for (const pts of gd.sides.values()) for (const p of pts) expect(offRing(smooth, p)).toBeLessThan(1e-9)
  })

  it('lays a wall all the way round a round hut on its outline, as one continuous line', () => {
    const parts = hutParts()
    const gd = guideOf([parts])
    const chains = edgeChains(g, boundary(hut()))
    expect(chains).toHaveLength(1)
    const snapped = snapChain(chains[0], [gd])
    for (const p of snapped) expect(offRing(parts.rings[0], p)).toBeLessThan(1e-9)
    // Far more points than the 18 raw corners: it follows the curve, not the hex edges.
    expect(snapped.length).toBeGreaterThan(chains[0].length * 3)
    // A closed wall stays closed.
    expect(snapped[0]).toEqual(snapped[snapped.length - 1])
  })

  it('keeps a wall sticking out of a room straight, joined exactly to the curve', () => {
    const parts = hutParts()
    const gd = guideOf([parts])
    const [raw] = parts.raw
    // One side of the hut's boundary, then out along an edge that is not on it: the north-east edge of the hex just
    // below the hut, which lies between two outside hexes and touches the hut at its top corner.
    const outside = neighbour(g, neighbour(g, at(6, 5), 's')!, 's')!
    const stubEdge = ownedEdge(g, outside, 1)
    const { owner, other } = edgeHexes(g, stubEdge)
    expect(hut().includes(owner) || (other !== null && hut().includes(other))).toBe(false)
    const [s0, s1] = edgeSegment(g, stubEdge, 1)
    const key = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
    const onHut = raw.findIndex(p => key(p) === key(s0) || key(p) === key(s1))
    expect(onHut).toBeGreaterThanOrEqual(0) // the stub touches the hut
    const joint = raw[onHut]
    const far = key(s0) === key(joint) ? s1 : s0
    const chain: Pt[] = [raw[(onHut + raw.length - 1) % raw.length], joint, far]
    const snapped = snapChain(chain, [gd])
    // The curve part ends at the joint's point on the outline, the stub starts there, and its far end is untouched.
    expect(snapped).toContainEqual(gd.corners.get(key(joint))!)
    expect(snapped[snapped.length - 1]).toEqual(far)
    expect(snapped[snapped.length - 2]).toEqual(gd.corners.get(key(joint))!)
  })

  it('leaves a wall on no shape exactly where it was', () => {
    const chain = edgeChains(g, [ownedEdge(g, at(1, 1), 0), ownedEdge(g, at(1, 1), 1)])[0]
    expect(snapChain(chain, [guideOf([hutParts()])])).toEqual(chain)
  })

  it('centres a door on its stretch of the curve, turned to it, as long as the stretch', () => {
    const parts = hutParts()
    const gd = guideOf([parts])
    const e = boundary(hut())[0]
    const [a, b] = snapSegment(edgeSegment(g, e, 1), [gd])
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    // The middle sits on the outline (to within the bend of one short stretch).
    expect(offRing(parts.rings[0], m)).toBeLessThan(0.02)
    const [r0, r1] = edgeSegment(g, e, 1)
    const key = (p: Pt) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
    const pts = gd.sides.get(`${key(r0)}>${key(r1)}`)!
    const chord = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1])
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(chord)
  })

  it('prefers the first guide (the Enclosure the wall sits on) where two shapes share a side', () => {
    const mine = guideOf([hutParts()])
    const other: Guide = { sides: new Map([...mine.sides].map(([k, v]) => [k, v.map(([x, y]) => [x + 1, y] as Pt)])), corners: new Map() }
    const chain = edgeChains(g, boundary(hut()))[0]
    expect(snapChain(chain, [mine, other])).toEqual(snapChain(chain, [mine]))
    expect(snapChain(chain, [other, mine])).not.toEqual(snapChain(chain, [mine]))
  })

  it('is the same every time', () => {
    const chain = edgeChains(g, boundary(hut()))[0]
    expect(snapChain(chain, [guideOf([hutParts()])])).toEqual(snapChain(chain, [guideOf([hutParts()])]))
  })
})

describe('bridge size (VTTER-126)', () => {
  /** True when a point is on the deck: within half its length along it and half its width across. */
  const onDeck = (b: NonNullable<ReturnType<typeof bridgeOf>>, x: number, y: number) =>
    Math.abs((x - b.cx) * b.ux + (y - b.cy) * b.uy) <= b.half + 1e-9 && Math.abs((x - b.cx) * -b.uy + (y - b.cy) * b.ux) <= b.width / 2 + 1e-9

  it('keeps one hex, and a one-hex-wide line, at the plain width', () => {
    expect(bridgeOf(g, [at(5, 4)], new Set())!.width).toBe(BRIDGE_WIDTH)
    expect(bridgeOf(g, [at(3, 4), at(4, 4), at(5, 4), at(6, 4)], new Set())!.width).toBe(BRIDGE_WIDTH)
  })

  it('widens to cover a bridge painted three hexes wide', () => {
    const river = new Set([...Array(10).keys()].flatMap(r => [at(5, r), at(6, r)]))
    const hexes = [3, 4, 5].flatMap(r => [at(4, r), at(5, r), at(6, r), at(7, r)])
    const br = bridgeOf(g, hexes, river)!
    expect(br.width).toBeGreaterThan(BRIDGE_WIDTH * 3)
    for (const h of hexes) expect(onDeck(br, centre(h).x, centre(h).y), `hex ${h}`).toBe(true)
  })

  it('lies across the river it stands over, even when painted longer along it', () => {
    // A river straight down two columns, and a bridge block taller (along the river) than it is wide.
    const river = new Set([...Array(10).keys()].flatMap(r => [at(5, r), at(6, r)]))
    const hexes = [2, 3, 4, 5, 6].flatMap(r => [at(5, r), at(6, r)])
    const br = bridgeOf(g, hexes, river)!
    expect(Math.abs(br.uy)).toBeLessThan(0.1) // runs left to right, across the river
  })
})

describe('door and bridge proportions (VTTER-128)', () => {
  it('fills the whole gap with a door, secret door, gate or portcullis, at the wall thickness', () => {
    for (const type of ['door', 'secret-door', 'gate', 'portcullis']) {
      expect(portalSize(type), type).toMatchObject({ span: 1, thick: WALL_WIDTH })
      // A long gap is filled end to end.
      expect(portalLength(type, 3)).toBe(3)
    }
  })

  it('makes every passage wide enough for a token to pass through, even in a short gap', () => {
    // A token is 2 × 0.62 = 1.24 across; one hex side is only 1, and a snapped side is shorter still.
    expect(PASSAGE_WIDTH).toBeGreaterThan(2 * TOKEN_RADIUS)
    for (const type of ['door', 'secret-door', 'gate', 'portcullis', 'opening', 'hole']) {
      expect(portalLength(type, 0.8), type).toBe(PASSAGE_WIDTH)
      expect(portalLength(type, 1), type).toBeGreaterThan(2 * TOKEN_RADIUS)
    }
  })

  it('sets windows and arrow slits into the wall, thinner, with a narrow slit, and never widens them', () => {
    expect(portalSize('window').thick).toBeLessThan(WALL_WIDTH)
    expect(portalSize('arrow-slit').span).toBeLessThan(portalSize('window').span)
    expect(portalLength('window', 0.8)).toBeCloseTo(0.72)
    expect(portalLength('arrow-slit', 1)).toBeCloseTo(0.35)
  })

  it('puts the rails on the long sides of a bridge longer than it is wide', () => {
    const d = bridgeDeck({ cx: 0, cy: 0, ux: 1, uy: 0, half: 2, width: 1 })
    expect(d.long).toBe(4)
    expect(d.short).toBe(1)
    expect(d.angle).toBeCloseTo(0)
  })

  it('turns a bridge painted wider than it is long, so its rails are still on its long sides', () => {
    // Crossing direction left to right, but the deck is 4 wide and only 2 long.
    const d = bridgeDeck({ cx: 3, cy: 5, ux: 1, uy: 0, half: 1, width: 4 })
    expect(d.long).toBe(4)
    expect(d.short).toBe(2)
    expect(Math.abs(Math.cos(d.angle))).toBeLessThan(1e-9) // the long side now runs up and down
    expect([d.cx, d.cy]).toEqual([3, 5])
  })

  it('keeps the deck the same size either way round', () => {
    const b = { cx: 0, cy: 0, ux: 0.6, uy: 0.8, half: 0.7, width: 3 }
    const d = bridgeDeck(b)
    expect(d.long * d.short).toBeCloseTo(b.half * 2 * b.width)
  })
})

describe('an open door (VTTER-129)', () => {
  it('swings its leaf 90° on the hinge at one jamb, leaving the doorway clear', () => {
    const { hinge, tip, arc } = openLeaf(1.4)
    expect(hinge).toEqual([-0.7, 0])
    // The leaf is as long as the doorway and stands straight out from the wall.
    expect(Math.hypot(tip[0] - hinge[0], tip[1] - hinge[1])).toBeCloseTo(1.4)
    expect(tip[0]).toBeCloseTo(hinge[0])
    // Its swing is a quarter circle about the hinge, from the open leaf to the far jamb.
    expect(arc).toEqual({ cx: -0.7, cy: 0, r: 1.4, from: -Math.PI / 2, to: 0 })
    expect(arc.cx + arc.r * Math.cos(arc.to)).toBeCloseTo(0.7)
  })
})
