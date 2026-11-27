// HTTP routing and validation for the Emberreach API. Pure: storage is injected, so it's unit-testable.

import { parseAdventure, type AdventureDraft, type AdventureRecord, type AdventureSummary } from './adventure.ts'
import gameData from '../../data/game.json'
import { isMessageId, parseMessage, toMessageView, type ChatMessageRecord } from './chat.ts'
import { FRIEND_LIMITS, toFriendLists, type FriendEdge, type FriendIdentity, type FriendPresence } from './friend.ts'
import { parseGame, type GameDraft, type GameRecord } from './game.ts'
import { MAPS_PER_USER, parseMap, type MapDraft, type MapRecord, type MapSummary } from './map.ts'
import { parsePortraitUpload, PORTRAIT, type PortraitStore } from './portrait.ts'
import { onlineIds, type PresenceRecord } from './presence.ts'
import { DISPLAY_NAME_MAX, isPlayerId, NAME_SEARCH, parseProfilePatch, type FoundPlayer, type ProfilePatch, type ProfileRecord } from './profile.ts'
import { parseSheet, ValidationError, type CharacterRecord, type CharacterSheet, type CharacterSummary } from './sheet.ts'

export interface CharacterStore {
  ping(): Promise<void>
  list(ownerId: string): Promise<CharacterSummary[]>
  get(ownerId: string, id: string): Promise<CharacterRecord | null>
  /** Insert or replace the whole sheet. Keys are (owner, id), so one owner can never touch another's hero. */
  save(ownerId: string, id: string, sheet: CharacterSheet): Promise<CharacterRecord>
  delete(ownerId: string, id: string): Promise<boolean>
}

export interface ProfileStore {
  /** The user's profile. The first call creates it, with a unique player ID that never changes. */
  getOrCreate(ownerId: string): Promise<ProfileRecord>
  update(ownerId: string, patch: ProfilePatch): Promise<ProfileRecord>
  /** Read a profile without creating it (null if the user has never opened the app). */
  peek(ownerId: string): Promise<ProfileRecord | null>
  /** Who a public player ID belongs to, or null if no one has it. */
  ownerOfPlayer(playerId: string): Promise<string | null>
  /**
   * Players who opted in to being found and whose display name is exactly `name` (case and spacing folded),
   * at most `limit`, never the caller (VTTER-108). Public fields only.
   */
  findByName(name: string, exceptOwnerId: string, limit: number): Promise<FoundPlayer[]>
  /**
   * Counts one name search against the caller's per-minute allowance and says whether it may go ahead.
   * Names are not secret to someone who knows them, so the cap is what stops a script walking the player list.
   */
  allowSearch(ownerId: string): Promise<boolean>
}

/**
 * Games are stored under the GM and reached by members through a membership item, so every read
 * is checked against membership. Owner and member ids here are Cognito ids and never leave the API.
 */
export interface GameStore {
  /** The Game, only if `userId` is its GM or a member. */
  getForMember(userId: string, id: string): Promise<GameRecord | null>
  listFor(userId: string): Promise<GameRecord[]>
  countOwned(gmId: string): Promise<number>
  countJoined(userId: string): Promise<number>
  /** Create or replace the Game's settings. The GM is always a member. */
  save(gmId: string, id: string, draft: GameDraft): Promise<GameRecord>
  delete(gmId: string, id: string): Promise<boolean>
  /** The GM's id for a Game id, so a public Game can be joined from its link. */
  gmOf(gameId: string): Promise<string | null>
  /** Read a Game by its GM without a membership check. The caller must check access (public, or already a member). */
  getByGm(gmId: string, id: string): Promise<GameRecord | null>
  /** Add a member, or null if the Game is gone or full. Adding twice is fine. */
  addMember(gmId: string, id: string, userId: string): Promise<GameRecord | null>
  removeMember(gmId: string, id: string, userId: string): Promise<void>
  /**
   * The hero each member brought, by Cognito id (VTTER-77). The choice lives on the member's own
   * pointer item, so only that member can write it and leaving the Game takes it with them.
   */
  heroesOf(gameId: string, memberIds: string[]): Promise<Record<string, string>>
  /** Set the caller's hero for a Game, or clear it with null. The caller must already be a member. */
  setHero(userId: string, gameId: string, heroId: string | null): Promise<void>
  /**
   * One page of public Games their GM opted to list, newest activity first (VTTER-76). Reads a sparse
   * index, so a private or unlisted Game is absent from it rather than filtered out here.
   */
  listPublic(cursor?: string, limit?: number): Promise<{ games: GameRecord[]; cursor: string | null }>
}

