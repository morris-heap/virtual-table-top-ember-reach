import { MemoryPortraits } from './portraits-helper.ts'
import { describe, expect, it } from 'vitest'
import { parseAdventure, type AdventureDraft, type AdventureRecord } from '../src/adventure.ts'
import { handle, type AdventureStore, type CharacterStore, type GameStore, type ProfileStore } from '../src/handler.ts'
import { isPlayerId, newPlayerId, parseProfilePatch, type ProfilePatch, type ProfileRecord } from '../src/profile.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const ADV = '44444444-4444-4444-8444-444444444444'

class MemoryProfiles implements ProfileStore {
  rows = new Map<string, ProfileRecord>()
  private n = 0
  async getOrCreate(ownerId: string) {
    let r = this.rows.get(ownerId)
    if (!r) {
      const now = new Date().toISOString()
      r = { displayName: '', gameMaster: false, playerId: `EMBER-${String(++this.n).padStart(5, '2')}`, createdAt: now, updatedAt: now }
      this.rows.set(ownerId, r)
    }
    return r
  }
  async update(ownerId: string, patch: ProfilePatch) {
    const r = { ...(await this.getOrCreate(ownerId)), ...patch, updatedAt: new Date().toISOString() }
    this.rows.set(ownerId, r)
    return r
  }
  async peek(ownerId: string) {
    return this.rows.get(ownerId) ?? null
  }
  async ownerOfPlayer(playerId: string) {
    return [...this.rows].find(([, r]) => r.playerId === playerId)?.[0] ?? null
  }
}

// The Games routes have their own tests (games.test.ts); these tests never reach them.
const noGames: GameStore = {
  getForMember: async () => null, listFor: async () => [], countOwned: async () => 0, countJoined: async () => 0,
  save: async () => { throw new Error('unused') }, delete: async () => false, gmOf: async () => null, getByGm: async () => null,
  addMember: async () => null, removeMember: async () => {},
  heroesOf: async () => ({}), setHero: async () => {},
}

class MemoryAdventures implements AdventureStore {
  rows = new Map<string, AdventureRecord>()
  private key = (o: string, id: string) => `${o}/${id}`
  async list(ownerId: string) {
    return [...this.rows.values()].filter(r => r.ownerId === ownerId)
      .map(({ id, title, summary, levelMin, levelMax, visibility, updatedAt }) => ({ id, title, summary, levelMin, levelMax, visibility, updatedAt }))
  }
  async get(ownerId: string, id: string) {
    return this.rows.get(this.key(ownerId, id)) ?? null
  }
  async save(ownerId: string, id: string, draft: AdventureDraft) {
    const now = new Date().toISOString()
    const r = { ...draft, id, ownerId, createdAt: this.rows.get(this.key(ownerId, id))?.createdAt ?? now, updatedAt: now }
    this.rows.set(this.key(ownerId, id), r)
    return r
  }
  async delete(ownerId: string, id: string) {
    return this.rows.delete(this.key(ownerId, id))
  }
}

const noHeroes: CharacterStore = {
  ping: async () => {}, list: async () => [], get: async () => null, delete: async () => false,
  save: async () => { throw new Error('unused') },
}
const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)

// A Response whose body is read as untyped JSON, like the `body()` helper in handler.test.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any> }

function world() {
  const profiles = new MemoryProfiles()
  const adventures = new MemoryAdventures()
  const call = (method: string, path: string, opts: { owner?: string; body?: unknown } = {}): Promise<Reply> => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (opts.owner) headers.Authorization = `Bearer token-${opts.owner}`
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
      { store: noHeroes, profiles, adventures, games: noGames, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken },
    ) as unknown as Promise<Reply>
  }
  return { profiles, adventures, call }
}

const hearth = {
  title: 'The Cold Hearth',
  summary: 'A village loses its ember.',
  levelMin: 1,
  levelMax: 2,
  scenes: [
    { id: 'village', title: 'The village', type: 'social', text: 'Talk to the elder.', foes: [] },
    { id: 'vent', title: 'The vent', type: 'exploration', text: 'Climb down.', foes: ['2 Ash Rat swarms'] },
  ],
  hooks: ['A letter signed by the Ashen Choir.'],
}

