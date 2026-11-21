// HTTP routing and validation for the Emberreach API. Pure: storage is injected, so it's unit-testable.

import { parseSheet, ValidationError, type CharacterRecord, type CharacterSheet, type CharacterSummary } from './sheet.ts'

export interface CharacterStore {
  ping(): Promise<void>
  list(ownerId: string): Promise<CharacterSummary[]>
  get(ownerId: string, id: string): Promise<CharacterRecord | null>
  /** Insert or replace the whole sheet. Keys are (owner, id), so one owner can never touch another's hero. */
  save(ownerId: string, id: string, sheet: CharacterSheet): Promise<CharacterRecord>
  delete(ownerId: string, id: string): Promise<boolean>
}

/**
 * Checks a bearer token and returns the verified user id (the Cognito `sub`), or null if the token is invalid.
 * Production uses the Cognito access-token verifier in src/auth.ts. Tests inject a fake.
 */
export type VerifyToken = (token: string) => Promise<string | null>

export interface Deps {
  store: CharacterStore
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

    if (parts[0] !== 'characters' || parts.length > 2) throw new HttpError(404, 'Not found')
    const owner = await ownerOf(req, deps.verifyToken)

    if (parts.length === 1) {
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed')
      return json({ characters: await deps.store.list(owner) }, 200, cors)
    }

    const id = parts[1].toLowerCase()
    if (!UUID.test(id)) throw new HttpError(400, 'Character id must be a UUID')

    switch (req.method) {
      case 'GET': {
        const c = await deps.store.get(owner, id)
        if (!c) throw new HttpError(404, 'Character not found')
        return json(c, 200, cors)
      }
      case 'PUT': {
        return json(await deps.store.save(owner, id, parseSheet(await readJson(req))), 200, cors)
      }
      case 'DELETE': {
        if (!(await deps.store.delete(owner, id))) throw new HttpError(404, 'Character not found')
        return json(null, 204, cors)
      }
      default:
        throw new HttpError(405, 'Method not allowed')
    }
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
