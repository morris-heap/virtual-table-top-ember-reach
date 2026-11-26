import { MemoryPortraits } from './portraits-helper.ts'
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
    this.heroes.delete(`${user}/${id}`)
    const g = this.games.get(`${gm}/${id}`)
    if (g) g.memberIds = g.memberIds.filter(m => m !== user)
  }
  // The hero lives on the member's own pointer, so it is keyed the same way (VTTER-77).
  heroes = new Map<string, string>() // `${member}/${gameId}` -> heroId
  async heroesOf(gameId: string, memberIds: string[]) {
    const out: Record<string, string> = {}
    for (const m of memberIds) {
      const h = this.heroes.get(`${m}/${gameId}`)
      if (h) out[m] = h
    }
    return out
  }
  async setHero(user: string, gameId: string, heroId: string | null) {
    if (!this.pointers.has(`${user}/${gameId}`)) return
    if (heroId) this.heroes.set(`${user}/${gameId}`, heroId)
    else this.heroes.delete(`${user}/${gameId}`)
  }
}

/** Just enough hero store for VTTER-77: heroes keyed (owner, id), so one owner never sees another's. */
class MemoryHeroes implements CharacterStore {
  rows = new Map<string, { id: string; name: string; level: number; ancestry: string; calling: string }>()
  add(ownerId: string, id: string, name: string) {
    this.rows.set(`${ownerId}/${id}`, { id, name, level: 3, ancestry: 'Emberkin', calling: 'Hexer' })
  }
  async ping() {}
  async list() { return [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(ownerId: string, id: string) { return (this.rows.get(`${ownerId}/${id}`) ?? null) as any }
  async delete() { return false }
  async save(): Promise<never> { throw new Error('unused') }
}
const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any> }

async function world() {
  const profiles = new MemoryProfiles()
  const adventures = new MemoryAdventures()
  const games = new MemoryGames()
  const heroes = new MemoryHeroes()
  const call = (method: string, path: string, owner: string | null, body?: unknown): Promise<Reply> => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (owner) headers.Authorization = `Bearer token-${owner}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      { store: heroes, profiles, adventures, games, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken },
    ) as unknown as Promise<Reply>
  }
  const gm = await profiles.getOrCreate(GM)
  await profiles.update(GM, { gameMaster: true })
  const ana = await profiles.getOrCreate(ANA)
  const ben = await profiles.getOrCreate(BEN)
  return { profiles, adventures, games, heroes, call, ids: { gm: gm.playerId, ana: ana.playerId, ben: ben.playerId } }
}

const table = { name: 'Friday night', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'private' }

describe('parseGame', () => {
  it('accepts a built-in adventure and defaults to private, not solo', () => {
    expect(parseGame(table)).toEqual({ name: 'Friday night', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'private', solo: false, listed: false })
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
    expect(created.members).toEqual([{ playerId: ids.gm, displayName: GM, role: 'gm', hero: null, mine: true }])
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
    expect((await call('PUT', `/games/${G1}/other`, GM)).status).toBe(404)
    expect((await call('POST', '/games', GM)).status).toBe(405)
  })
})

// VTTER-77: each member brings one of their own heroes.
describe('a hero in a Game', () => {
  const HERO = '55555555-5555-4555-8555-555555555555'
  const OTHER = '66666666-6666-4666-8666-666666666666'

  it('a member picks their own hero, sees it on the roster, and can change or clear it', async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    heroes.add(ANA, OTHER, 'Korrin')
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)

    const picked = await (await call('PUT', `/games/${G1}/hero`, ANA, { heroId: HERO })).json()
    const anaRow = picked.members.find((m: { playerId: string }) => m.playerId === ids.ana)
    expect(anaRow.hero).toEqual({ id: HERO, name: 'Vashti', level: 3, ancestry: 'Emberkin', calling: 'Hexer' })
    expect(anaRow.mine).toBe(true)

    const changed = await (await call('PUT', `/games/${G1}/hero`, ANA, { heroId: OTHER })).json()
    expect(changed.members.find((m: { playerId: string }) => m.playerId === ids.ana).hero.name).toBe('Korrin')

    const cleared = await (await call('DELETE', `/games/${G1}/hero`, ANA)).json()
    expect(cleared.members.find((m: { playerId: string }) => m.playerId === ids.ana).hero).toBeNull()
  })

  it('the whole table sees a hero but only its owner is marked `mine`', async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    await call('PUT', `/games/${G1}/hero`, ANA, { heroId: HERO })

    const seen = await (await call('GET', `/games/${G1}`, GM)).json()
    const anaRow = seen.members.find((m: { playerId: string }) => m.playerId === ids.ana)
    expect(anaRow.hero.name).toBe('Vashti')
    expect(anaRow.mine).toBe(false)
    // The roster carries no owner or member ids. (The fake profiles use the Cognito id as a display
    // name, so checking for the raw id itself would always match.)
    expect(JSON.stringify(seen)).not.toContain('memberIds')
    expect(JSON.stringify(seen)).not.toContain('ownerId')
    expect(Object.keys(anaRow).sort()).toEqual(['displayName', 'hero', 'mine', 'playerId', 'role'])
  })

  it("refuses a hero that is not the caller's, and a Game the caller is not in", async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    // Ben is not in the Game at all.
    expect((await call('PUT', `/games/${G1}/hero`, BEN, { heroId: HERO })).status).toBe(404)
    // The GM is a member, but Ana's hero is not theirs to bring.
    expect((await call('PUT', `/games/${G1}/hero`, GM, { heroId: HERO })).status).toBe(404)
    expect((await call('PUT', `/games/${G1}/hero`, ANA, { heroId: 'not-a-uuid' })).status).toBe(400)
    expect((await call('PUT', `/games/${G1}/hero`, ANA, {})).status).toBe(400)
    expect((await call('GET', `/games/${G1}/hero`, ANA)).status).toBe(405)
  })

  it('leaving a Game takes the hero with it', async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    await call('PUT', `/games/${G1}/hero`, ANA, { heroId: HERO })
    await call('DELETE', `/games/${G1}/members/${ids.ana}`, ANA)

    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    const rejoined = await (await call('GET', `/games/${G1}`, GM)).json()
    expect(rejoined.members.find((m: { playerId: string }) => m.playerId === ids.ana).hero).toBeNull()
  })

  it('shows an empty slot when the chosen hero was deleted', async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    await call('PUT', `/games/${G1}`, GM, table)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, GM)
    await call('PUT', `/games/${G1}/hero`, ANA, { heroId: HERO })
    heroes.rows.delete(`${ANA}/${HERO}`)

    const seen = await (await call('GET', `/games/${G1}`, ANA)).json()
    expect(seen.members.find((m: { playerId: string }) => m.playerId === ids.ana).hero).toBeNull()
  })

  it('a solo Game can bring a hero', async () => {
    const { call, heroes, ids } = await world()
    heroes.add(ANA, HERO, 'Vashti')
    const solo = { ...table, solo: true }
    await call('PUT', `/games/${G2}`, ANA, solo)
    const picked = await (await call('PUT', `/games/${G2}/hero`, ANA, { heroId: HERO })).json()
    expect(picked.members.find((m: { playerId: string }) => m.playerId === ids.ana).hero.name).toBe('Vashti')
  })
})
