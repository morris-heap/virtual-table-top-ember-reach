import { MemoryPortraits } from './portraits-helper.ts'
import { describe, expect, it } from 'vitest'
import { handle, MAX_BODY_BYTES, type CharacterStore } from '../src/handler.ts'
import { parseSheet, type CharacterRecord, type CharacterSheet } from '../src/sheet.ts'
import core from '../../data/core.json'

const ORIGIN = 'https://emberreach.morris-heap.com'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const HERO = '33333333-3333-4333-8333-333333333333'

class MemoryStore implements CharacterStore {
  // Keyed like the DynamoDB table: (owner, id).
  rows = new Map<string, CharacterRecord>()
  down = false
  private key = (ownerId: string, id: string) => `${ownerId}/${id}`
  async ping() {
    if (this.down) throw new Error('down')
  }
  async list(ownerId: string) {
    return [...this.rows.values()].filter(r => r.ownerId === ownerId)
      .map(({ id, name, level, ancestry, calling, updatedAt }) => ({ id, name, level, ancestry, calling, updatedAt }))
  }
  async get(ownerId: string, id: string) {
    return this.rows.get(this.key(ownerId, id)) ?? null
  }
  async save(ownerId: string, id: string, sheet: CharacterSheet) {
    const existing = this.rows.get(this.key(ownerId, id))
    const now = new Date().toISOString()
    const r = { ...sheet, id, ownerId, createdAt: existing?.createdAt ?? now, updatedAt: now }
    this.rows.set(this.key(ownerId, id), r)
    return r
  }
  async delete(ownerId: string, id: string) {
    return this.rows.delete(this.key(ownerId, id))
  }
}

// Profile and adventure routes have their own tests (profile-adventures.test.ts); these tests never reach them.
const unusedStores = {
  portraits: new MemoryPortraits(),
  profiles: {
    getOrCreate: async () => { throw new Error('unused') }, update: async () => { throw new Error('unused') },
    peek: async () => null, ownerOfPlayer: async () => null, findByName: async () => [], allowSearch: async () => true,
  },
  games: {
    getForMember: async () => null, listFor: async () => [], countOwned: async () => 0, countJoined: async () => 0,
    save: async () => { throw new Error('unused') }, delete: async () => false, gmOf: async () => null, getByGm: async () => null,
    addMember: async () => null, removeMember: async () => {},
    heroesOf: async () => ({}), setHero: async () => {}, listPublic: async () => ({ games: [], cursor: null }),
  },
  friends: {} as never,
  chat: {} as never, presence: { presenceOf: async () => ({}), beat: async () => {} } as never,
  adventures: {
    list: async () => [], get: async () => null, delete: async () => false,
    save: async () => { throw new Error('unused') },
  },
}

// Sample level 1 Emberkin Hexer (matches docs/mockups).
const kestrel = {
  name: 'Kestrel Ashvane', player: 'Player 1', level: 1, ancestry: 'Emberkin', calling: 'Hexer',
  background: 'Hedge scholar', oath: 'I will learn what fell from the sky above Cindermere.',
  attributes: { might: -1, grace: 1, wits: 2, lore: 3, spirit: 2, presence: 0 },
  grit: 6, ember: 4, deathFails: 0, wounds: ['Grace'],
  skills: { Arcana: 2, History: 1, Insight: 1, Notice: 1, Spellcraft: 2 },
  attacks: [{ name: 'Ember Bolt', toHit: '+5', damage: '1d10', properties: 'Fire, far', notes: '' }],
  signature: 'Arcane Casting', talents: ['Ember Shield', 'Familiar'],
  spells: [{ name: 'Ember Bolt', ember: 0, target: '1 foe, Defense', effect: '1d10 fire' }],
  armor: 'none', shield: false, silver: 20, supplyDie: 'd8', gear: 'Focus, dagger, spellbook, ink',
  contacts: 'A rival academic', notes: '',
}

// Stand-in for the Cognito verifier: "token-<id>" is a valid token for user <id>, anything else is rejected.
const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)