/** Adventures are keyed (owner, id), so one owner can never read or change another's. */
export interface AdventureStore {
  list(ownerId: string): Promise<AdventureSummary[]>
  get(ownerId: string, id: string): Promise<AdventureRecord | null>
  save(ownerId: string, id: string, draft: AdventureDraft): Promise<AdventureRecord>
  delete(ownerId: string, id: string): Promise<boolean>
}

/**
 * Maps (VTTER-74, ADR 0011), keyed (owner, id) like adventures. `save` creates the map if it's new,
 * and throws MapLimitReached when the author already has the most maps allowed.
 */
export interface MapStore {
  list(ownerId: string): Promise<MapSummary[]>
  get(ownerId: string, id: string): Promise<MapRecord | null>
  save(ownerId: string, id: string, draft: MapDraft): Promise<MapRecord>
  delete(ownerId: string, id: string): Promise<boolean>
}

/**
 * Friends (ADR 0009). Each player holds their own side of a friendship. Ids here are Cognito ids and
 * never leave the API: the handler turns them into player IDs and display names.
 */
export interface FriendStore {
  /** My side of every friendship and request. */
  list(userId: string): Promise<FriendEdge[]>
  get(userId: string, otherId: string): Promise<FriendEdge | null>
  /** `from` asks `to`: writes `outgoing` for the sender and `incoming` for the receiver. */
  request(fromId: string, toId: string): Promise<void>
  /** Mark both sides accepted. */
  accept(userId: string, otherId: string): Promise<void>
  /** Delete both sides: declines a request, cancels one, or ends a friendship. */
  remove(userId: string, otherId: string): Promise<void>
  /** True only when BOTH sides are accepted, so removing either side revokes access. */
  areFriends(a: string, b: string): Promise<boolean>
  /** Of `friendIds`, those who have the caller as accepted on their own side too. Presence is shown for these only. */
  mutualWith(userId: string, friendIds: string[]): Promise<string[]>
  /** Player ID and display name for many users in one read. A user with no profile is absent. */
  identities(userIds: string[]): Promise<Record<string, FriendIdentity>>
}

/**
 * Presence (ADR 0012): the Game page a player has open right now. A heartbeat only ever writes the caller's
 * own item, and a read is by id, so the handler decides who may see whom. Ids are Cognito ids.
 */
export interface PresenceStore {
  /** Record that `userId` has the app open at `nowMs`, on `gameId`'s page, or on any other page when `gameId` is null. */
  beat(userId: string, gameId: string | null, nowMs: number): Promise<void>
  /** The last heartbeat of each player who has sent one. A player who never has is absent. */
  presenceOf(userIds: string[]): Promise<Record<string, PresenceRecord>>
}

/**
 * Chat between friends (ADR 0010). Ids here are Cognito ids and never leave the API. The handler checks
 * friendship before every call, so the store never decides who may talk to whom.
 */
export interface ChatStore {
  /** One page of the pair's thread, oldest first. `after` reads forward (polling), `before` reads back, neither reads the newest. */
  list(a: string, b: string, query: { before?: string; after?: string }): Promise<{ messages: ChatMessageRecord[]; hasMore: boolean }>
  /** Store a message, or null when the sender is over the per-minute cap. Also sets the unread markers. */
  send(from: string, to: string, text: string): Promise<ChatMessageRecord | null>
  /** The caller has seen the thread up to now. */
  markRead(userId: string, otherId: string): Promise<void>
}

/**
 * Checks a bearer token and returns the verified user id (the Cognito `sub`), or null if the token is invalid.
 * Production uses the Cognito access-token verifier in src/auth.ts. Tests inject a fake.
 */
export type VerifyToken = (token: string) => Promise<string | null>

export interface Deps {
  store: CharacterStore
  profiles: ProfileStore
  adventures: AdventureStore
  maps: MapStore
  games: GameStore
  friends: FriendStore
  chat: ChatStore
  presence: PresenceStore
  portraits: PortraitStore
  allowedOrigins: string[]
  verifyToken: VerifyToken
}

export const MAX_BODY_BYTES = 256 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BEARER = /^Bearer\s+(\S+)$/i

/** Thrown by the store when the database is briefly unavailable (throttled or a transient AWS error). */
export class DatabaseUnavailable extends Error {}

/**
 * A GM already has a Game with this name (ADR 0008). Declared here, not in the store, so the store
 * depends on the handler and not the other way round — the same way DatabaseUnavailable does.
 * Caught centrally below, so every route that saves a Game answers 409 without repeating itself.
 */
export class NameTaken extends Error {}

