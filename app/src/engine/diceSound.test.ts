import { describe, expect, it } from 'vitest'
import { allowImpact, impactParams, LOUD_IMPACT_SPEED, MAX_VOICES, MIN_GAP_MS, MIN_IMPACT_SPEED } from './diceSound'

describe('impactParams', () => {
  it('is silent for a touch', () => {
    expect(impactParams('floor', MIN_IMPACT_SPEED - 0.1)).toBeNull()
    expect(impactParams('floor', MIN_IMPACT_SPEED)).not.toBeNull()
  })

  it('gets louder with a harder hit, up to full volume', () => {
    const soft = impactParams('floor', 3, () => 0.5)!
    const hard = impactParams('floor', 15, () => 0.5)!
    const max = impactParams('floor', LOUD_IMPACT_SPEED * 3, () => 0.5)!
    expect(hard.gain).toBeGreaterThan(soft.gain)
    expect(max.gain).toBeLessThanOrEqual(1)
    expect(max.gain).toBeGreaterThanOrEqual(hard.gain)
  })

  it('raises the pitch with a harder hit', () => {
    expect(impactParams('dice', 18, () => 0.5)!.freq).toBeGreaterThan(impactParams('dice', 3, () => 0.5)!.freq)
  })

  it('makes dice clack higher and sharper than the walls knock', () => {
    const clack = impactParams('dice', 10, () => 0.5)!
    const knock = impactParams('wall', 10, () => 0.5)!
    expect(clack.freq).toBeGreaterThan(knock.freq)
    expect(clack.duration).toBeLessThan(knock.duration)
    expect(knock.gain).toBeLessThan(impactParams('floor', 10, () => 0.5)!.gain)
  })
})

describe('allowImpact', () => {
  it('rate-limits repeats and caps simultaneous voices', () => {
    expect(allowImpact(100, 100 - MIN_GAP_MS + 1, 0)).toBe(false)
    expect(allowImpact(100, 100 - MIN_GAP_MS, 0)).toBe(true)
    expect(allowImpact(1000, 0, MAX_VOICES)).toBe(false)
    expect(allowImpact(1000, 0, MAX_VOICES - 1)).toBe(true)
  })
})
