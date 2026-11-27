// Friends (VTTER-73, docs/adr/0009-friends.md). A friendship is mutual and starts as a request that the
// other player accepts. Each side holds its own item, so each player's view is one Query on their partition.
import friendData from '../../data/friends.json'
import { isUnread } from './chat.ts'

export const FRIEND_LIMITS = friendData.limits

export type FriendStatus = 'incoming' | 'outgoing' | 'accepted'

/**
 * One side of a friendship, as the store holds it. `userId` is the OTHER player's Cognito id: it stays
 * inside the API and is turned into a player ID and display name before anything leaves (never returned).
 */
export interface FriendEdge {
  userId: string
  status: FriendStatus
  /** Chat markers (VTTER-109): when a message last reached me, and when I last opened the thread. ISO times. */
  lastMessageAt?: string
  lastReadAt?: string
}

/** What a player may see of someone else: the public player ID and display name, never a Cognito id. */
export interface FriendIdentity {
  playerId: string
  displayName: string
}

/** A friend row also says whether their chat has messages you haven't opened. */
export interface FriendRow extends FriendIdentity {
  unread: boolean
}

export interface FriendLists {
  friends: FriendRow[]
  incoming: FriendIdentity[]
  outgoing: FriendIdentity[]
}

const byName = (a: FriendIdentity, b: FriendIdentity) =>
  (a.displayName || a.playerId).localeCompare(b.displayName || b.playerId) || a.playerId.localeCompare(b.playerId)

/**
 * Group edges by status. An edge whose profile can't be read is dropped rather than shown as a blank row.
 * Built field by field on purpose, so a Cognito id can't ride along.
 */
export function toFriendLists(edges: FriendEdge[], who: Record<string, FriendIdentity>): FriendLists {
  const pick = (status: FriendStatus) => edges
    .filter(e => e.status === status && who[e.userId])
    .map(e => ({ playerId: who[e.userId].playerId, displayName: who[e.userId].displayName, unread: isUnread(e) }))
    .sort(byName)
  const plain = ({ playerId, displayName }: FriendRow): FriendIdentity => ({ playerId, displayName })
  return { friends: pick('accepted'), incoming: pick('incoming').map(plain), outgoing: pick('outgoing').map(plain) }
}