/** The author already has `data/map.json` `limits.mapsPerUser` maps. Thrown by the map store, answered with a 409. */
export class MapLimitReached extends Error {}

/** A map can be up to `limits.itemBytesMax` (350 KB) stored, so its request body may be bigger than other routes'. */
const MAX_MAP_BODY_BYTES = 400 * 1024

class HttpError extends Error {
  status: number
  headers: Record<string, string>
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })
}

/** The signed-in user's id from a verified `Authorization: Bearer <access token>` header (VTTER-53). */
async function ownerOf(req: Request, verify: VerifyToken): Promise<string> {
  const token = BEARER.exec(req.headers.get('Authorization') ?? '')?.[1]
  if (!token) throw new HttpError(401, 'Sign in required', { 'WWW-Authenticate': 'Bearer' })
  const owner = await verify(token)
  if (!owner) throw new HttpError(401, 'Invalid or expired token', { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
  return owner.toLowerCase()
}

async function readJson(req: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? '0')
  if (len > max) throw new HttpError(413, 'Body too large')
  const text = await req.text()
  if (new TextEncoder().encode(text).length > max) throw new HttpError(413, 'Body too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Body is not valid JSON')
  }
}

/** GET, PUT (full replace) and DELETE of one item. The owner is already baked into the closures. */
async function itemRoute(
  req: Request, label: string, cors: Record<string, string>,
  ops: { get(): Promise<unknown>; save(body: unknown): Promise<unknown>; remove(): Promise<boolean> },
  maxBody = MAX_BODY_BYTES,
): Promise<Response> {
  switch (req.method) {
    case 'GET': {
      const item = await ops.get()
      if (!item) throw new HttpError(404, `${label} not found`)
      return json(item, 200, cors)
    }
    case 'PUT':
      return json(await ops.save(await readJson(req, maxBody)), 200, cors)
    case 'DELETE': {
      if (!(await ops.remove())) throw new HttpError(404, `${label} not found`)
      return json(null, 204, cors)
    }
    default:
      throw new HttpError(405, 'Method not allowed')
  }
}

/** `/characters/:id/portrait` (VTTER-55). Only the hero's owner, and only a hero that exists. */
async function portraitRoute(req: Request, heroId: string, owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  const { portraits } = deps
  if (req.method === 'DELETE') {
    // Idempotent, and works even if the hero is already gone.
    await portraits.delete(owner, heroId)
    return json(null, 204, cors)
  }
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  if (!(await deps.store.get(owner, heroId))) throw new HttpError(404, 'Character not found')
  if (req.method === 'POST') {
    const upload = parsePortraitUpload(await readJson(req))
    const url = await portraits.uploadUrl(owner, heroId, upload)
    return json({
      url, method: 'PUT', expiresIn: PORTRAIT.urlSeconds,
      headers: { 'Content-Type': upload.contentType, 'Content-Length': String(upload.size) },
    }, 200, cors)
  }
  const url = await portraits.downloadUrl(owner, heroId)
  if (!url) throw new HttpError(404, 'No portrait')
  return json({ url, expiresIn: PORTRAIT.urlSeconds }, 200, cors)
}

/** `GET /portraits`: signed read URLs for all of the caller's hero portraits, in one call for the hero lists. */
async function portraitsRoute(req: Request, owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
  return json({ portraits: await deps.portraits.list(owner), expiresIn: PORTRAIT.urlSeconds }, 200, cors)
}

async function profileRoute(req: Request, owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  switch (req.method) {
    case 'GET':
      return json(await deps.profiles.getOrCreate(owner), 200, cors)
    case 'PUT': {
      const patch = parseProfilePatch(await readJson(req))
      await deps.profiles.getOrCreate(owner) // make sure the profile (and player ID) exists first
      return json(await deps.profiles.update(owner, patch), 200, cors)
    }
    default:
      throw new HttpError(405, 'Method not allowed')
  }
}

/**
 * `GET /players?name=` (VTTER-108): find a player by display name, to add as a friend. Any signed-in player
 * may ask. A result is a player ID and a display name and nothing else, and only for a player who turned on
 * "let people find me by name". The name must match whole: there is no way to list players by prefix.
 */
