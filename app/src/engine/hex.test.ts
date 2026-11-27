import { describe, expect, it } from 'vitest'
import {
  distance, edgeAt, edgeBetween, edgeCount, edgeHexes, edgesAround, hexAt, hexCenter, indexOf, neighbour, neighbours, ownedEdge,
} from './hex.ts'

const small = { width: 30, height: 30 }

describe('hex indexes and edges (data-model.md, Coordinates)', () => {
  it('numbers hexes row by row', () => {
    expect(indexOf(small, 10, 10)).toBe(310)
    expect(indexOf(small, 17, 12)).toBe(377)
  })

  it('numbers edges as d × hexes + i, matching the Forge corridor example', () => {
    // North edges of row 10, columns 10–17 are edges 310–317; of row 13, 400–407.
    expect(ownedEdge(small, 310, 0)).toBe(310)
    expect(ownedEdge(small, 407, 0)).toBe(407)
    // The east end of the corridor: north-east and south-east edges of column 17.
    expect([317, 347, 377].map(i => ownedEdge(small, i, 1))).toEqual([1217, 1247, 1277])
    expect([317, 347, 377].map(i => ownedEdge(small, i, 2))).toEqual([2117, 2147, 2177])
    expect(edgeCount(small)).toBe(2700)
  })

  it('gives every shared edge exactly one index, from either side', () => {
    for (const i of [0, 31, 310, 377, 899]) {
      for (const nb of neighbours(small, i)) {
        expect(edgeBetween(small, i, nb)).toBe(edgeBetween(small, nb, i))
        const { owner, other } = edgeHexes(small, edgeBetween(small, i, nb)!)
        expect([owner, other].sort()).toEqual([i, nb].sort())
      }
    }
    expect(edgeBetween(small, 0, 5)).toBeNull()
  })

  it('finds six edges around an inner hex and fewer on the border', () => {
    expect(new Set(edgesAround(small, 310)).size).toBe(6)
    expect(edgesAround(small, 899).length).toBeLessThan(6)
  })

  it('offsets odd columns half a hex down (odd-q)', () => {
    // Even column: north-east is one row up. Odd column: it's the same row.
    expect(neighbour(small, indexOf(small, 2, 5), 'ne')).toBe(indexOf(small, 3, 4))
    expect(neighbour(small, indexOf(small, 3, 5), 'ne')).toBe(indexOf(small, 4, 5))
    expect(neighbour(small, 0, 'n')).toBeNull()
  })
})

describe('distance (1 hex = 1 zone)', () => {
  it('is 1 to every neighbour and 0 to itself', () => {
    expect(distance(small, 310, 310)).toBe(0)
    for (const nb of neighbours(small, 310)) expect(distance(small, 310, nb)).toBe(1)
  })

  it('counts a straight line of hexes', () => {
    expect(distance(small, indexOf(small, 0, 0), indexOf(small, 0, 7))).toBe(7)
    expect(distance(small, indexOf(small, 0, 0), indexOf(small, 6, 3))).toBe(6)
  })
})

describe('pixels', () => {
  it('finds the hex under its own centre', () => {
    for (const i of [0, 29, 310, 377, 899]) {
      const { x, y } = hexCenter(small, i, 20)
      expect(hexAt(small, x, y, 20)).toBe(i)
    }
    expect(hexAt(small, -50, -50, 20)).toBeNull()
  })

  it('finds an edge near its midpoint', () => {
    const { x, y } = hexCenter(small, 310, 20)
    // Just inside the top of hex 310 is its north edge.
    expect(edgeAt(small, x, y - 16, 20)).toBe(310)
  })
})
