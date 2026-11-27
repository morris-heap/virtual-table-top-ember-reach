import { describe, expect, it } from 'vitest'
import { addToRuns, decodeRuns, encodeRuns, removeFromRuns, runsContain, runsSize } from './runs.ts'

describe('runs', () => {
  it('encodes indexes as sorted, merged [start, length] pairs', () => {
    expect(encodeRuns([342, 343, 344])).toEqual([342, 3])
    expect(encodeRuns([5, 1, 2, 3, 9, 3])).toEqual([1, 3, 5, 1, 9, 1])
    expect(encodeRuns([])).toEqual([])
  })

  it('round-trips', () => {
    const runs = [310, 8, 340, 8, 370, 8]
    expect(encodeRuns(decodeRuns(runs))).toEqual(runs)
    expect(runsSize(runs)).toBe(24)
  })

  it('answers membership', () => {
    expect(runsContain([310, 8], 317)).toBe(true)
    expect(runsContain([310, 8], 318)).toBe(false)
  })

  it('paints and erases', () => {
    expect(addToRuns([0, 3], [3, 4])).toEqual([0, 5])
    expect(removeFromRuns([0, 5], [2])).toEqual([0, 2, 3, 2])
  })
})