async function playersRoute(req: Request, owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
  const name = (new URL(req.url).searchParams.get('name') ?? '').trim()
  if (!name) throw new HttpError(400, 'Type the name to look for')
  if (name.length > DISPLAY_NAME_MAX) throw new HttpError(400, `Names are at most ${DISPLAY_NAME_MAX} characters`)
  if (!(await deps.profiles.allowSearch(owner))) throw new HttpError(429, 'You are searching too fast. Wait a moment.', { 'Retry-After': '30' })
  const found = await deps.profiles.findByName(name, owner, NAME_SEARCH.maxResults)
  // Field by field, so nothing else on a profile or an index row can ride along.
  return json({ players: found.map(p => ({ playerId: p.playerId, displayName: p.displayName })) }, 200, cors)
}

/** What a member sees of a Game: names and player IDs, never Cognito ids. */
async function gameView(game: GameRecord, userId: string, deps: Deps) {
  // Each member's chosen hero, shown to the whole table read-only (VTTER-77).
  const heroIds = await deps.games.heroesOf(game.id, game.memberIds)
  // Who is at this table right now (VTTER-73): members already see each other's names and heroes, so this adds nothing new.
  const online = new Set(onlineIds(await deps.presence.presenceOf(game.memberIds), Date.now(), game.id))
  const members = await Promise.all(game.memberIds.map(async id => {
    const p = await deps.profiles.peek(id)
    const heroId = heroIds[id]
    const hero = heroId ? await deps.store.get(id, heroId) : null
    return {
      playerId: p?.playerId ?? '',
      displayName: p?.displayName ?? '',
      role: id === game.ownerId ? 'gm' : 'player',
      // A hero the player deleted leaves the slot empty rather than a dangling id.
      hero: hero ? { id: hero.id, name: hero.name, level: hero.level, ancestry: hero.ancestry, calling: hero.calling } : null,
      mine: id === userId,
      online: online.has(id),
    }
  }))
  // Members read the GM's own adventure through the Game. Built-in adventures ship with the app.
  const own = game.adventure.source === 'own' ? await deps.adventures.get(game.ownerId, game.adventure.id) : null
  const { ownerId: _o, ...adventureContent } = own ?? ({} as Partial<AdventureRecord>)
  return {
    id: game.id,
    name: game.name,
    adventure: game.adventure,
    visibility: game.visibility,
    solo: game.solo,
    role: game.ownerId === userId ? 'gm' : 'player',
    members,
    adventureContent: own ? adventureContent : null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  }
}

function gameSummary(game: GameRecord, userId: string) {
  return {
    id: game.id, name: game.name, adventure: game.adventure, visibility: game.visibility, solo: game.solo,
    role: game.ownerId === userId ? 'gm' : 'player', memberCount: game.memberIds.length, updatedAt: game.updatedAt,
  }
}

/**
 * One row of the public browse list (VTTER-76). Built field by field on purpose: an index row carries
 * the base table keys, and `ownerId` there is the GM's Cognito `sub`, which must never leave the API.
 * So never spread a row into the response — name every field that goes out.
 * `joined` lets the UI show "Open" instead of "Join" without a second request per row.
 */
async function browseRow(game: GameRecord, userId: string, deps: Deps) {
  const gm = await deps.profiles.peek(game.ownerId)
  return {
    id: game.id,
    name: game.name,
    adventure: game.adventure,
    // The GM as other players may see them: a public player ID and a display name, never a Cognito id.
    gm: { playerId: gm?.playerId ?? '', displayName: gm?.displayName ?? '' },
    memberCount: game.memberIds.length,
    heroCount: Object.keys(await deps.games.heroesOf(game.id, game.memberIds)).length,
    full: game.memberIds.length >= gameData.limits.maxMembers,
    joined: game.memberIds.includes(userId),
    updatedAt: game.updatedAt,
  }
}

