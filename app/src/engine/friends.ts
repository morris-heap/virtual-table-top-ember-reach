// Pure helpers for the friends list (VTTER-73). The API enforces every rule; these only shape what the screens show.
import friendData from '../../../data/friends.json'
import profileData from '../../../data/profile.json'
import type { FriendLists, GameMember, Person } from '../api/types.ts'

export const FRIEND_LIMITS = friendData.limits
/** Searching by display name (VTTER-108): the result cap and per-minute allowance the API enforces. */
export const NAME_SEARCH = profileData.search
export const DISPLAY_NAME_MAX = profileData.displayNameMax

/** A person's name for a list: their display name, or their player ID if they haven't set one. */
export function personName(p: Person): string {
  return p.displayName || p.playerId
}

/** Friends the GM could still invite: everyone on the list who isn't already at the table. */
export function invitable(friends: Person[], members: GameMember[]): Person[] {
  const seated = new Set(members.map(m => m.playerId))
  return friends.filter(f => !seated.has(f.playerId))
}

/** What to send to the name search, or null if there is nothing to look for. Spaces fold on the API side too. */
export function searchName(typed: string): string | null {
  const name = typed.trim().replace(/\s+/g, ' ')
  return name === '' || name.length > DISPLAY_NAME_MAX ? null : name
}

export type FoundState = 'new' | 'friend' | 'requested' | 'asked-you'

/** Where a search result already stands with you, so the row says so instead of offering a second request. */
export function foundState(lists: FriendLists, playerId: string): FoundState {
  if (lists.friends.some(p => p.playerId === playerId)) return 'friend'
  if (lists.outgoing.some(p => p.playerId === playerId)) return 'requested'
  if (lists.incoming.some(p => p.playerId === playerId)) return 'asked-you'
  return 'new'
}
