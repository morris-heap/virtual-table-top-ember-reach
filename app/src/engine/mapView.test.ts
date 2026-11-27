import { describe, expect, it } from 'vitest'
import { gridPixels, hexAt, hexCenter } from './hex.ts'
import { newMap, type MapObject } from './mapModel.ts'
import { fillOf, fitView, markOf, MAX_HEX, MIN_HEX, paintOf, panBy, visibleRange, zoomAt } from './mapView.ts'

const large = { width: 100, height: 100 }

describe('the view', () => {
  it('fits a map inside the box and centres it', () => {
    const v = fitView({ width: 30, height: 30 }, 800, 600)
    const px = gridPixels({ width: 30, height: 30 }, v.size)
    expect(px.width).toBeLessThanOrEqual(800)
    expect(px.height).toBeLessThanOrEqual(600)
    expect(v.x).toBeCloseTo((800 - px.width) / 2)
  })

  it('keeps hexes big enough to tap on a phone, so a Large map pans instead of shrinking away', () => {
    expect(fitView(large, 360, 500).size).toBe(MIN_HEX)
  })

  it('zooms about the pointer, so the hex under it stays under it', () => {
    const v = { size: 10, x: 5, y: 7 }
    const before = hexAt(large, 200 - v.x, 150 - v.y, v.size)
    const z = zoomAt(v, 2, 200, 150)
    expect(z.size).toBe(20)
    expect(hexAt(large, 200 - z.x, 150 - z.y, z.size)).toBe(before)
  })

  it('clamps zoom', () => {
    expect(zoomAt({ size: 10, x: 0, y: 0 }, 100, 0, 0).size).toBe(MAX_HEX)
    expect(zoomAt({ size: 10, x: 0, y: 0 }, 0.01, 0, 0).size).toBe(MIN_HEX)
  })

  it('pans', () => {
    expect(panBy({ size: 10, x: 1, y: 2 }, 3, -4)).toEqual({ size: 10, x: 4, y: -2 })
  })
})

describe('visible hexes', () => {
  it('draws only what is on screen at 100×100, a small fraction of 10,000 hexes', () => {
    const r = visibleRange(large, { size: 20, x: -500, y: -500 }, 360, 640)
    const count = (r.col1 - r.col0 + 1) * (r.row1 - r.row0 + 1)
    expect(count).toBeLessThan(400)
  })

  it('includes every hex whose centre is on screen', () => {
    const v = { size: 12, x: -300, y: -200 }
    const r = visibleRange(large, v, 400, 300)
    for (let i = 0; i < 100 * 100; i += 7) {
      const c = hexCenter(large, i, v.size)
      const sx = c.x + v.x
      const sy = c.y + v.y
      if (sx < 0 || sy < 0 || sx > 400 || sy > 300) continue
      const col = i % 100
      const row = Math.floor(i / 100)
      expect(col >= r.col0 && col <= r.col1 && row >= r.row0 && row <= r.row1).toBe(true)
    }
  })

  it('is clamped to the grid', () => {
    expect(visibleRange({ width: 5, height: 5 }, { size: 10, x: 0, y: 0 }, 2000, 2000)).toEqual({ col0: 0, col1: 4, row0: 0, row1: 4 })
  })
})

describe('what each hex looks like', () => {
  const map = (objects: MapObject[]) => ({ ...newMap('T', 'small', 10, 10), objects })

  it('fills each hex with its highest layer', () => {
    const p = paintOf(map([
      { id: 'o1', kind: 'enclosure', type: 'cavern', at: [0, 100] },
      { id: 'o2', kind: 'space', type: 'rock-floor', on: 'o1', at: [0, 100] },
      { id: 'o3', kind: 'space', type: 'mud', on: 'o1', at: [5, 1] },
      { id: 'o4', kind: 'space', type: 'chasm', at: [6, 1] },
    ]))
    expect(p.fill[0]).toBe(1)
    expect(p.fill[5]).toBe(2)
    // The chasm sits on nothing, so the cavern's floor (a layer up) covers it.
    expect(p.fill[6]).toBe(1)
  })

  it('collects marks, edges and GM-only hexes, including what sits on a GM-only object', () => {
    const p = paintOf(map([
      { id: 's', kind: 'enclosure', type: 'room', at: [10, 2], gmOnly: true },
      { id: 'f', kind: 'space', type: 'stone', on: 's', at: [10, 2] },
      { id: 'w', kind: 'route', type: 'wall', line: 'edge', at: [3, 2] },
      { id: 'x', kind: 'static', type: 'start', at: [50, 1] },
    ]))
    expect([...p.gm.slice(10, 12)]).toEqual([1, 1])
    expect(p.edges.map(e => e.e)).toEqual([3, 4])
    expect(p.marks).toEqual([{ hex: 50, o: expect.objectContaining({ id: 'x' }) }])
  })

  it('colours by what acts first, then by type and kind', () => {
    const o = (type: string, kind: MapObject['kind'] = 'space'): MapObject => ({ id: 'o', kind, type, at: [] })
    expect(fillOf(o('solid-rock'))).toBe('rock')
    expect(fillOf(o('rubble'))).toBe('rough')
    expect(fillOf(o('forest'))).toBe('forest')
    expect(fillOf(o('lake'))).toBe('water')
    expect(fillOf(o('fire'))).toBe('fire')
    expect(fillOf(o('road', 'route'))).toBe('road')
    expect(fillOf(o('room', 'enclosure'))).toBe('room')
    expect(fillOf({ ...o('rubble'), props: { difficult: false } })).toBe('floor')
    expect(markOf(o('start', 'static'))).toBe('S')
    expect(markOf(o('foe', 'entity'))).toBe('F')
  })
})
