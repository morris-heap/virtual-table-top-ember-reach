import { describe, expect, it } from 'vitest'
import { freeSpot, mouseVelocity, THROW, throwFromSamples, type MouseSample, type Obstacle } from './diceThrow'

const move = (dx: number, dz: number, ms: number, now = 1000): MouseSample[] => [
  { x: 0, z: 0, t: now - ms },
  { x: dx, z: dz, t: now },
]

describe('mouseVelocity', () => {
  it('is distance over time, in units per second', () => {
    expect(mouseVelocity(move(3, -1.5, 100), 1000)).toEqual({ vx: 30, vz: -15 })
  })
  it('is zero with fewer than two recent samples', () => {
    expect(mouseVelocity([], 1000)).toEqual({ vx: 0, vz: 0 })
    expect(mouseVelocity([{ x: 1, z: 1, t: 990 }], 1000)).toEqual({ vx: 0, vz: 0 })
  })
  it('ignores movement older than the window', () => {
    const old = [{ x: 0, z: 0, t: 0 }, { x: 50, z: 0, t: 100 }]
    expect(mouseVelocity(old, 1000)).toEqual({ vx: 0, vz: 0 })
  })
})

describe('mouseVelocity with slow frames', () => {
  it('still finds the flick when events arrive in a bunch with closely spaced timestamps', () => {
    // A flick of 6 events, 4 ms apart, then a click 1 ms later; the page was too busy to handle them sooner.
    const flick: MouseSample[] = Array.from({ length: 6 }, (_, i) => ({ x: i * 0.5, z: 0, t: 960 + i * 4 }))
    const v = mouseVelocity(flick, 981)
    expect(v.vx).toBeCloseTo(0.5 / 0.004, 6) // 125 units/s: a hard flick, not zero
  })

  it('looks further back when the last samples are almost simultaneous', () => {
    const samples: MouseSample[] = [
      { x: 0, z: 0, t: 800 }, { x: 4, z: 0, t: 880 }, { x: 8, z: 0, t: 999 }, { x: 8.1, z: 0, t: 1000 },
    ]
    // Only the last two fall in the 100 ms window and they are 1 ms apart, so the 300 ms window is used.
    expect(mouseVelocity(samples, 1000).vx).toBeCloseTo(8.1 / 0.2, 6) // back to the sample at 800 ms
  })
})

describe('throwFromSamples', () => {
  it('throws in the direction the mouse is moving', () => {
    const t = throwFromSamples(move(2, 0, 100), 1000)
    expect(t.still).toBe(false)
    expect(t.vx).toBeGreaterThan(0)
    expect(t.vz).toBeCloseTo(0, 9)
    const left = throwFromSamples(move(-1.5, -1.5, 100), 1000)
    expect(left.vx).toBeLessThan(0)
    expect(left.vz).toBeLessThan(0)
    expect(left.vx).toBeCloseTo(left.vz, 9)
  })

  it('throws harder when the mouse is faster', () => {
    const slow = throwFromSamples(move(1, 0, 100), 1000)
    const fast = throwFromSamples(move(2.5, 0, 100), 1000)
    expect(fast.speed).toBeGreaterThan(slow.speed)
  })

  it('multiplies a flick by the gain, so throws feel fast', () => {
    // 15 units/s of mouse movement throws at 15 x gain.
    expect(throwFromSamples(move(1.5, 0, 100), 1000).speed).toBeCloseTo(15 * THROW.gain, 9)
    expect(THROW.gain).toBeGreaterThan(1)
  })

  it('clamps the strength between the minimum and the maximum', () => {
    expect(throwFromSamples(move(0.3, 0, 100), 1000).speed).toBe(THROW.minSpeed) // 3 u/s x gain is still under the minimum
    expect(throwFromSamples(move(50, 0, 100), 1000).speed).toBe(THROW.maxSpeed)
    const huge = throwFromSamples(move(30, 40, 100), 1000)
    expect(Math.hypot(huge.vx, huge.vz)).toBeCloseTo(THROW.maxSpeed, 9)
  })

  it('tosses gently in a random direction when the mouse is still', () => {
    const t = throwFromSamples([], 1000, () => 0.25)
    expect(t.still).toBe(true)
    expect(t.speed).toBe(THROW.tossSpeed)
    expect(Math.hypot(t.vx, t.vz)).toBeCloseTo(THROW.tossSpeed, 9)
    // A pause before the click also counts as still.
    expect(throwFromSamples(move(5, 0, 100, 500), 1000).still).toBe(true)
  })
})

describe('freeSpot', () => {
  const seeded = () => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 } }

  it('stays inside the tray', () => {
    for (let i = 0; i < 20; i++) {
      const s = freeSpot([], 11, 6.8, 1.5, seeded())
      expect(Math.abs(s.x)).toBeLessThanOrEqual(11 - 1.5 + 1e-9)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(6.8 - 1.5 + 1e-9)
    }
  })

  it('picks a place away from a cluster of dice', () => {
    const cluster: Obstacle[] = [[-2, -1], [-1, 1], [0, 0], [1, -1], [2, 1], [0, 2]].map(([x, z]) => ({ x, z, r: 1.5 }))
    const spot = freeSpot(cluster, 11, 6.8, 1.5, seeded())
    expect(spot.clearance).toBeGreaterThan(0)
    for (const o of cluster) expect(Math.hypot(o.x - spot.x, o.z - spot.z)).toBeGreaterThan(o.r + 1.5)
  })

  it('prefers the emptier side', () => {
    // Dice fill the whole left half, so the spot has to be on the right.
    const left: Obstacle[] = []
    for (let x = -10; x <= 0; x += 2.5) for (let z = -5; z <= 5; z += 2.5) left.push({ x, z, r: 1.4 })
    expect(freeSpot(left, 11, 6.8, 1.5, seeded()).x).toBeGreaterThan(0)
  })

  it('reports no clearance when the tray is packed, rather than failing', () => {
    const packed: Obstacle[] = []
    for (let x = -11; x <= 11; x += 1.5) for (let z = -7; z <= 7; z += 1.5) packed.push({ x, z, r: 1.4 })
    expect(freeSpot(packed, 11, 6.8, 1.5, seeded()).clearance).toBeLessThan(0)
  })
})