/** `/games`, `/games/public`, `/games/:id` and `/games/:id/members/:playerId`. Every read goes through membership. */
async function gamesRoute(req: Request, parts: string[], owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  const { games } = deps
  if (parts.length === 1) {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
    return json({ games: (await games.listFor(owner)).map(g => gameSummary(g, owner)) }, 200, cors)
  }
  // /games/public — the browse list (VTTER-76). Must come before the UUID check: "public" is not an id.
  // Signed in, like every other route, but it needs no membership: that is the point of a public Game.
  if (parts[1] === 'public' && parts.length === 2) {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
    const url = new URL(req.url)
    const raw = url.searchParams.get('limit')
    // A bad limit falls back to the default rather than failing the browse.
    const limit = raw && /^\d{1,3}$/.test(raw) ? Number(raw) : undefined
    const page = await games.listPublic(url.searchParams.get('cursor') ?? undefined, limit)
    return json({
      games: await Promise.all(page.games.map(g => browseRow(g, owner, deps))),
      cursor: page.cursor,
    }, 200, cors)
  }

  const id = parts[1].toLowerCase()
  if (!UUID.test(id)) throw new HttpError(400, 'Game id must be a UUID')

  if (parts.length === 2) {
    switch (req.method) {
      case 'GET': {
        const game = await games.getForMember(owner, id)
        if (!game) throw new HttpError(404, 'Game not found')
        return json(await gameView(game, owner, deps), 200, cors)
      }
      case 'PUT': {
        const draft = parseGame(await readJson(req))
        const existing = await games.getForMember(owner, id)
        if (existing && existing.ownerId !== owner) throw new HttpError(403, 'Only the Game Master can change a Game')
        if (!draft.solo && !(await deps.profiles.getOrCreate(owner)).gameMaster) {
          throw new HttpError(403, 'Turn on Game Master in Settings to run a Game with other players')
        }
        if (draft.adventure.source === 'own' && !(await deps.adventures.get(owner, draft.adventure.id))) {
          throw new HttpError(400, 'That adventure was not found')
        }
        if (existing) {
          if (draft.solo && existing.memberIds.length > 1) throw new HttpError(400, 'Remove the other players before making this a solo Game')
        } else {
          const taken = await games.gmOf(id)
          if (taken && taken !== owner) throw new HttpError(409, 'That Game id is already in use')
          if ((await games.countOwned(owner)) >= gameData.limits.maxGamesPerGm) {
            throw new HttpError(400, `You can run at most ${gameData.limits.maxGamesPerGm} Games. Delete one first.`)
          }
        }
        return json(await gameView(await games.save(owner, id, draft), owner, deps), 200, cors)
      }
      case 'DELETE': {
        const game = await games.getForMember(owner, id)
        if (!game) throw new HttpError(404, 'Game not found')
        if (game.ownerId !== owner) throw new HttpError(403, 'Only the Game Master can delete a Game. Leave it instead.')
        await games.delete(owner, id)
        return json(null, 204, cors)
      }
      default:
        throw new HttpError(405, 'Method not allowed')
    }
  }

  // /games/:id/presence — a heartbeat while the caller has this Game open (VTTER-73, ADR 0012). Members only, and it
  // only ever writes the caller's own presence. The answer is the player IDs online at this table, so the page needs one call.
  if (parts[2] === 'presence' && parts.length === 3) {
    if (req.method !== 'PUT') throw new HttpError(405, 'Method not allowed')
    const game = await games.getForMember(owner, id)
    if (!game) throw new HttpError(404, 'Game not found')
    const now = Date.now()
    await deps.presence.beat(owner, id, now)
    const here = onlineIds(await deps.presence.presenceOf(game.memberIds), now, id)
    const who = await deps.friends.identities(here)
    return json({ online: here.map(userId => who[userId]?.playerId).filter(Boolean) }, 200, cors)
  }

  // /games/:id/hero — the caller picks or clears their own hero (VTTER-77). Never anyone else's.
  if (parts[2] === 'hero' && parts.length === 3) {
    if (req.method !== 'PUT' && req.method !== 'DELETE') throw new HttpError(405, 'Method not allowed')
    const game = await games.getForMember(owner, id)
    if (!game) throw new HttpError(404, 'Game not found')
    let heroId: string | null = null
    if (req.method === 'PUT') {
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be an object')
      const raw = (body as Record<string, unknown>).heroId
      if (typeof raw !== 'string' || !UUID.test(raw)) throw new HttpError(400, 'heroId must be a UUID')
      heroId = raw.toLowerCase()
      // The hero must be the caller's own: the owner comes from the verified token, never the request.
      if (!(await deps.store.get(owner, heroId))) throw new HttpError(404, 'That hero was not found')
    }
    await games.setHero(owner, id, heroId)
    return json(await gameView(game, owner, deps), 200, cors)
  }

  // /games/:id/members/:playerId
  if (parts[2] !== 'members' || parts.length !== 4) throw new HttpError(404, 'Not found')
  if (req.method !== 'PUT' && req.method !== 'DELETE') throw new HttpError(405, 'Method not allowed')
  const playerId = parts[3].toUpperCase()
  if (!isPlayerId(playerId)) throw new HttpError(400, 'That is not a player ID')
  const me = await deps.profiles.getOrCreate(owner)
  const target = await deps.profiles.ownerOfPlayer(playerId)
  if (!target) throw new HttpError(404, 'No player has that ID')
  const mine = target === owner && playerId === me.playerId

  if (req.method === 'PUT') {
    let gmId: string
    let game = await games.getForMember(owner, id)
    if (mine) {
      // Joining as yourself: fine if you are already in, or if the Game is public and you have its link.
      if (game) return json(await gameView(game, owner, deps), 200, cors)
      const found = await games.gmOf(id)
      game = found ? await games.getByGm(found, id) : null
      if (!game || game.visibility !== 'public') throw new HttpError(404, 'Game not found')
      gmId = game.ownerId
    } else {
      // Inviting someone else: only the GM.
      if (!game) throw new HttpError(404, 'Game not found')
      if (game.ownerId !== owner) throw new HttpError(403, 'Only the Game Master can invite players')
      gmId = owner
    }
    if (game.solo) throw new HttpError(400, 'A solo Game has one player')
    if (!game.memberIds.includes(target) && (await games.countJoined(target)) >= gameData.limits.maxGamesPerPlayer) {
      throw new HttpError(400, 'That player is in as many Games as they can be')
    }
    const joined = await games.addMember(gmId, id, target)
    if (!joined) throw new HttpError(409, `This Game is full (${gameData.limits.maxMembers} people)`)
    return json(await gameView(joined, owner, deps), 200, cors)
  }

  // DELETE: the GM removes a player, or a player leaves.
  const game = await games.getForMember(owner, id)
  if (!game) throw new HttpError(404, 'Game not found')
  if (target === game.ownerId) throw new HttpError(400, 'The Game Master cannot leave. Delete the Game instead.')
  if (game.ownerId !== owner && !mine) throw new HttpError(403, 'Only the Game Master can remove other players')
  if (!game.memberIds.includes(target)) throw new HttpError(404, 'That player is not in this Game')
  await games.removeMember(game.ownerId, id, target)
  return json(null, 204, cors)
}

