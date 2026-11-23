import { describe, expect, it } from 'vitest'
import type { AdventureDraft, AdventureRecord } from '../src/adventure.ts'
import { parseGame, type GameDraft, type GameRecord } from '../src/game.ts'
import { handle, type AdventureStore, type CharacterStore, type GameStore, type ProfileStore } from '../src/handler.ts'
import type { ProfilePatch, ProfileRecord } from '../src/profile.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
const GM = 'aaaa'
const ANA = 'bbbb'
const BEN = 'cccc'
const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'
const ADV = '44444444-4444-4444-8444-444444444444'

class MemoryProfiles implements ProfileStore {
  rows = new Map<string, ProfileRecord>()
  private n = 0
  async getOrCreate(ownerId: string) {
    let r = this.rows.get(ownerId)
    if (!r) {
      const now = new Date().toISOString()
      r = { displayName: ownerId, gameMaster: false, playerId: `EMBER-${String(++this.n).padStart(5, '2')}`, createdAt: now, updatedAt: now }
      this.rows.set(ownerId, r)
    }
    return r
  }
  async update(ownerId: string, patch: ProfilePatch) {
    const r = { ...(await this.getOrCreate(ownerId)), ...patch }
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

class MemoryAdventures implements AdventureStore {
  rows = new Map<string, AdventureRecord>()
  async list() { return [] }
  async get(ownerId: string, id: string) { return this.rows.get(`${ownerId}/${id}`) ?? null }
  async save(ownerId: string, id: string, d: AdventureDraft) {
    const r = { ...d, id, ownerId, createdAt: 'x', updatedAt: 'x' }
    this.rows.set(`${ownerId}/${id}`, r)
    return r
  }
  async delete() { return false }
}

/** Mirrors the DynamoDB layout: games under the GM, pointers from members, a lookup by game id. */
class MemoryGames implements GameStore {
  games = new Map<string, GameRecord>() // `${gm}/${id}`
  pointers = new Map<string, string>() // `${member}/${id}` -> gm
  lookup = new Map<string, string>() // id -> gm
  max = 20
  async getByGm(gm: string, id: string) { return this.games.get(`${gm}/${id}`) ?? null }
  async getForMember(user: string, id: string) {
    const gm = this.pointers.get(`${user}/${id}`)
    return gm ? this.getByGm(gm, id) : null
  }
  async listFor(user: string) {
    return [...this.pointers].filter(([k]) => k.startsWith(`${user}/`)).map(([k, gm]) => this.games.get(`${gm}/${k.split('/')[1]}`)!)
  }
  async countOwned(gm: string) { return [...this.games.values()].filter(g => g.ownerId === gm).length }
  async countJoined(user: string) { return (await this.listFor(user)).length }
  async save(gm: string, id: string, d: GameDraft) {
    const old = this.games.get(`${gm}/${id}`)
    const g = { ...d, id, ownerId: gm, memberIds: old?.memberIds ?? [gm], createdAt: 'x', updatedAt: 'x' }
    this.games.set(`${gm}/${id}`, g)
    this.pointers.set(`${gm}/${id}`, gm)
    this.lookup.set(id, gm)
    return g
  }
  async delete(gm: string, id: string) {
    const g = this.games.get(`${gm}/${id}`)
    if (!g) return false
    this.games.delete(`${gm}/${id}`)
    for (const m of g.memberIds) this.pointers.delete(`${m}/${id}`)
    this.lookup.delete(id)
    return true
  }
  async gmOf(id: string) { return this.lookup.get(id) ?? null }
  async addMember(gm: string, id: string, user: string) {
    const g = this.games.get(`${gm}/${id}`)
    if (!g || (!g.memberIds.includes(user) && g.memberIds.length >= this.max)) return null
    if (!g.memberIds.includes(user)) g.memberIds.push(user)
    this.pointers.set(`${user}/${id}`, gm)
    return g
  }
  async removeMember(gm: string, id: string, user: string) {
    this.pointers.delete(`${user}/${id}`)
    const g = this.games.get(`${gm}/${id}`)
    if (g) g.memberIds = g.memberIds.filter(m => m !== user)
  }
}

const noHeroes: CharacterStore = {
  ping: async () => {}, list: async () => [], get: async () => null, delete: async () => false,
  save: async () => { throw new Error('unused') },
}
const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any> }

async function world() {
  const profiles = new MemoryProfiles()
  const adventures = new MemoryAdventures()
  const games = new MemoryGames()
  const call = (method: string, path: string, owner: string | null, body?: unknown): Promise<Reply> => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (owner) headers.Authorization = `Bearer token-${owner}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      { store: noHeroes, profiles, adventures, games, allowedOrigins: [ORIGIN], verifyToken },
    ) as unknown as Promise<Reply>
  }
  const gm = await profiles.getOrCreate(GM)
  await profiles.update(GM, { gameMaster: true })
  const ana = await profiles.getOrCreate(ANA)
  const ben = await profiles.getOrCreate(BEN)
  return { profiles, adventures, games, call, ids: { gm: gm.playerId, ana: ana.playerId, ben: ben.playerId } }
}

const table = { name: 'Friday night', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'private' }

describe('parseGame', () => {
  it('accepts a built-in adventure and defaults to private, not solo', () => {
    expect(parseGame(table)).toEqual({ name: 'Friday night', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'private', solo: false })
  })
  it('rejects an unknown built-in, a bad own id, a public solo and a solo on an own adventure', () => {
    expect(() => parseGame({ ...table, adventure: { source: 'builtin', id: 'nope' } })).toThrow(/not a built-in/)
    expect(() => parseGame({ ...table, adventure: { source: 'own', id: 'nope' } })).toThrow(/UUID/)
    expect(() => parseGame({ ...table, solo: true, visibility: 'public' })).toThrow(/private/)
    expect(() => parseGame({ ...table, solo: true, adventure: { source: 'own', id: ADV } })).toThrow(/built-in/)
    expect(() => parseGame({ ...table, name: '' })).toThrow()
    expect(() => parseGame({ ...table, visibility: 'friends' })).toThrow()
  })
})

describe('Games: creating', () => {
  it('requires sign-in', async () => {
    const { call } = await world()
    expect((await call('GET', '/games', null)).status).toBe(401)
  })

  it('needs Game Master for a table, but not for a solo Game', async () => {
    const { call } = await world()
    const denied = await call('PUT', `/games/${G1}`, ANA, table)
    expect(denied.status).toBe(403)
    const solo = await call('PUT', `/games/${G1}`, ANA, { ...table, name: 'Alone', solo: true })
    expect(solo.status).toBe(200)
    expect((await solo.json()).role).toBe('gm')
  })

  it("rejects an own adventure that isn't the GM's", async () => {
    const { call, adventures } = await world()
    expect((await call('PUT', `/games/${G1}`, GM, { ...table, adventure: { source: 'own', id: ADV } })).status).toBe(400)
    await adventures.save(ANA, ADV, { title: 'x' } as AdventureDraft)
    expect((await call('PUT', `/games/${G1}`, GM, { ...table, adventure: { source: 'own', id: ADV } })).status).toBe(400)
    await adventures.save(GM, ADV, { title: 'Mine' } as AdventureDraft)
    const ok = await call('PUT', `/games/${G1}`, GM, { ...table, adventure: { source: 'own', id: ADV } })
    expect(ok.status).toBe(200)
    expect((await ok.json()).adventureContent.title).toBe('Mine')
  })

  it('lists a Game for its GM with the GM as the first member, and never leaks Cognito ids', async () => {
    const { call, ids } = await world()
    const created = await (await call('PUT', `/games/${G1}`, GM, table)).json()
    expect(created.members).toEqual([{ playerId: ids.gm, displayName: GM, role: 'gm' }])
    expect(JSON.stringify(created)).not.toContain('memberIds')
    expect(JSON.stringify(created)).not.toContain('ownerId')
    const list = await (await call('GET', '/games', GM)).json()
    expect(list.games).toHaveLength(1)
    expect(list.games[0]).toMatchObject({ id: G1, role: 'gm', memberCount: 1 })
  })

  it("won't take over another GM's Game id", async () => {
    const { call, profiles } = await world()
    await profiles.update(ANA, { gameMaster: true })
    await call('PUT', `/games/${G1}`, GM, table)
    expect((await call('PUT', `/games/${G1}`, ANA, table)).status).toBe(409)
  })

  it('only the GM can change or delete it', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    expect((await call('PUT', `/games/${G1}`, ANA, { ...table, name: 'Mine now' })).status).toBe(403)
    expect((await call('DELETE', `/games/${G1}`, ANA)).status).toBe(403)
    expect((await call('DELETE', `/games/${G1}`, GM)).status).toBe(204)
    expect((await call('GET', `/games/${G1}`, ANA)).status).toBe(404)
  })

  it('refuses a solo Game once other players are in', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    expect((await call('PUT', `/games/${G1}`, GM, { ...table, solo: true })).status).toBe(400)
  })
})

describe('Games: members', () => {
  it('the GM invites by player ID, and the player then sees it', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    expect((await call('GET', `/games/${G1}`, ANA)).status).toBe(404)
    const joined = await call('PUT', `/games/${G1}/members/${ids.ana.toLowerCase()}`, GM)
    expect(joined.status).toBe(200)
    expect((await joined.json()).members.map((m: { playerId: string }) => m.playerId)).toEqual([ids.gm, ids.ana])
    const seen = await call('GET', `/games/${G1}`, ANA)
    expect(seen.status).toBe(200)
    expect((await seen.json()).role).toBe('player')
    expect((await (await call('GET', '/games', ANA)).json()).games).toHaveLength(1)
  })

  it('a non-member cannot read, and a player cannot invite', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    expect((await call('GET', `/games/${G1}`, BEN)).status).toBe(404)
    expect((await call('PUT', `/games/${G1}/members/${ids.ben}`, ANA)).status).toBe(403)
    expect((await call('PUT', `/games/${G1}/members/${ids.ben}`, BEN)).status).toBe(404) // private: no self-join
  })

  it('anyone with the link can join a public Game, as themselves only', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, { ...table, visibility: 'public' })
    expect((await call('PUT', `/games/${G1}/members/${ids.ana}`, ANA)).status).toBe(200)
    expect((await call('GET', `/games/${G1}`, ANA)).status).toBe(200)
    // Joining someone else is still the GM's call.
    expect((await call('PUT', `/games/${G1}/members/${ids.ben}`, ANA)).status).toBe(403)
  })

  it('rejects unknown and malformed player IDs, and a solo Game takes no one', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    expect((await call('PUT', `/games/${G1}/members/nope`, GM)).status).toBe(400)
    expect((await call('PUT', `/games/${G1}/members/EMBER-ZZZZZ`, GM)).status).toBe(404)
    await call('PUT', `/games/${G2}`, ANA, { ...table, solo: true })
    expect((await call('PUT', `/games/${G2}/members/${ids.ben}`, ANA)).status).toBe(400)
  })

  it('stops at the member limit', async () => {
    const { call, games, ids } = await world()
    games.max = 2
    await call('PUT', `/games/${G1}`, GM, { ...table, visibility: 'public' })
    expect((await call('PUT', `/games/${G1}/members/${ids.ana}`, ANA)).status).toBe(200)
    expect((await call('PUT', `/games/${G1}/members/${ids.ben}`, BEN)).status).toBe(409)
    // Someone already in is not turned away.
    expect((await call('PUT', `/games/${G1}/members/${ids.ana}`, ANA)).status).toBe(200)
  })

  it('a player can leave, the GM can remove a player, and the GM cannot leave', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    await call('PUT', `/games/${G1}/members/${ids.ben}`, GM)
    expect((await call('DELETE', `/games/${G1}/members/${ids.ben}`, ANA)).status).toBe(403)
    expect((await call('DELETE', `/games/${G1}/members/${ids.ana}`, ANA)).status).toBe(204)
    expect((await call('GET', `/games/${G1}`, ANA)).status).toBe(404)
    expect((await call('DELETE', `/games/${G1}/members/${ids.ben}`, GM)).status).toBe(204)
    expect((await call('DELETE', `/games/${G1}/members/${ids.gm}`, GM)).status).toBe(400)
    expect((await call('DELETE', `/games/${G1}/members/${ids.ana}`, GM)).status).toBe(404)
  })

  it('rejects bad paths', async () => {
    const { call } = await world()
    expect((await call('GET', '/games/not-a-uuid', GM)).status).toBe(400)
    expect((await call('GET', `/games/${G1}/members`, GM)).status).toBe(404)
    expect((await call('PUT', `/games/${G1}/other/x`, GM)).status).toBe(404)
    expect((await call('POST', '/games', GM)).status).toBe(405)
  })
})
