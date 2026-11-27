import { describe, expect, it } from 'vitest'
import friendData from '../../../data/friends.json'
import type { GameMember, Person } from '../api/types.ts'
import { LIVE_VISIBILITIES, visibilityHelp, visibilityLabel } from './adventure.ts'
import { FRIEND_LIMITS, invitable, personName } from './friends.ts'

const person = (playerId: string, displayName = ''): Person => ({ playerId, displayName })
const member = (p: Person): GameMember => ({ ...p, role: 'player', hero: null, mine: false, online: false, friend: false })

describe('friends helpers', () => {
  it('takes its limits from data/friends.json', () => {
    expect(FRIEND_LIMITS).toBe(friendData.limits)
  })

  it('names a person by display name, falling back to the player ID', () => {
    expect(personName(person('EMBER-AAAAB', 'Ana'))).toBe('Ana')
    expect(personName(person('EMBER-AAAAB'))).toBe('EMBER-AAAAB')
  })

  it('invites only friends who are not already members', () => {
    const [a, b, c] = [person('EMBER-AAAAB', 'Ana'), person('EMBER-AAAAC', 'Ben'), person('EMBER-AAAAD')]
    expect(invitable([a, b, c], [member(b)])).toEqual([a, c])
    expect(invitable([a], [member(a)])).toEqual([])
    expect(invitable([], [member(a)])).toEqual([])
  })
})

describe('adventure visibility labels', () => {
  it('offers exactly the visibilities data/adventure.json makes live', () => {
    expect(LIVE_VISIBILITIES).toEqual(['private', 'friends'])
    expect(LIVE_VISIBILITIES).not.toContain('public')
  })

  it('labels and explains each one', () => {
    expect(visibilityLabel('private')).toBe('Private')
    expect(visibilityLabel('friends')).toBe('Friends')
    expect(visibilityHelp('friends')).toMatch(/friends/i)
    expect(visibilityHelp('private')).toMatch(/only you/i)
  })
})
