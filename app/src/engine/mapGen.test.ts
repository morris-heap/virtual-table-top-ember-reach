import { describe, expect, it } from 'vitest'
import { chunkRuns, GENERATORS, generateMap, markers, seededRng } from './mapGen.ts'
import { MAP_LIMITS, mapWarnings } from './mapModel.ts'
import { shortestPath } from './mapRules.ts'

const KINDS = GENERATORS.map(g => g.id)

describe('the seeded RNG', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = seededRng('ember')
    const b = seededRng('ember')
    const c = seededRng('ash')
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect([c(), c(), c()]).not.toEqual(xs)
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true)
  })
})

describe.each(KINDS)('the %s generator', kind => {
  it('gives the same map for the same seed', () => {
    expect(generateMap(kind, 'A', 'small', 'hearth')).toEqual(generateMap(kind, 'A', 'small', 'hearth'))
  })

  it('gives a different map for a different seed', () => {
    expect(generateMap(kind, 'A', 'small', 'hearth').objects).not.toEqual(generateMap(kind, 'A', 'small', 'soot').objects)
  })

  it('always has a path from the start to the exit (40 seeds, small)', () => {
    for (let s = 0; s < 40; s++) {
      const m = generateMap(kind, 'A', 'small', `seed-${s}`)
      const { start, exit } = markers(m)
      expect(start).toBeDefined()
      expect(exit).toBeDefined()
      expect(start).not.toBe(exit)
      expect(shortestPath(m, start!, exit!), `seed-${s}`).not.toBeNull()
      expect(mapWarnings(m), `seed-${s}`).toEqual([])
    }
  })

  it('works at the smallest size and on a non-square map', () => {
    for (const [w, h] of [[5, 5], [5, 30], [30, 7]]) {
      const m = generateMap(kind, 'A', 'small', 'tiny', w, h)
      const { start, exit } = markers(m)
      expect(shortestPath(m, start!, exit!)).not.toBeNull()
      expect(mapWarnings(m)).toEqual([])
    }
  })

  it('fits a Large map inside the save limits, with a path', () => {
    for (const seed of ['one', 'two']) {
      const m = generateMap(kind, 'A', 'large', seed)
      expect([m.width, m.height]).toEqual([100, 100])
      expect(mapWarnings(m)).toEqual([])
      const { start, exit } = markers(m)
      expect(shortestPath(m, start!, exit!)).not.toBeNull()
    }
  })
})

describe('chunking runs', () => {
  it('splits long runs into pieces under the per-object limit, on pair boundaries', () => {
    const runs = Array.from({ length: 5000 }, (_, k) => (k % 2 ? 1 : k * 2))
    const parts = chunkRuns(runs)
    expect(parts.flat()).toEqual(runs)
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(MAP_LIMITS.runNumbersMax)
      expect(p.length % 2).toBe(0)
    }
  })
})
