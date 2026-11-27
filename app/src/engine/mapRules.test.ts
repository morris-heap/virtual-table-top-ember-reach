import { describe, expect, it } from 'vitest'
import core from '../../../data/core.json'
import { edgeBetween, indexOf } from './hex.ts'
import { newMap, type MapDoc, type MapObject } from './mapModel.ts'
import { canCross, DIFFICULT_COST, enterCost, resolveHex, shortestPath } from './mapRules.ts'

const grid = { width: 10, height: 10 }
const map = (objects: MapObject[]): MapDoc => ({ ...newMap('Test', 'small', 10, 10), id: 'm', updatedAt: '', objects })
const X = indexOf(grid, 4, 4)
const left = indexOf(grid, 3, 4)
const right = indexOf(grid, 5, 4)
const Y = indexOf(grid, 4, 5)
const all: number[] = [0, 100]

describe('Difficult costs zones (core rules §6.3)', () => {
  it('takes the cost and the cap from data/core.json', () => {
    expect(DIFFICULT_COST).toBe(Math.min(core.movement.difficultCost, core.movement.difficultCap))
    expect(DIFFICULT_COST).toBe(2)
  })

  it('costs 1 to enter open ground and the Difficult cost to enter Difficult ground', () => {
    const m = map([
      { id: 'o1', kind: 'space', type: 'meadow', at: all },
      { id: 'o2', kind: 'space', type: 'mud', at: [X, 1] },
    ])
    expect(enterCost(m, left, Y)).toEqual({ cost: 1 })
    expect(enterCost(m, left, X)).toEqual({ cost: DIFFICULT_COST })
    // Leaving Difficult ground costs nothing extra.
    expect(enterCost(m, X, right)).toEqual({ cost: 1 })
  })

  it('never stacks past the cap, however many layers are Difficult', () => {
    const m = map([
      { id: 'o1', kind: 'space', type: 'mud', at: [X, 1] },
      { id: 'o2', kind: 'space', type: 'snow', at: [X, 1] },
      { id: 'o3', kind: 'space', type: 'rubble', at: [X, 1] },
      { id: 'o4', kind: 'route', type: 'shaft', line: 'fill', at: [X, 1] },
    ])
    expect(resolveHex(m, X).difficult.sources).toHaveLength(4)
    expect(enterCost(m, left, X)).toEqual({ cost: core.movement.difficultCap })
  })

  it("won't let you enter an Impassable hex", () => {
    const m = map([{ id: 'o1', kind: 'space', type: 'chasm', at: [X, 1] }])
    expect(enterCost(m, left, X)).toEqual({ impassable: true })
    const boulder = map([{ id: 'o1', kind: 'static', type: 'boulder', at: [X, 1] }])
    expect(enterCost(boulder, left, X)).toEqual({ impassable: true })
  })
})

describe('paper test (b): mud, fire and a snowstorm on one hex', () => {
  const snowstorm = { name: 'snowstorm', difficult: true, obscured: true }
  const objects: MapObject[] = [
    // The paper test's valley is an Enclosure; the catalog's `valley` type is an Environment space, so a realm stands in.
    { id: 'k', kind: 'enclosure', type: 'realm', at: all, props: { weather: snowstorm } },
    { id: 'm', kind: 'space', type: 'mud', on: 'k', at: [X, 1] },
    { id: 'f', kind: 'space', type: 'brush-fire', on: 'k', at: [X, 1] },
  ]

  it('costs 2 zones, not 3: mud and the snowstorm are both Difficult, and Difficult stacks by max', () => {
    const r = resolveHex(map(objects), X)
    expect(r.difficult).toEqual({ value: true, sources: ['k', 'm'] })
    expect(r.obscured.value).toBe(true)
    expect(r.burning.value).toBe(true)
    expect(enterCost(map(objects), left, X)).toEqual({ cost: 2 })
  })

  it('makes the open ground around it Difficult too, through the weather', () => {
    expect(enterCost(map(objects), X, right)).toEqual({ cost: 2 })
  })

  it('keeps the snowstorm out of a hut with shelter, but the hut keeps its own floor', () => {
    const hutHex = indexOf(grid, 7, 7)
    const withHut = map([
      ...objects,
      { id: 'h', kind: 'enclosure', type: 'hut', on: 'k', at: [hutHex, 1] },
      { id: 'fl', kind: 'space', type: 'stone', on: 'h', at: [hutHex, 1] },
    ])
    const r = resolveHex(withHut, hutHex)
    expect(r.difficult).toBeUndefined()
    expect(r.obscured).toBeUndefined()
    expect(enterCost(withHut, indexOf(grid, 7, 6), hutHex)).toEqual({ cost: 1 })
  })
})

