import { describe, expect, it } from 'vitest'
import { handle, type GameStore, type ProfileStore } from '../src/handler.ts'
import { DISPLAY_NAME_MAX, findKey, FIND_PK, foldedName, NAME_SEARCH, parseProfilePatch, type ProfilePatch, type ProfileRecord } from '../src/profile.ts'
import { MemoryPortraits } from './portraits-helper.ts'
import { findInMemory, searchAllowance } from './profile-search-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
// Cognito ids: these must never appear in any response body.
const ANA = 'sub-ana-0001'
const BEN = 'sub-ben-0002'
const CAL = 'sub-cal-0003'

class MemoryProfiles implements ProfileStore {
  rows = new Map<string, ProfileRecord>()
  allowSearch = searchAllowance(NAME_SEARCH.perMinute)
  private n = 0
  async getOrCreate(ownerId: string) {
    let r = this.rows.get(ownerId)
    if (!r) {
      const now = new Date().toISOString()
      r = { displayName: '', gameMaster: false, findable: false, playerId: `EMBER-AAAA${'ABCDEFGHJK'[this.n++]}`, createdAt: now, updatedAt: now }
      this.rows.set(ownerId, r)
    }
    return r
  }
  async update(ownerId: string, patch: ProfilePatch) {
    const r = { ...(await this.getOrCreate(ownerId)), ...patch }
    this.rows.set(ownerId, r)
    return r
  }
  async peek(ownerId: string) { return this.rows.get(ownerId) ?? null }
  async ownerOfPlayer(playerId: string) { return [...this.rows].find(([, r]) => r.playerId === playerId)?.[0] ?? null }
  async findByName(name: string, except: string, limit: number) { return findInMemory(this.rows, name, except, limit) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any>; text(): Promise<string> }

const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)

function world() {
  const profiles = new MemoryProfiles()
  const call = (method: string, path: string, opts: { as?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (opts.as) headers.Authorization = `Bearer token-${opts.as}`
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
      {
        store: {} as never, games: {} as GameStore, profiles, adventures: {} as never, friends: {} as never, chat: {} as never, presence: {} as never,
        portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken,
      },
    ) as unknown as Promise<Reply>
  }
  /** A player who has a display name and, if `findable`, has turned on being found. */
  const player = async (sub: string, displayName: string, findable: boolean) => {
    await profiles.getOrCreate(sub)
    return profiles.update(sub, { displayName, findable })
  }
  const search = (as: string | undefined, name: string) => call('GET', `/players?name=${encodeURIComponent(name)}`, { as })
  return { profiles, call, player, search }
}

describe('GET /players?name= (VTTER-108)', () => {
  it('needs a signed-in caller', async () => {
    const w = world()
    expect((await w.search(undefined, 'Ash')).status).toBe(401)
  })

  it('returns a player ID and a display name, and nothing else', async () => {
    const w = world()
    await w.player(ANA, 'Ana', true)
    const ben = await w.player(BEN, 'Ash', true)
    const res = await w.search(ANA, 'Ash')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ players: [{ playerId: ben.playerId, displayName: 'Ash' }] })
    for (const sub of [ANA, BEN, CAL]) expect(text).not.toContain(sub)
  })

  it('finds only players who opted in', async () => {
    const w = world()
    await w.player(ANA, 'Ana', true)
    await w.player(BEN, 'Ash', false) // has not turned it on
    expect(await (await w.search(ANA, 'Ash')).json()).toEqual({ players: [] })
  })

  it('folds case and spacing but matches the whole name, never a prefix', async () => {
    const w = world()
    await w.player(ANA, 'Ana', true)
    await w.player(BEN, 'Ash  Smith', true)
    expect((await (await w.search(ANA, 'ash smith')).json()).players).toHaveLength(1)
    expect((await (await w.search(ANA, 'Ash')).json()).players).toHaveLength(0)
    expect((await (await w.search(ANA, 'A')).json()).players).toHaveLength(0)
  })

  it('never returns the caller, and lists same-named players so the caller can pick', async () => {
    const w = world()
    const me = await w.player(ANA, 'Ash', true)
    const ben = await w.player(BEN, 'Ash', true)
    const cal = await w.player(CAL, 'ash', true)
    const ids = ((await (await w.search(ANA, 'Ash')).json()).players as { playerId: string }[]).map(p => p.playerId).sort()
    expect(ids).toEqual([ben.playerId, cal.playerId].sort())
    expect(ids).not.toContain(me.playerId)
  })

  it('caps the results', async () => {
    const w = world()
    await w.player(ANA, 'Ana', true)
    for (let i = 0; i < NAME_SEARCH.maxResults + 5; i++) await w.player(`sub-x-${i}`, 'Twin', true)
    expect((await (await w.search(ANA, 'Twin')).json()).players).toHaveLength(NAME_SEARCH.maxResults)
  })

  it('rejects an empty or over-long name', async () => {
    const w = world()
    expect((await w.search(ANA, '   ')).status).toBe(400)
    expect((await w.call('GET', '/players', { as: ANA })).status).toBe(400)
    expect((await w.search(ANA, 'x'.repeat(DISPLAY_NAME_MAX + 1))).status).toBe(400)
  })

  it('only answers GET', async () => {
    const w = world()
    expect((await w.call('POST', '/players?name=Ash', { as: ANA, body: {} })).status).toBe(405)
  })

  it('refuses with 429 and Retry-After once the per-minute allowance is used up', async () => {
    const w = world()
    await w.player(ANA, 'Ana', true)
    for (let i = 0; i < NAME_SEARCH.perMinute; i++) expect((await w.search(ANA, 'Ash')).status).toBe(200)
    const over = await w.search(ANA, 'Ash')
    expect(over.status).toBe(429)
    expect(over.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('the findable opt-in on the profile', () => {
  it('is off for a new profile and can be turned on and off with PUT /profile', async () => {
    const w = world()
    expect((await (await w.call('GET', '/profile', { as: ANA })).json()).findable).toBe(false)
    const on = await w.call('PUT', '/profile', { as: ANA, body: { findable: true } })
    expect((await on.json()).findable).toBe(true)
    const off = await w.call('PUT', '/profile', { as: ANA, body: { findable: false } })
    expect((await off.json()).findable).toBe(false)
  })

  it('must be a boolean', () => {
    expect(() => parseProfilePatch({ findable: 'yes' })).toThrow(/true or false/)
    expect(parseProfilePatch({ findable: true })).toEqual({ findable: true })
  })

  it('shares the display name limit with the data file', () => {
    expect(() => parseProfilePatch({ displayName: 'x'.repeat(DISPLAY_NAME_MAX + 1) })).toThrow()
    expect(parseProfilePatch({ displayName: 'x'.repeat(DISPLAY_NAME_MAX) }).displayName).toHaveLength(DISPLAY_NAME_MAX)
  })
})

describe('the name search key', () => {
  it('folds case and spacing, and escapes # and % so a prefix can never run into the player ID', () => {
    expect(foldedName('  Ash   Smith ')).toBe(foldedName('ash smith'))
    expect(foldedName('ash#smith')).not.toContain('#')
    expect(findKey('Ash', 'EMBER-AAAAAA')).toBe(`${foldedName('Ash')}#EMBER-AAAAAA`)
    // A search for `ash` looks for the prefix `ash#`, which `ash#smith` (escaped to `ash%23smith#...`) cannot match.
    expect(findKey('ash#smith', 'EMBER-AAAAAA').startsWith(`${foldedName('ash')}#`)).toBe(false)
    expect(FIND_PK).toBe(`player#${NAME_SEARCH.indexKey}`)
  })
})