/** The caller's friends, incoming requests and outgoing requests, as player IDs and display names. */
async function friendLists(owner: string, deps: Deps) {
  const edges = await deps.friends.list(owner)
  const who = await deps.friends.identities(edges.map(e => e.userId))
  const accepted = edges.filter(e => e.status === 'accepted' && who[e.userId]).map(e => e.userId)
  return toFriendLists(edges, who, await friendPresence(owner, accepted, deps))
}

/**
 * Which of the caller's friends are online (VTTER-73). A player ID is public, so presence is only for mutual
 * friends: both sides accepted, checked on THEIR side too, so someone who removed the caller never shows.
 * A friend's Game is named only if the caller is a member of it, so a private Game's name never reaches an outsider.
 * Built field by field from the player's Cognito id, which never leaves the API.
 */
async function friendPresence(owner: string, friendIds: string[], deps: Deps): Promise<Record<string, FriendPresence>> {
  if (friendIds.length === 0) return {}
  const mutual = await deps.friends.mutualWith(owner, friendIds)
  if (mutual.length === 0) return {}
  const seen = await deps.presence.presenceOf(mutual)
  const here = onlineIds(seen, Date.now())
  if (here.length === 0) return {}
  // One list of the caller's own Games, only when someone is online, to name the ones they share.
  const mine = await deps.games.listFor(owner)
  const out: Record<string, FriendPresence> = {}
  for (const id of here) {
    const shared = mine.find(g => g.id === seen[id].gameId)
    out[id] = { game: shared ? { id: shared.id, name: shared.name } : null }
  }
  return out
}

/**
 * `/friends`, `/friends/:playerId`, and a friend's shared adventures (VTTER-73, ADR 0009).
 * Reading a friend's adventure needs both sides of the friendship accepted, and every refusal there is
 * the same 404, so nobody can tell "no such player" from "not your friend" from "not shared".
 */
