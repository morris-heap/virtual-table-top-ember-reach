import { describe, expect, it } from 'vitest'
import type { GameMember } from '../api/types.ts'
import { cleanPlayerId, gameLink, heroCount, memberName, newGame, partyWarning, playerCount, RECOMMENDED_PARTY } from './game.ts'

const hero = (name: string) => ({ id: name, name, level: 1, ancestry: 'Emberkin', calling: 'Hexer' })
/** A player with a hero, unless `withHero` says otherwise. */
const player = (n: number, withHero = true): GameMember => ({
  playerId: `EMBER-${n}AAAA`, displayName: '', role: 'player', hero: withHero ? hero(`H${n}`) : null, mine: false,
})
const gm: GameMember = { playerId: 'EMBER-GGGGG', displayName: 'Kit', role: 'gm', hero: null, mine: false }
const ref = { source: 'builtin' as const, id: 'soot-kings-hearth' }

describe('cleanPlayerId', () => {
  it('accepts pasted IDs in any case, with spaces', () => {
    expect(cleanPlayerId('  ember-7k2q9f ')).toBe('EMBER-7K2Q9F')
  })
  it('accepts both the new 6-character IDs and the older 5-character ones', () => {
    expect(cleanPlayerId('EMBER-7K2Q9F')).toBe('EMBER-7K2Q9F')
    expect(cleanPlayerId('EMBER-7K2Q9')).toBe('EMBER-7K2Q9')
  })
  it.each(['', 'EMBER-7K2Q', 'EMBER-7K2Q9FG', 'EMBER-0O1I1', 'ABCDE-7K2Q9'])('rejects %j', v => {
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
  it('counts heroes, not people: a member without one adds no turn', () => {
    expect(heroCount([gm, player(1), player(2, false)])).toBe(1)
    // A GM who brings a hero is counted too: it takes a turn like any other.
    expect(heroCount([{ ...gm, hero: hero('Gm') }, player(1)])).toBe(2)
  })
  it('warns only past the recommended number of heroes, and never forbids', () => {
    const table = (n: number) => [gm, ...Array.from({ length: n }, (_, i) => player(i))]
    expect(partyWarning(table(RECOMMENDED_PARTY))).toBeNull()
    expect(partyWarning(table(RECOMMENDED_PARTY + 1))).toMatch(/Heroes' Phase/)
    // Past the recommended size in people, but not in heroes: no warning.
    const heroless = [gm, ...Array.from({ length: RECOMMENDED_PARTY + 3 }, (_, i) => player(i, false))]
    expect(partyWarning(heroless)).toBeNull()
  })
})

describe('labels', () => {
  it('builds the join link', () => {
    expect(gameLink('https://emberreach.morris-heap.com', 'abc')).toBe('https://emberreach.morris-heap.com/games/abc')
  })
  it('names a member by display name, then player ID', () => {
    expect(memberName(gm)).toBe('Kit')
    expect(memberName(player(1))).toBe('EMBER-1AAAA')
    expect(memberName({ playerId: '', displayName: '', role: 'player', hero: null, mine: false })).toBe('A player')
  })
})
