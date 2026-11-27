// Calls to the Emberreach API with the signed-in user's access token (docs/adr/0004-auth-cognito.md).
// The API takes the owner from the verified token, so nothing here ever sends a user id.
import { apiUrl, authConfig } from '../auth/config.ts'
import { currentUser, getAccessToken } from '../auth/session.ts'
import { ApiError, request } from './request.ts'
import type { Adventure, AdventureDraft, AdventureSummary, ChatMessage, ChatPage, FriendLists, Game, GameDraft, GameSummary, Profile, PublicGamePage } from './types.ts'

export { ApiError }

export async function call<T>(method: string, path: string, body?: unknown, expectedAccount?: string): Promise<T> {
  if (!apiUrl || !authConfig) throw new ApiError('The server is not set up for this site.', 0)
  const config = authConfig
  return request<T>(`${apiUrl}${path}`, method, async force => {
    if (expectedAccount && currentUser()?.sub !== expectedAccount) return null
    const token = await getAccessToken(config, force)
    if (expectedAccount && currentUser()?.sub !== expectedAccount) return null
    return token
  }, body)
}

export const profileApi = {
  get: () => call<Profile>('GET', '/profile'),
  update: (patch: Partial<Pick<Profile, 'displayName' | 'gameMaster'>>) => call<Profile>('PUT', '/profile', patch),
}

export const adventuresApi = {
  list: async () => (await call<{ adventures: AdventureSummary[] }>('GET', '/adventures')).adventures,
  get: (id: string) => call<Adventure>('GET', `/adventures/${id}`),
  save: (id: string, draft: AdventureDraft) => call<Adventure>('PUT', `/adventures/${id}`, draft),
  remove: (id: string) => call<void>('DELETE', `/adventures/${id}`),
}

export const friendsApi = {
  list: () => call<FriendLists>('GET', '/friends'),
  /** Ask a player to be friends, or accept their request. Both are the same call. */
  request: (playerId: string) => call<FriendLists>('PUT', `/friends/${encodeURIComponent(playerId)}`),
  /** Decline a request, cancel one you sent, or remove a friend. */
  remove: (playerId: string) => call<void>('DELETE', `/friends/${encodeURIComponent(playerId)}`),
  /** Adventures this friend shared with friends. A non-friend gets 404. */
  adventures: async (playerId: string) =>
    (await call<{ adventures: AdventureSummary[] }>('GET', `/friends/${encodeURIComponent(playerId)}/adventures`)).adventures,
  adventure: (playerId: string, id: string) =>
    call<Adventure>('GET', `/friends/${encodeURIComponent(playerId)}/adventures/${id}`),
  /** Chat with a friend (VTTER-109). No cursor: the newest page. `before` pages back, `after` reads what is new. A non-friend gets 404. */
  messages: (playerId: string, cursor: { before?: string; after?: string } = {}) => {
    const q = cursor.before ? `?before=${encodeURIComponent(cursor.before)}` : cursor.after ? `?after=${encodeURIComponent(cursor.after)}` : ''
    return call<ChatPage>('GET', `/friends/${encodeURIComponent(playerId)}/messages${q}`)
  },
  send: (playerId: string, text: string) =>
    call<ChatMessage>('POST', `/friends/${encodeURIComponent(playerId)}/messages`, { text }),
  /** Say the thread has been seen, which clears its unread dot. */
  markRead: (playerId: string) =>
    call<void>('POST', `/friends/${encodeURIComponent(playerId)}/messages/read`),
}

export const gamesApi = {
  list: async () => (await call<{ games: GameSummary[] }>('GET', '/games')).games,
  /**
   * One page of public Games to browse (VTTER-76). Signed in, like every call, but needs no
   * membership. Pass the previous page's `cursor` for the next one.
   */
  listPublic: (cursor?: string | null) =>
    call<PublicGamePage>('GET', `/games/public${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  get: (id: string) => call<Game>('GET', `/games/${id}`),
  save: (id: string, draft: GameDraft) => call<Game>('PUT', `/games/${id}`, draft),
  remove: (id: string) => call<void>('DELETE', `/games/${id}`),
  /** The GM invites a player, or a player joins a public Game with their own player ID. */
  addMember: (id: string, playerId: string) => call<Game>('PUT', `/games/${id}/members/${encodeURIComponent(playerId)}`),
  /** The GM removes a player, or a player leaves with their own player ID. */
  removeMember: (id: string, playerId: string) => call<void>('DELETE', `/games/${id}/members/${encodeURIComponent(playerId)}`),
  /** Bring one of your own heroes to a Game (VTTER-77). The API takes the player from the token. */
  setHero: (id: string, heroId: string) => call<Game>('PUT', `/games/${id}/hero`, { heroId }),
  /** Withdraw your hero from a Game. */
  clearHero: (id: string) => call<Game>('DELETE', `/games/${id}/hero`),
  /** Say you have this Game open (VTTER-73). Returns the player IDs of everyone online at it now. */
  heartbeat: (id: string) => call<{ online: string[] }>('PUT', `/games/${id}/presence`),
}