async function friendsRoute(req: Request, parts: string[], owner: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  const { friends } = deps
  if (parts.length === 1) {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
    return json(await friendLists(owner, deps), 200, cors)
  }

  const playerId = parts[1].toUpperCase()
  if (!isPlayerId(playerId)) throw new HttpError(400, 'That is not a player ID')
  const target = await deps.profiles.ownerOfPlayer(playerId)

  if (parts.length === 2) {
    if (req.method !== 'PUT' && req.method !== 'DELETE') throw new HttpError(405, 'Method not allowed')
    await deps.profiles.getOrCreate(owner) // make sure the caller has a player ID before they friend anyone
    if (!target) throw new HttpError(404, 'No player has that ID')
    if (target === owner) throw new HttpError(400, 'You cannot friend yourself')
    const [mine, theirs] = await Promise.all([friends.get(owner, target), friends.get(target, owner)])

    if (req.method === 'DELETE') {
      if (!mine && !theirs) throw new HttpError(404, 'You have no friendship or request with that player')
      await friends.remove(owner, target)
      return json(null, 204, cors)
    }

    if (mine?.status === 'accepted' && theirs?.status === 'accepted') return json(await friendLists(owner, deps), 200, cors)
    // They already asked me (or my request is already pending on both sides): asking back accepts.
    if (mine?.status === 'incoming' || theirs?.status === 'outgoing') {
      const [mineAll, theirsAll] = await Promise.all([friends.list(owner), friends.list(target)])
      const full = (all: FriendEdge[]) => all.filter(e => e.status === 'accepted').length >= FRIEND_LIMITS.maxFriends
      if (full(mineAll)) throw new HttpError(400, `You can have at most ${FRIEND_LIMITS.maxFriends} friends`)
      if (full(theirsAll)) throw new HttpError(400, 'That player has as many friends as they can have')
      await friends.accept(owner, target)
      return json(await friendLists(owner, deps), 200, cors)
    }
    // My side says friends but theirs doesn't (they removed me): drop the stale side and ask afresh.
    if (mine?.status === 'accepted') await friends.remove(owner, target)
    if (mine?.status === 'outgoing') {
      await friends.request(owner, target) // sending again repairs a request whose second write was lost
      return json(await friendLists(owner, deps), 200, cors)
    }
    const [mineAll, theirsAll] = await Promise.all([friends.list(owner), friends.list(target)])
    if (mineAll.filter(e => e.status === 'outgoing').length >= FRIEND_LIMITS.maxOutgoing) {
      throw new HttpError(400, `You can have at most ${FRIEND_LIMITS.maxOutgoing} requests waiting. Cancel one first.`)
    }
    if (theirsAll.filter(e => e.status === 'incoming').length >= FRIEND_LIMITS.maxIncoming) {
      throw new HttpError(400, 'That player has too many requests waiting. Try again later.')
    }
    await friends.request(owner, target)
    return json(await friendLists(owner, deps), 200, cors)
  }

  // /friends/:playerId/messages and /friends/:playerId/messages/read (VTTER-109, ADR 0010). Same 404 as adventures.
  if (parts[2] === 'messages') {
    if (!target || target === owner || !(await friends.areFriends(owner, target))) throw new HttpError(404, 'Not found')
    return chatRoute(req, parts, owner, target, deps, cors)
  }

  // /friends/:playerId/adventures and /friends/:playerId/adventures/:id — read-only, `friends` visibility only.
  if (parts[2] !== 'adventures' || parts.length > 4) throw new HttpError(404, 'Not found')
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
  if (!target || !(await friends.areFriends(owner, target))) throw new HttpError(404, 'Not found')

  if (parts.length === 3) {
    const shared = (await deps.adventures.list(target)).filter(a => a.visibility === 'friends')
    return json({ adventures: shared }, 200, cors)
  }
  const id = parts[3].toLowerCase()
  if (!UUID.test(id)) throw new HttpError(400, 'Adventure id must be a UUID')
  const adventure = await deps.adventures.get(target, id)
  if (!adventure || adventure.visibility !== 'friends') throw new HttpError(404, 'Not found')
  // The record carries its owner's Cognito id; it must never leave the API.
  const { ownerId: _o, ...shared } = adventure
  return json(shared, 200, cors)
}