describe('paper test (c): a river with a bridge', () => {
  const r1 = indexOf(grid, 4, 3)
  const objects: MapObject[] = [
    { id: 'w', kind: 'space', type: 'meadow', at: all },
    { id: 'rv', kind: 'route', type: 'river', line: 'fill', on: 'w', at: [indexOf(grid, 4, 0), 1, r1, 1, X, 1, Y, 1] },
    { id: 'b', kind: 'portal', type: 'bridge', on: 'rv', links: ['rv'], at: [r1, 1, X, 1] },
  ]

  it('covers deep-water for a hero crossing the bridge, so the hex is open ground', () => {
    const r = resolveHex(map(objects), X)
    expect(r['deep-water']).toBeUndefined()
    expect(enterCost(map(objects), left, X)).toEqual({ cost: 1 })
  })

  it('leaves deep-water for a hero swimming under it, who stands on the river', () => {
    expect(resolveHex(map(objects), X, 'rv')['deep-water']).toEqual({ value: 12, sources: ['rv'] })
  })

  it('has deep-water on the river where there is no bridge', () => {
    expect(resolveHex(map(objects), Y)['deep-water']?.value).toBe(12)
  })

  it('treats a ford the same way: it covers deep-water and is Difficult itself', () => {
    const ford = map([...objects, { id: 'fd', kind: 'route', type: 'ford', line: 'fill', on: 'rv', at: [Y, 1] }])
    expect(resolveHex(ford, Y)['deep-water']).toBeUndefined()
    expect(enterCost(ford, indexOf(grid, 3, 5), Y)).toEqual({ cost: DIFFICULT_COST })
  })
})

describe('edges: walls, fences and Portals', () => {
  const wallEdge = edgeBetween(grid, left, X)!

  it('blocks crossing a wall or fence edge, in both directions, and nothing else', () => {
    for (const type of ['wall', 'fence']) {
      const m = map([{ id: 'o1', kind: 'route', type, line: 'edge', at: [wallEdge, 1] }])
      expect(canCross(m, left, X)).toBe(false)
      expect(canCross(m, X, left)).toBe(false)
      expect(enterCost(m, left, X)).toEqual({ impassable: true })
      expect(canCross(m, X, right)).toBe(true)
    }
  })

  it('lets you through a door or an opening in the wall', () => {
    for (const type of ['door', 'secret-door', 'gate', 'opening']) {
      const m = map([
        { id: 'o1', kind: 'route', type: 'wall', line: 'edge', at: [wallEdge, 1] },
        { id: 'o2', kind: 'portal', type, links: ['o1'], at: [wallEdge, 1] },
      ])
      expect(canCross(m, left, X)).toBe(true)
    }
  })

  it("doesn't let you climb through a window or an arrow slit", () => {
    for (const type of ['window', 'arrow-slit']) {
      const m = map([
        { id: 'o1', kind: 'route', type: 'wall', line: 'edge', at: [wallEdge, 1] },
        { id: 'o2', kind: 'portal', type, at: [wallEdge, 1] },
      ])
      expect(canCross(m, left, X)).toBe(false)
    }
  })

  it('ignores a wall whose author switched blocking off', () => {
    const m = map([{ id: 'o1', kind: 'route', type: 'wall', line: 'edge', at: [wallEdge, 1], props: { blocks: 'sight' } }])
    expect(canCross(m, left, X)).toBe(true)
  })
})

describe('shortest path', () => {
  it('goes round a wall and counts Difficult hexes as 2', () => {
    const open = map([])
    expect(shortestPath(open, indexOf(grid, 0, 0), indexOf(grid, 0, 5))?.cost).toBe(5)
    const mud = map([{ id: 'o1', kind: 'space', type: 'mud', at: [indexOf(grid, 0, 1), 1] }])
    // Through the mud is 2 + 4 = 6 zones; stepping round it is 6 hexes. Either way, 6.
    expect(shortestPath(mud, indexOf(grid, 0, 0), indexOf(grid, 0, 5))?.cost).toBe(6)
    const walled = map([{ id: 'o1', kind: 'space', type: 'chasm', at: [indexOf(grid, 0, 5), 10] }])
    expect(shortestPath(walled, 0, indexOf(grid, 0, 9))).toBeNull()
  })
})