describe('profile', () => {
  it('requires sign-in', async () => {
    const { call } = world()
    expect((await call('GET', '/profile')).status).toBe(401)
    expect((await call('PUT', '/profile', { body: { gameMaster: true } })).status).toBe(401)
  })

  it('creates a profile with a stable player ID on first read', async () => {
    const { call } = world()
    const first = await (await call('GET', '/profile', { owner: A })).json()
    expect(first).toMatchObject({ displayName: '', gameMaster: false })
    expect(first.playerId).toMatch(/^EMBER-/)
    expect(await (await call('GET', '/profile', { owner: A })).json()).toEqual(first)
    expect((await (await call('GET', '/profile', { owner: B })).json()).playerId).not.toBe(first.playerId)
  })

  it('sets the display name and Game Master flag, and never changes the player ID', async () => {
    const { call } = world()
    const before = await (await call('GET', '/profile', { owner: A })).json()
    const put = await call('PUT', '/profile', { owner: A, body: { displayName: ' Heath ', gameMaster: true, playerId: 'EMBER-HACKS' } })
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ displayName: 'Heath', gameMaster: true, playerId: before.playerId })
    // Only the caller's own profile changed.
    expect((await (await call('GET', '/profile', { owner: B })).json()).gameMaster).toBe(false)
  })

  it('creates the profile when the first request is a PUT', async () => {
    const { call, profiles } = world()
    expect((await call('PUT', '/profile', { owner: A, body: { gameMaster: true } })).status).toBe(200)
    expect(profiles.rows.get(A)?.playerId).toMatch(/^EMBER-/)
  })

  it('rejects bad bodies, bad methods and sub-paths', async () => {
    const { call } = world()
    expect((await call('PUT', '/profile', { owner: A, body: {} })).status).toBe(400)
    expect((await call('PUT', '/profile', { owner: A, body: { gameMaster: 'yes' } })).status).toBe(400)
    expect((await call('PUT', '/profile', { owner: A, body: { displayName: 'x'.repeat(41) } })).status).toBe(400)
    expect((await call('DELETE', '/profile', { owner: A })).status).toBe(405)
    expect((await call('GET', '/profile/extra', { owner: A })).status).toBe(404)
  })
})

describe('player IDs', () => {
  it('look like EMBER-XXXXX from an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const id = newPlayerId()
      expect(isPlayerId(id)).toBe(true)
      expect(id.slice('EMBER-'.length)).not.toMatch(/[01OIL]/) // no look-alikes after the prefix
    }
    expect(newPlayerId(() => 0)).toBe('EMBER-AAAAA')
  })
  it('rejects look-alike characters', () => {
    expect(isPlayerId('EMBER-0O1IL')).toBe(false)
    expect(isPlayerId('EMBER-ABCD')).toBe(false)
  })
  it('parseProfilePatch needs at least one field', () => {
    expect(() => parseProfilePatch({})).toThrow()
    expect(parseProfilePatch({ gameMaster: false })).toEqual({ gameMaster: false })
  })
})

