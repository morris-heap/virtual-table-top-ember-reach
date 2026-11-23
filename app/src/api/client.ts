// Calls to the Emberreach API with the signed-in user's access token (docs/adr/0004-auth-cognito.md).
// The API takes the owner from the verified token, so nothing here ever sends a user id.
import { apiUrl, authConfig } from '../auth/config.ts'
import { getAccessToken } from '../auth/session.ts'
import { ApiError, errorMessage, jsonInit } from './request.ts'
import type { Adventure, AdventureDraft, AdventureSummary, Game, GameDraft, GameSummary, HeroSummary, Profile } from './types.ts'

export { ApiError }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!apiUrl || !authConfig) throw new ApiError('The server is not set up for this site.', 0)
  const token = await getAccessToken(authConfig)
  if (!token) throw new ApiError('Your session expired. Sign in again.', 401)
  let res: Response
  try {
    res = await fetch(`${apiUrl}${path}`, jsonInit(method, token, body))
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0)
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const heroesApi = {
  list: async () => (await call<{ characters: HeroSummary[] }>('GET', '/characters')).characters,
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

export const gamesApi = {
  list: async () => (await call<{ games: GameSummary[] }>('GET', '/games')).games,
  get: (id: string) => call<Game>('GET', `/games/${id}`),
  save: (id: string, draft: GameDraft) => call<Game>('PUT', `/games/${id}`, draft),
  remove: (id: string) => call<void>('DELETE', `/games/${id}`),
  /** The GM invites a player, or a player joins a public Game with their own player ID. */
  addMember: (id: string, playerId: string) => call<Game>('PUT', `/games/${id}/members/${encodeURIComponent(playerId)}`),
  /** The GM removes a player, or a player leaves with their own player ID. */
  removeMember: (id: string, playerId: string) => call<void>('DELETE', `/games/${id}/members/${encodeURIComponent(playerId)}`),
}
