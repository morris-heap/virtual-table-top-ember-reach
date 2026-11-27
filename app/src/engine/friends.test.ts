import { describe, expect, it } from 'vitest'
import friendData from '../../../data/friends.json'
import type { GameMember, Person } from '../api/types.ts'
import { LIVE_VISIBILITIES, visibilityHelp, visibilityLabel } from './adventure.ts'
import profileData from '../../../data/profile.json'
import type { FriendLists } from '../api/types.ts'
import { DISPLAY_NAME_MAX, FRIEND_LIMITS, foundState, invitable, NAME_SEARCH, personName, searchName } from './friends.ts'

const person = (playerId: string, displayName = ''): Person => ({ playerId, displayName })
const member = (p: Person): GameMember => ({ ...p, role: 'player', hero: null, mine: false })

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

describe('finding a player by name (VTTER-108)', () => {
  const a = person('EMBER-AAAAB', 'Ana')
  const lists = (over: Partial<FriendLists> = {}): FriendLists => ({ friends: [], incoming: [], outgoing: [], ...over })

  it('takes its limits from data/profile.json', () => {
    expect(NAME_SEARCH).toBe(profileData.search)
    expect(DISPLAY_NAME_MAX).toBe(profileData.displayNameMax)
  })

  it('tidies the typed name, and refuses blank or over-long text', () => {
    expect(searchName('  Ash   Smith ')).toBe('Ash Smith')
    expect(searchName('   ')).toBeNull()
    expect(searchName('x'.repeat(DISPLAY_NAME_MAX))).not.toBeNull()
    expect(searchName('x'.repeat(DISPLAY_NAME_MAX + 1))).toBeNull()
  })

  it('says where a result already stands with you', () => {
    expect(foundState(lists(), a.playerId)).toBe('new')
    expect(foundState(lists({ friends: [a] }), a.playerId)).toBe('friend')
    expect(foundState(lists({ outgoing: [a] }), a.playerId)).toBe('requested')
    expect(foundState(lists({ incoming: [a] }), a.playerId)).toBe('asked-you')
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
