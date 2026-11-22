// HTTP routing and validation for the Emberreach API. Pure: storage is injected, so it's unit-testable.

import { parseAdventure, type AdventureDraft, type AdventureRecord, type AdventureSummary } from './adventure.ts'
import { parseProfilePatch, type ProfilePatch, type ProfileRecord } from './profile.ts'
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
}

/** Adventures are keyed (owner, id), so one owner can never read or change another's. */
export interface AdventureStore {
  list(ownerId: string): Promise<AdventureSummary[]>
  get(ownerId: string, id: string): Promise<AdventureRecord | null>
  save(ownerId: string, id: string, draft: AdventureDraft): Promise<AdventureRecord>
  delete(ownerId: string, id: string): Promise<boolean>
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
  allowedOrigins: string[]
  verifyToken: VerifyToken
}

export const MAX_BODY_BYTES = 256 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BEARER = /^Bearer\s+(\S+)$/i

/** Thrown by the store when the database is briefly unavailable (throttled or a transient AWS error). */
export class DatabaseUnavailable extends Error {}

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
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? '0')
  if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large')
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large')
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
): Promise<Response> {
  switch (req.method) {
    case 'GET': {
      const item = await ops.get()
      if (!item) throw new HttpError(404, `${label} not found`)
      return json(item, 200, cors)
    }
    case 'PUT':
      return json(await ops.save(await readJson(req)), 200, cors)
    case 'DELETE': {
      if (!(await ops.remove())) throw new HttpError(404, `${label} not found`)
      return json(null, 204, cors)
    }
    default:
      throw new HttpError(405, 'Method not allowed')
  }
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
    const maxParts = resource === 'profile' ? 1 : 2
    if ((resource !== 'characters' && resource !== 'profile' && resource !== 'adventures') || parts.length > maxParts) {
      throw new HttpError(404, 'Not found')
    }
    const owner = await ownerOf(req, deps.verifyToken)

    // `return await` so errors thrown inside a route are caught below and become 4xx/5xx responses.
    if (resource === 'profile') return await profileRoute(req, owner, deps, cors)

    if (parts.length === 1) {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
      return resource === 'characters'
        ? json({ characters: await deps.store.list(owner) }, 200, cors)
        : json({ adventures: await deps.adventures.list(owner) }, 200, cors)
    }

    const id = parts[1].toLowerCase()
    const label = resource === 'characters' ? 'Character' : 'Adventure'
    if (!UUID.test(id)) throw new HttpError(400, `${label} id must be a UUID`)

    if (resource === 'characters') {
      return await itemRoute(req, label, cors, {
        get: () => deps.store.get(owner, id),
        save: body => deps.store.save(owner, id, parseSheet(body)),
        remove: () => deps.store.delete(owner, id),
      })
    }
    return await itemRoute(req, label, cors, {
      get: () => deps.adventures.get(owner, id),
      save: body => deps.adventures.save(owner, id, parseAdventure(body)),
      remove: () => deps.adventures.delete(owner, id),
    })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, { ...cors, ...err.headers })
    if (err instanceof ValidationError) return json({ error: err.message }, 400, cors)
    if (err instanceof DatabaseUnavailable) {
      return json({ error: 'Database temporarily unavailable. Try again shortly.' }, 503, { ...cors, 'Retry-After': '5' })
    }
    console.error('Unhandled error', err)
    return json({ error: 'Internal error' }, 500, cors)
  }
}