/** Messages with one friend. The caller has already been checked as a friend of `target`. */
async function chatRoute(req: Request, parts: string[], owner: string, target: string, deps: Deps, cors: Record<string, string>): Promise<Response> {
  const { chat } = deps
  if (parts.length === 4) {
    if (parts[3] !== 'read') throw new HttpError(404, 'Not found')
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    await chat.markRead(owner, target)
    return json(null, 204, cors)
  }
  if (parts.length !== 3) throw new HttpError(404, 'Not found')

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const before = url.searchParams.get('before')
    const after = url.searchParams.get('after')
    if (before !== null && after !== null) throw new HttpError(400, 'Use before or after, not both')
    for (const cursor of [before, after]) if (cursor !== null && !isMessageId(cursor)) throw new HttpError(400, 'That is not a message id')
    const page = await chat.list(owner, target, { before: before ?? undefined, after: after ?? undefined })
    return json({ messages: page.messages.map(m => toMessageView(m, owner)), hasMore: page.hasMore }, 200, cors)
  }
  if (req.method === 'POST') {
    const text = parseMessage(await readJson(req))
    const sent = await chat.send(owner, target, text)
    if (!sent) throw new HttpError(429, 'You are sending messages too fast. Wait a moment.', { 'Retry-After': '30' })
    return json(toMessageView(sent, owner), 201, cors)
  }
  throw new HttpError(405, 'Method not allowed')
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get('Origin'), deps.allowedOrigins)
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const { pathname } = new URL(req.url)
    const parts = pathname.split('/').filter(Boolean)

    if (parts.length === 1 && parts[0] === 'health' && req.method === 'GET') {
      try {
        await deps.store.ping()
        return json({ ok: true, db: 'ok' }, 200, cors)
      } catch {
        return json({ ok: false, db: 'unreachable' }, 503, cors)
      }
    }

    const resource = parts[0]
    const maxParts = resource === 'profile' || resource === 'portraits' || resource === 'presence' || resource === 'players' ? 1 : resource === 'games' || resource === 'friends' ? 4 : resource === 'characters' ? 3 : 2
    // Three parts is only ever /games/:id/hero (VTTER-77), /characters/:id/portrait (VTTER-55) or
    // /friends/:playerId/adventures (VTTER-73); gamesRoute and friendsRoute reject any other segment.
    if (!['characters', 'profile', 'adventures', 'maps', 'games', 'friends', 'portraits', 'presence', 'players'].includes(resource) || parts.length > maxParts
      || (parts.length === 3 && resource !== 'games' && resource !== 'friends' && !(resource === 'characters' && parts[2] === 'portrait'))) {
      throw new HttpError(404, 'Not found')
    }
    const owner = await ownerOf(req, deps.verifyToken)

    // `return await` so errors thrown inside a route are caught below and become 4xx/5xx responses.
    if (resource === 'portraits') return await portraitsRoute(req, owner, deps, cors)
    // /presence: a heartbeat from any page that is not a Game page (ADR 0012). Writes only the caller's own item.
    if (resource === 'presence') {
      if (req.method !== 'PUT') throw new HttpError(405, 'Method not allowed')
      await deps.presence.beat(owner, null, Date.now())
      return json(null, 204, cors)
    }
    if (resource === 'profile') return await profileRoute(req, owner, deps, cors)
    if (resource === 'players') return await playersRoute(req, owner, deps, cors)
    if (resource === 'games') return await gamesRoute(req, parts, owner, deps, cors)
    if (resource === 'friends') return await friendsRoute(req, parts, owner, deps, cors)

    if (parts.length === 1) {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
      if (resource === 'maps') return json({ maps: await deps.maps.list(owner), limit: MAPS_PER_USER }, 200, cors)
      return resource === 'characters'
        ? json({ characters: await deps.store.list(owner) }, 200, cors)
        : json({ adventures: await deps.adventures.list(owner) }, 200, cors)
    }

    const id = parts[1].toLowerCase()
    const label = resource === 'characters' ? 'Character' : resource === 'maps' ? 'Map' : 'Adventure'
    if (!UUID.test(id)) throw new HttpError(400, `${label} id must be a UUID`)

    if (resource === 'characters') {
      if (parts.length === 3) return await portraitRoute(req, id, owner, deps, cors)
      return await itemRoute(req, label, cors, {
        get: () => deps.store.get(owner, id),
        save: body => deps.store.save(owner, id, parseSheet(body)),
        remove: async () => {
          const removed = await deps.store.delete(owner, id)
          if (removed) await deps.portraits.delete(owner, id) // the portrait goes with the hero
          return removed
        },
      })
    }
    if (resource === 'maps') {
      // A chapter's map link and the Game read path (with playerViewOfMap) arrive with chapters, VTTER-75.
      return await itemRoute(req, label, cors, {
        get: () => deps.maps.get(owner, id),
        save: body => deps.maps.save(owner, id, parseMap(body)),
        remove: () => deps.maps.delete(owner, id),
      }, MAX_MAP_BODY_BYTES)
    }
    return await itemRoute(req, label, cors, {
      get: () => deps.adventures.get(owner, id),
      save: body => deps.adventures.save(owner, id, parseAdventure(body)),
      remove: () => deps.adventures.delete(owner, id),
    })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, { ...cors, ...err.headers })
    if (err instanceof ValidationError) return json({ error: err.message }, 400, cors)
    if (err instanceof NameTaken) {
      return json({ error: `You already have a Game called "${err.message}". Pick another name.` }, 409, cors)
    }
    if (err instanceof MapLimitReached) {
      return json({ error: `You can have ${MAPS_PER_USER} maps. Delete one to make another.` }, 409, cors)
    }
    if (err instanceof DatabaseUnavailable) {
      return json({ error: 'Database temporarily unavailable. Try again shortly.' }, 503, { ...cors, 'Retry-After': '5' })
    }
    console.error('Unhandled error', err)
    return json({ error: 'Internal error' }, 500, cors)
  }
}
