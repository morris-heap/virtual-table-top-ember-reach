import { describe, expect, it } from 'vitest'
import {
  addDie, canAdd, emptyPool, expandPool, faceToValue, formatPool, MAX_PHYSICAL_DICE, percentile, physicalCount,
  removeDie, rollPool, summarize, trayScale, TRAY_BASE_DICE, TRAY_MAX_SCALE, type DieResult, type Pool,
} from './dicePool'

const pool = (p: Partial<Pool>): Pool => ({ ...emptyPool(), ...p })
const results = (entries: Record<string, [number, boolean?]>) =>
  new Map<string, DieResult>(Object.entries(entries).map(([id, [value, cocked]]) => [id, { value, cocked: cocked ?? false }]))

describe('pool', () => {
  it('formats a mixed pool', () => {
    expect(formatPool(pool({ d4: 2, d6: 1, d20: 1 }))).toBe('2d4 + 1d6 + 1d20')
    expect(formatPool(emptyPool())).toBe('')
  })

  it('adds and removes dice and never goes below zero', () => {
    let p = addDie(emptyPool(), 'd8')
    p = addDie(p, 'd8')
    expect(p.d8).toBe(2)
    expect(removeDie(removeDie(removeDie(p, 'd8'), 'd8'), 'd8').d8).toBe(0)
  })

  it('counts a d100 as two physical dice', () => {
    expect(physicalCount(pool({ d100: 2, d6: 3 }))).toBe(7)
  })

  it('caps the dice per throw', () => {
    let p = emptyPool()
    for (let i = 0; i < 30; i++) p = addDie(p, 'd6')
    expect(p.d6).toBe(MAX_PHYSICAL_DICE)
    expect(canAdd(p, 'd6')).toBe(false)
    expect(addDie(p, 'd6')).toBe(p)
    // One slot left is not enough for a d100 (two dice).
    const almost = pool({ d6: MAX_PHYSICAL_DICE - 1 })
    expect(canAdd(almost, 'd6')).toBe(true)
    expect(canAdd(almost, 'd100')).toBe(false)
  })

  it('expands a pool into physical dice, a d100 into tens and units', () => {
    const dice = expandPool(pool({ d4: 2, d100: 1 }))
    expect(dice.map(d => d.id)).toEqual(['d4-1', 'd4-2', 'd100-1-tens', 'd100-1-units'])
    expect(dice.slice(2).every(d => d.solid === 'd10' && d.group === 'd100-1')).toBe(true)
  })
})

describe('percentile', () => {
  it.each([
    [0, 1, 1], [40, 7, 47], [90, 9, 99], [10, 0, 10], [0, 0, 100],
  ])('tens %i + units %i = %i', (tens, units, expected) => {
    expect(percentile(tens, units)).toBe(expected)
  })
})

describe('faceToValue', () => {
  it('counts a d10 showing 0 as 10', () => {
    expect(faceToValue('d10', 'single', 0)).toBe(10)
    expect(faceToValue('d10', 'single', 7)).toBe(7)
  })
  it('reads tens in tens and units as is', () => {
    expect(faceToValue('d100', 'tens', 4)).toBe(40)
    expect(faceToValue('d100', 'tens', 0)).toBe(0)
    expect(faceToValue('d100', 'units', 0)).toBe(0)
  })
  it('leaves other dice alone', () => {
    expect(faceToValue('d20', 'single', 17)).toBe(17)
  })
})

describe('summarize', () => {
  it('totals a mixed pool', () => {
    const dice = expandPool(pool({ d4: 2, d10: 1, d20: 1 }))
    const s = summarize(dice, results({ 'd4-1': [3], 'd4-2': [4], 'd10-1': [7], 'd20-1': [17] }))
    expect(s.total).toBe(31)
    expect(s.complete).toBe(true)
    expect(s.entries.map(e => e.value)).toEqual([3, 4, 7, 17])
  })

  it('counts a d10 face 0 as 10 in the total', () => {
    const s = summarize(expandPool(pool({ d10: 1 })), results({ 'd10-1': [0] }))
    expect(s.total).toBe(10)
  })

  it('combines a d100 into one percentile entry and adds it to the total', () => {
    const dice = expandPool(pool({ d100: 1, d6: 1 }))
    const s = summarize(dice, results({ 'd6-1': [5], 'd100-1-tens': [4], 'd100-1-units': [7] }))
    const d100 = s.entries.find(e => e.kind === 'd100')!
    expect(d100.value).toBe(47)
    expect(d100.detail).toBe('40 + 7')
    expect(s.total).toBe(52)
  })

  it('shows 00 + 0 as 100', () => {
    const s = summarize(expandPool(pool({ d100: 1 })), results({ 'd100-1-tens': [0], 'd100-1-units': [0] }))
    expect(s.entries[0].value).toBe(100)
    expect(s.entries[0].detail).toBe('00 + 0')
    expect(s.total).toBe(100)
  })

  it('leaves a cocked die out of the total and says which die to re-throw', () => {
    const dice = expandPool(pool({ d6: 1, d20: 1, d100: 1 }))
    const s = summarize(dice, results({ 'd6-1': [2, true], 'd20-1': [9], 'd100-1-tens': [1], 'd100-1-units': [3, true] }))
    expect(s.complete).toBe(false)
    expect(s.total).toBe(9)
    expect(s.entries.find(e => e.kind === 'd6')).toMatchObject({ value: null, cocked: true, cockedIds: ['d6-1'] })
    expect(s.entries.find(e => e.kind === 'd100')).toMatchObject({ value: null, cockedIds: ['d100-1-units'] })
  })

  it('treats a die with no result yet as unresolved', () => {
    const s = summarize(expandPool(pool({ d8: 2 })), results({ 'd8-1': [3] }))
    expect(s.complete).toBe(false)
    expect(s.total).toBe(3)
  })
})

describe('rollPool (the no-3D fallback)', () => {
  it('rolls within each die\'s range, using the injected RNG', () => {
    const dice = expandPool(pool({ d4: 1, d10: 1, d20: 1, d100: 1 }))
    const low = rollPool(dice, () => 0)
    expect(low.get('d4-1')!.value).toBe(1)
    expect(low.get('d10-1')!.value).toBe(0)
    expect(low.get('d20-1')!.value).toBe(1)
    const high = rollPool(dice, () => 0.9999)
    expect(high.get('d4-1')!.value).toBe(4)
    expect(high.get('d10-1')!.value).toBe(9)
    expect(high.get('d20-1')!.value).toBe(20)
    expect(summarize(dice, high).entries.find(e => e.kind === 'd100')!.value).toBe(99)
    expect(summarize(dice, low).entries.find(e => e.kind === 'd100')!.value).toBe(100)
  })
})

describe('trayScale', () => {
  it('keeps the base size for a small pool', () => {
    expect(trayScale(0)).toBe(1)
    expect(trayScale(1)).toBe(1)
    expect(trayScale(TRAY_BASE_DICE)).toBe(1)
  })
  it('grows with the pool, so the floor area per die stays about the same', () => {
    expect(trayScale(20)).toBe(1.6)
    expect(trayScale(12)).toBeGreaterThan(trayScale(9))
    for (let n = 1; n < MAX_PHYSICAL_DICE; n++) expect(trayScale(n + 1)).toBeGreaterThanOrEqual(trayScale(n))
    // Area is scale squared: 20 dice get 2.5x the room of 8.
    expect(trayScale(20) ** 2 / trayScale(8) ** 2).toBeCloseTo(2.5, 0)
  })
  it('never exceeds the maximum', () => {
    expect(trayScale(500)).toBe(TRAY_MAX_SCALE)
  })
})
