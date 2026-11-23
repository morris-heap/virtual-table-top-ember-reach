import { describe, expect, it } from 'vitest'
import { recentFirst } from './recent.ts'

describe('recentFirst', () => {
  const items = [
    { id: 'a', updatedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'b', updatedAt: '2026-11-20T00:00:00.000Z' },
    { id: 'c', updatedAt: '2026-11-10T00:00:00.000Z' },
  ]

  it('puts the newest first and keeps only the count asked for', () => {
    expect(recentFirst(items, 2).map(i => i.id)).toEqual(['b', 'c'])
  })

  it('returns everything when there are fewer items, without changing the input', () => {
    expect(recentFirst(items, 5).map(i => i.id)).toEqual(['b', 'c', 'a'])
    expect(items.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })
})