describe('adventures', () => {
  it('requires sign-in', async () => {
    const { call } = world()
    expect((await call('GET', '/adventures')).status).toBe(401)
    expect((await call('PUT', `/adventures/${ADV}`, { body: hearth })).status).toBe(401)
  })

  it('lets anyone create, read, list, update and delete their own adventure, private by default', async () => {
    const { call } = world() // owner A is not a Game Master
    const put = await call('PUT', `/adventures/${ADV}`, { owner: A, body: hearth })
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ id: ADV, ownerId: A, title: 'The Cold Hearth', visibility: 'private' })

    expect((await (await call('GET', `/adventures/${ADV}`, { owner: A })).json()).scenes).toHaveLength(2)
    expect((await (await call('GET', '/adventures', { owner: A })).json()).adventures).toEqual([
      expect.objectContaining({ id: ADV, title: 'The Cold Hearth', visibility: 'private', levelMax: 2 }),
    ])

    await call('PUT', `/adventures/${ADV}`, { owner: A, body: { ...hearth, title: 'Renamed' } })
    expect((await (await call('GET', `/adventures/${ADV}`, { owner: A })).json()).title).toBe('Renamed')

    expect((await call('DELETE', `/adventures/${ADV}`, { owner: A })).status).toBe(204)
    expect((await call('GET', `/adventures/${ADV}`, { owner: A })).status).toBe(404)
  })

  it("keeps adventures private: B can't read, list, overwrite or delete A's", async () => {
    const { call } = world()
    await call('PUT', `/adventures/${ADV}`, { owner: A, body: hearth })
    expect((await call('GET', `/adventures/${ADV}`, { owner: B })).status).toBe(404)
    expect((await call('DELETE', `/adventures/${ADV}`, { owner: B })).status).toBe(404)
    expect((await (await call('GET', '/adventures', { owner: B })).json()).adventures).toHaveLength(0)
    await call('PUT', `/adventures/${ADV}`, { owner: B, body: { ...hearth, title: 'Copy' } })
    expect((await (await call('GET', `/adventures/${ADV}`, { owner: A })).json()).title).toBe('The Cold Hearth')
  })

  it('rejects bad ids, unknown routes and bad methods', async () => {
    const { call } = world()
    expect((await call('GET', '/adventures/123', { owner: A })).status).toBe(400)
    expect((await call('POST', '/adventures', { owner: A })).status).toBe(405)
    expect((await call('GET', `/adventures/${ADV}/scenes`, { owner: A })).status).toBe(404)
  })

  it('rejects sharing until it exists: only private is accepted', async () => {
    const { call } = world()
    for (const visibility of ['friends', 'public']) {
      expect((await call('PUT', `/adventures/${ADV}`, { owner: A, body: { ...hearth, visibility } })).status).toBe(400)
    }
    expect((await call('PUT', `/adventures/${ADV}`, { owner: A, body: { ...hearth, visibility: 'secret' } })).status).toBe(400)
  })
})

describe('parseAdventure (values from /data)', () => {
  it('fills defaults for a minimal adventure', () => {
    expect(parseAdventure({ title: 'Tiny' })).toEqual({
      title: 'Tiny', summary: '', levelMin: 1, levelMax: 10, visibility: 'private', scenes: [], hooks: [],
    })
  })

  const scene = hearth.scenes[0]
  it.each([
    ['no title', { title: '' }],
    ['level below 1', { levelMin: 0 }],
    ['level above 10', { levelMax: 11 }],
    ['min above max', { levelMin: 5, levelMax: 2 }],
    ['unknown scene type', { scenes: [{ ...scene, type: 'shopping' }] }],
    ['scene without a title', { scenes: [{ ...scene, title: '' }] }],
    ['bad scene id', { scenes: [{ ...scene, id: 'Not Valid' }] }],
    ['duplicate scene ids', { scenes: [scene, { ...scene, title: 'Again' }] }],
    ['too many scenes', { scenes: Array.from({ length: 51 }, (_, i) => ({ ...scene, id: `s${i}` })) }],
    ['scenes not a list', { scenes: 'one' }],
    ['foe not a string', { scenes: [{ ...scene, foes: [3] }] }],
    ['too many hooks', { hooks: Array.from({ length: 21 }, () => 'x') }],
    ['empty hook', { hooks: [''] }],
  ])('rejects %s', (_label, patch) => {
    expect(() => parseAdventure({ ...hearth, ...patch })).toThrow()
  })

  it('trims text and keeps scene order', () => {
    const a = parseAdventure({ ...hearth, title: '  Padded  ' })
    expect(a.title).toBe('Padded')
    expect(a.scenes.map(s => s.id)).toEqual(['village', 'vent'])
  })
})