function call(store: CharacterStore, method: string, path: string,
  opts: { owner?: string; auth?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = { Origin: opts.origin ?? ORIGIN }
  if (opts.owner) headers.Authorization = `Bearer token-${opts.owner}`
  if (opts.auth) headers.Authorization = opts.auth
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const req = new Request(`https://api.test${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  })
  return handle(req, { store, ...unusedStores, allowedOrigins: [ORIGIN, 'http://localhost:5173'], verifyToken })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function body(res: Response | Promise<Response>): Promise<any> {
  return (await res).json()
}

describe('health', () => {
  it('reports db ok', async () => {
    const res = await call(new MemoryStore(), 'GET', '/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, db: 'ok' })
  })
  it('reports 503 when the db is down', async () => {
    const s = new MemoryStore()
    s.down = true
    expect((await call(s, 'GET', '/health')).status).toBe(503)
  })
})

describe('CORS', () => {
  it('echoes an allowed origin', async () => {
    const res = await call(new MemoryStore(), 'OPTIONS', '/characters')
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After')
  })
  it('sends no CORS headers to other origins', async () => {
    const res = await call(new MemoryStore(), 'GET', '/health', { origin: 'https://evil.example' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('characters', () => {
  it('requires a valid bearer token', async () => {
    const s = new MemoryStore()
    const missing = await call(s, 'GET', '/characters')
    expect(missing.status).toBe(401)
    expect(missing.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(missing.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    const bad = await call(s, 'GET', '/characters', { auth: 'Bearer forged' })
    expect(bad.status).toBe(401)
    expect(bad.headers.get('WWW-Authenticate')).toContain('invalid_token')
    expect((await call(s, 'GET', '/characters', { auth: `token-${A}` })).status).toBe(401) // no "Bearer"
    expect((await call(s, 'PUT', `/characters/${HERO}`, { auth: 'Bearer nope', body: kestrel })).status).toBe(401)
    expect(s.rows.size).toBe(0)
  })

  it('ignores the old X-Owner-Id header', async () => {
    const req = new Request('https://api.test/characters', { headers: { 'X-Owner-Id': A } })
    expect((await handle(req, { store: new MemoryStore(), ...unusedStores, allowedOrigins: [], verifyToken })).status).toBe(401)
  })

  it('uses the verified user id as the owner', async () => {
    const s = new MemoryStore()
    await call(s, 'PUT', `/characters/${HERO}`, { auth: `Bearer token-${A.toUpperCase()}`, body: kestrel })
    expect([...s.rows.values()][0].ownerId).toBe(A)
  })

  it('creates, reads, lists, updates and deletes', async () => {
    const s = new MemoryStore()
    const put = await call(s, 'PUT', `/characters/${HERO}`, { owner: A, body: kestrel })
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ id: HERO, ownerId: A, name: 'Kestrel Ashvane', rulesVersion: core.version })

    const got = await body(call(s, 'GET', `/characters/${HERO}`, { owner: A }))
    expect(got.attributes.lore).toBe(3)
    expect(got.skills.Arcana).toBe(2)
    expect(got.wounds).toEqual(['Grace'])

    expect((await body(call(s, 'GET', '/characters', { owner: A }))).characters).toEqual([
      expect.objectContaining({ id: HERO, name: 'Kestrel Ashvane', level: 1, calling: 'Hexer' }),
    ])

    await call(s, 'PUT', `/characters/${HERO}`, { owner: A, body: { ...kestrel, name: 'Kestrel', grit: 10 } })
    expect((await body(call(s, 'GET', `/characters/${HERO}`, { owner: A }))).grit).toBe(10)

    expect((await call(s, 'DELETE', `/characters/${HERO}`, { owner: A })).status).toBe(204)
    expect((await call(s, 'GET', `/characters/${HERO}`, { owner: A })).status).toBe(404)
  })

  it("keeps owners apart: B can't read, overwrite or delete A's hero", async () => {
    const s = new MemoryStore()
    await call(s, 'PUT', `/characters/${HERO}`, { owner: A, body: kestrel })
    expect((await call(s, 'GET', `/characters/${HERO}`, { owner: B })).status).toBe(404)
    expect((await call(s, 'DELETE', `/characters/${HERO}`, { owner: B })).status).toBe(404)
    expect((await body(call(s, 'GET', '/characters', { owner: B }))).characters).toHaveLength(0)
    // Saving under A's id only creates B's own hero; A's is untouched.
    await call(s, 'PUT', `/characters/${HERO}`, { owner: B, body: { ...kestrel, name: 'Copy' } })
    expect((await body(call(s, 'GET', `/characters/${HERO}`, { owner: A }))).name).toBe('Kestrel Ashvane')
    expect((await body(call(s, 'GET', `/characters/${HERO}`, { owner: B }))).name).toBe('Copy')
  })

  it('rejects bad bodies with 400 / 413', async () => {
    const s = new MemoryStore()
    const status = async (b: unknown) => (await call(s, 'PUT', `/characters/${HERO}`, { owner: A, body: b })).status
    expect(await status('not json')).toBe(400)
    expect(await status([])).toBe(400)
    expect(await status({ ...kestrel, name: '' })).toBe(400)
    expect(await status({ ...kestrel, notes: 'x'.repeat(MAX_BODY_BYTES) })).toBe(413)
  })

  it('rejects bad ids and unknown routes', async () => {
    const s = new MemoryStore()
    expect((await call(s, 'GET', '/characters/123', { owner: A })).status).toBe(400)
    expect((await call(s, 'GET', '/nope', { owner: A })).status).toBe(404)
    expect((await call(s, 'POST', '/characters', { owner: A })).status).toBe(405)
  })
})

describe('parseSheet (values from /data)', () => {
  it('fills defaults for a minimal sheet', () => {
    const s = parseSheet({ name: 'New hero' })
    expect(s).toMatchObject({ level: 1, armor: 'none', supplyDie: 'd8', rulesVersion: core.version, wounds: [], skills: {}, minerals: [] })
    expect(s.attributes).toEqual({ might: 0, grace: 0, wits: 0, lore: 0, spirit: 0, presence: 0 })
  })

  it.each([
    ['level out of range', { level: 11 }],
    ['attribute above max', { attributes: { lore: 6 } }],
    ['attribute below min', { attributes: { might: -2 } }],
    ['unknown skill', { skills: { Juggling: 1 } }],
    ['rank 4 before level 7', { level: 6, skills: { Arcana: 4 } }],
    ['unknown armor', { armor: 'mithril' }],
    ['unknown supply die', { supplyDie: 'd12' }],
    ['wound on a non-attribute', { wounds: ['Luck'] }],
    ['more than 4 wounds', { wounds: ['Might', 'Might', 'Might', 'Might', 'Might'] }],
    ['too many death fails', { deathFails: 4 }],
    ['negative grit', { grit: -1 }],
    ['shield not boolean', { shield: 'yes' }],
  ])('rejects %s', (_label, patch) => {
    expect(() => parseSheet({ ...kestrel, ...patch })).toThrow()
  })

  it('allows rank 4 from level 7', () => {
    expect(parseSheet({ ...kestrel, calling: 'Kilnheart', minerals: [' Slate '] }).minerals).toEqual(['Slate'])
    expect(() => parseSheet({ ...kestrel, minerals: [''] })).toThrow()
    expect(parseSheet({ ...kestrel, level: 7, skills: { Arcana: 4 } }).skills.Arcana).toBe(4)
  })
})
