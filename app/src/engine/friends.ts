// Pure helpers for the friends list (VTTER-73). The API enforces every rule; these only shape what the screens show.
import friendData from '../../../data/friends.json'
import type { GameMember, Person } from '../api/types.ts'

export const FRIEND_LIMITS = friendData.limits

/** A person's name for a list: their display name, or their player ID if they haven't set one. */
export function personName(p: Person): string {
  return p.displayName || p.playerId
}

/** Friends the GM could still invite: everyone on the list who isn't already at the table. */
export function invitable(friends: Person[], members: GameMember[]): Person[] {
  const seated = new Set(members.map(m => m.playerId))
  return friends.filter(f => !seated.has(f.playerId))
}
