import { describe, expect, it } from 'vitest'
import type { GameMember } from '../api/types.ts'
import { cleanPlayerId, gameLink, memberName, newGame, partyWarning, playerCount, RECOMMENDED_PARTY } from './game.ts'

const player = (n: number): GameMember => ({ playerId: `EMBER-${n}AAAA`, displayName: '', role: 'player' })
const gm: GameMember = { playerId: 'EMBER-GGGGG', displayName: 'Kit', role: 'gm' }
const ref = { source: 'builtin' as const, id: 'soot-kings-hearth' }

describe('cleanPlayerId', () => {
  it('accepts pasted IDs in any case, with spaces', () => {
    expect(cleanPlayerId('  ember-7k2q9 ')).toBe('EMBER-7K2Q9')
  })
  it.each(['', 'EMBER-7K2Q', 'EMBER-7K2Q90', 'EMBER-0O1I1', 'ABCDE-7K2Q9'])('rejects %j', v => {
    expect(cleanPlayerId(v)).toBeNull()
  })
})

describe('newGame', () => {
  it('starts private, trims and falls back to a name', () => {
    expect(newGame('  Friday  ', ref, false)).toEqual({ name: 'Friday', adventure: ref, visibility: 'private', solo: false })
    expect(newGame('   ', ref, true).name).toBe('New Game')
    expect(newGame('x'.repeat(200), ref, false).name).toHaveLength(80)
  })
})

describe('party', () => {
  it('counts players, not the GM', () => {
    expect(playerCount([gm, player(1), player(2)])).toBe(2)
  })
  it('warns only past the recommended size, and never forbids', () => {
    const table = (n: number) => [gm, ...Array.from({ length: n }, (_, i) => player(i))]
    expect(partyWarning(table(RECOMMENDED_PARTY))).toBeNull()
    expect(partyWarning(table(RECOMMENDED_PARTY + 1))).toMatch(/slow down/)
  })
})

describe('labels', () => {
  it('builds the join link', () => {
    expect(gameLink('https://emberreach.morris-heap.com', 'abc')).toBe('https://emberreach.morris-heap.com/games/abc')
  })
  it('names a member by display name, then player ID', () => {
    expect(memberName(gm)).toBe('Kit')
    expect(memberName(player(1))).toBe('EMBER-1AAAA')
    expect(memberName({ playerId: '', displayName: '', role: 'player' })).toBe('A player')
  })
})
