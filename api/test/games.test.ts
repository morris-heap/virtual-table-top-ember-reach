import { MemoryPortraits } from './portraits-helper.ts'
import { describe, expect, it } from 'vitest'
import type { AdventureDraft, AdventureRecord } from '../src/adventure.ts'
import gameData from '../../data/game.json'
import { nameKey, parseGame, type GameDraft, type GameRecord } from '../src/game.ts'
import { handle, NameTaken, type AdventureStore, type CharacterStore, type GameStore, type PresenceStore, type ProfileStore } from '../src/handler.ts'
import type { PresenceRecord } from '../src/presence.ts'
import type { ProfilePatch, ProfileRecord } from '../src/profile.ts'
import { findInMemory, searchAllowance } from './profile-search-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
// Limits come from /data, never hard-coded in a test either.
const gameLimits = gameData.limits
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
  async findByName(name: string, except: string, limit: number) { return findInMemory(this.rows, name, except, limit) }
  allowSearch = searchAllowance(3)
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
  /** Bumped per save so listPublic has a stable newest-first order, like `updatedAt` in DynamoDB. */
  private clock = 0
  async save(gm: string, id: string, d: GameDraft) {
    const old = this.games.get(`${gm}/${id}`)
    // Names are unique within one GM (ADR 0008), so mirror the store's conditional write.
    const clash = [...this.games.values()].find(g => g.ownerId === gm && g.id !== id && nameKey(g.name) === nameKey(d.name))
    if (clash) throw new NameTaken(d.name)
    const g = {
      ...d, id, ownerId: gm, memberIds: old?.memberIds ?? [gm],
      createdAt: old?.createdAt ?? 'x', updatedAt: `t${String(++this.clock).padStart(3, '0')}`,
    }
    this.games.set(`${gm}/${id}`, g)
    this.pointers.set(`${gm}/${id}`, gm)
    this.lookup.set(id, gm)
    return g
  }
  /** The sparse index, in memory: only listed public Games are in it at all. */
  async listPublic(cursor?: string, limit = 24) {
    const all = [...this.games.values()]
      .filter(g => g.listed && g.visibility === 'public')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const after = cursor ? Buffer.from(cursor, 'base64url').toString('utf8') : undefined
    const rows = after ? all.filter(g => g.updatedAt < after) : all
    const games = rows.slice(0, limit)
    const last = games.length === limit ? games[games.length - 1] : undefined
    return { games, cursor: last ? Buffer.from(last.updatedAt).toString('base64url') : null }
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

/** Presence in memory, keyed by Cognito id like the real item (VTTER-73). */
class MemoryPresence implements PresenceStore {
  seen: Record<string, PresenceRecord> = {}
  async beat(userId: string, gameId: string | null, nowMs: number) { this.seen[userId] = { gameId: gameId ?? '', seenAt: nowMs } }
  async presenceOf(userIds: string[]) {
    return Object.fromEntries(userIds.filter(id => this.seen[id]).map(id => [id, this.seen[id]]))
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
  const presence = new MemoryPresence()
  const call = (method: string, path: string, owner: string | null, body?: unknown): Promise<Reply> => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (owner) headers.Authorization = `Bearer token-${owner}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      { store: heroes, profiles, adventures, games, friends: {} as never, chat: {} as never, maps: {} as never, presence, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken },
    ) as unknown as Promise<Reply>
  }
  const gm = await profiles.getOrCreate(GM)
  await profiles.update(GM, { gameMaster: true })
  const ana = await profiles.getOrCreate(ANA)
  const ben = await profiles.getOrCreate(BEN)
  return { profiles, adventures, games, heroes, presence, call, ids: { gm: gm.playerId, ana: ana.playerId, ben: ben.playerId } }
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
    expect(created.members).toEqual([{ playerId: ids.gm, displayName: GM, role: 'gm', hero: null, mine: true, online: false }])
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
    expect(Object.keys(anaRow).sort()).toEqual(['displayName', 'hero', 'mine', 'online', 'playerId', 'role'])
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

describe('browsing public Games (VTTER-76)', () => {
  const listed = { name: 'Open table', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'public', listed: true }
  const G3 = '33333333-3333-4333-8333-333333333333'

  it('lists only Games that are public AND listed, and never a private one', async () => {
    const { call, games } = await world()
    await call('PUT', `/games/${G1}`, GM, listed)
    await call('PUT', `/games/${G2}`, GM, { ...listed, name: 'Hidden table', listed: false })
    await call('PUT', `/games/${G3}`, GM, { ...listed, name: 'Private table', visibility: 'private' })

    const body = await (await call('GET', '/games/public', ANA)).json()
    expect(body.games.map((g: { name: string }) => g.name)).toEqual(['Open table'])
    // A private Game is absent from the index, not merely filtered out on read.
    expect(await games.listPublic().then(p => p.games.map(g => g.name))).toEqual(['Open table'])
  })

  it('never leaks a Cognito id, and shows the GM by player ID and display name', async () => {
    const { call, profiles, ids } = await world()
    // MemoryProfiles defaults displayName to the Cognito id, so set a real one: otherwise the
    // "no sub in the body" check below would trip on the fixture rather than on a real leak.
    await profiles.update(GM, { displayName: 'Rook' })
    await call('PUT', `/games/${G1}`, GM, listed)
    const body = await (await call('GET', '/games/public', ANA)).json()
    const [row] = body.games
    expect(row.gm).toEqual({ playerId: ids.gm, displayName: 'Rook' })
    // The GM's Cognito sub must not appear anywhere in the response, under any key.
    expect(JSON.stringify(body)).not.toContain(GM)
    expect(row).not.toHaveProperty('ownerId')
    expect(row).not.toHaveProperty('memberIds')
    expect(Object.keys(row).sort()).toEqual(
      ['adventure', 'full', 'gm', 'heroCount', 'id', 'joined', 'memberCount', 'name', 'updatedAt'],
    )
  })

  it('never leaks a Cognito id on any browse row, including later pages', async () => {
    // The field-by-field build in browseRow is the only thing keeping `ownerId` out of these rows,
    // and `ownerId` on a gsi1 row is the GM's Cognito sub. One spread would leak every GM at once,
    // so assert it over a multi-row, paginated response rather than a single row.
    const { call, profiles } = await world()
    await profiles.update(GM, { displayName: 'Rook' })
    await profiles.update(ANA, { displayName: 'Vale' })
    await call('PUT', `/games/${G1}`, GM, listed)
    await call('PUT', `/games/${G2}`, GM, { ...listed, name: 'Second table' })
    // A second GM, so the check covers more than one sub.
    await profiles.update(ANA, { gameMaster: true })
    await call('PUT', `/games/${G3}`, ANA, { ...listed, name: 'Third table' })

    const seen: Record<string, unknown>[] = []
    let cursor: string | null = null
    do {
      const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      const body = await (await call('GET', `/games/public?limit=1${query}`, BEN)).json()
      seen.push(...(body.games as Record<string, unknown>[]))
      cursor = body.cursor as string | null
    } while (cursor)

    expect(seen).toHaveLength(3)
    const text = JSON.stringify(seen)
    for (const sub of [GM, ANA, BEN]) expect(text).not.toContain(sub)
    for (const row of seen) {
      expect(row).not.toHaveProperty('ownerId')
      expect(row).not.toHaveProperty('memberIds')
    }
  })

  it('keeps the storage-only index keys out of every Game response', async () => {
    // gsi1pk/gsi1sk are how a Game reaches the browse index. They are storage keys: toGame strips them
    // and derives `listed`, so no route should ever echo them back.
    const { call, ids, profiles } = await world()
    // MemoryProfiles defaults displayName to the Cognito id, so give everyone a real one: otherwise
    // the "no sub in the body" check trips on the fixture rather than on a leak.
    await profiles.update(GM, { displayName: 'Rook' })
    await profiles.update(ANA, { displayName: 'Vale' })
    await call('PUT', `/games/${G1}`, GM, listed)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, ANA)

    const bodies = await Promise.all([
      call('GET', '/games/public', ANA),
      call('GET', `/games/${G1}`, ANA),
      call('GET', '/games', ANA),
    ].map(async p => await (await p).text()))

    for (const body of bodies) {
      expect(body).not.toContain('gsi1pk')
      expect(body).not.toContain('gsi1sk')
      // The GM's sub must not ride along on any of these either.
      expect(body).not.toContain(GM)
    }
  })

  it('reports member and hero counts, fullness, and whether the caller already joined', async () => {
    const { call, heroes, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, listed)
    await call('PUT', `/games/${G1}/members/${ids.ana}`, ANA)
    const HERO = '55555555-5555-4555-8555-555555555555'
    heroes.add(ANA, HERO, 'Vashti')
    await call('PUT', `/games/${G1}/hero`, ANA, { heroId: HERO })

    const asAna = (await (await call('GET', '/games/public', ANA)).json()).games[0]
    expect(asAna).toMatchObject({ memberCount: 2, heroCount: 1, joined: true, full: false })
    // Ben is not in it, so he sees joined: false and the UI offers Join.
    const asBen = (await (await call('GET', '/games/public', BEN)).json()).games[0]
    expect(asBen.joined).toBe(false)

  })

  it('flags a Game as full at the data/game.json member limit', async () => {
    const { call, games } = await world()
    await call('PUT', `/games/${G1}`, GM, listed)
    expect((await (await call('GET', '/games/public', BEN)).json()).games[0].full).toBe(false)
    // `full` is derived from data/game.json `maxMembers`, never hard-coded, so fill it to that.
    const game = games.games.get(`${GM}/${G1}`)!
    game.memberIds = Array.from({ length: gameLimits.maxMembers }, (_, i) => `filler-${i}`)
    const row = (await (await call('GET', '/games/public', BEN)).json()).games[0]
    expect(row).toMatchObject({ full: true, memberCount: gameLimits.maxMembers, joined: false })
  })

  it('pages newest first and the cursor carries no owner id', async () => {
    const { call } = await world()
    for (const [i, id] of [G1, G2, G3].entries()) await call('PUT', `/games/${id}`, GM, { ...listed, name: `Table ${i}` })

    const first = await (await call('GET', '/games/public?limit=2', ANA)).json()
    expect(first.games.map((g: { name: string }) => g.name)).toEqual(['Table 2', 'Table 1'])
    expect(first.cursor).toBeTruthy()
    // The cursor is the index sort key only: a GSI LastEvaluatedKey would have carried ownerId.
    expect(Buffer.from(first.cursor, 'base64url').toString('utf8')).not.toContain(GM)

    const second = await (await call('GET', `/games/public?limit=2&cursor=${encodeURIComponent(first.cursor)}`, ANA)).json()
    expect(second.games.map((g: { name: string }) => g.name)).toEqual(['Table 0'])
    // A short page is the end of the list, so no cursor is offered.
    expect(second.cursor).toBeNull()
  })

  it('needs a token, rejects a write, and survives a junk cursor or limit', async () => {
    const { call } = await world()
    await call('PUT', `/games/${G1}`, GM, listed)
    expect((await call('GET', '/games/public', null)).status).toBe(401)
    expect((await call('POST', '/games/public', ANA)).status).toBe(405)
    // A hand-made cursor or limit must not 500: it falls back to the top of the list.
    expect((await call('GET', '/games/public?cursor=!!!notbase64!!!', ANA)).status).toBe(200)
    expect((await call('GET', '/games/public?limit=abc', ANA)).status).toBe(200)
  })

  it('joins a listed Game from the browse list without an invitation', async () => {
    const { call, ids } = await world()
    await call('PUT', `/games/${G1}`, GM, listed)
    expect((await call('PUT', `/games/${G1}/members/${ids.ben}`, BEN)).status).toBe(200)
    expect((await (await call('GET', '/games/public', BEN)).json()).games[0].joined).toBe(true)
  })

  it('does not let a browser join an unlisted or private Game they have no link to', async () => {
    const { call, ids } = await world()
    // Unlisted but public: joinable by link (that is what public means), just not advertised.
    await call('PUT', `/games/${G2}`, GM, { ...listed, name: 'Hidden table', listed: false })
    expect((await (await call('GET', '/games/public', BEN)).json()).games).toEqual([])
    expect((await call('PUT', `/games/${G2}/members/${ids.ben}`, BEN)).status).toBe(200)
    // Private stays closed to anyone the GM has not invited.
    await call('PUT', `/games/${G3}`, GM, { ...listed, name: 'Private table', visibility: 'private' })
    expect((await call('PUT', `/games/${G3}/members/${ids.ben}`, BEN)).status).toBe(404)
  })
})

describe('unique Game names per GM (VTTER-76)', () => {
  const t = { name: 'Friday Night', adventure: { source: 'builtin', id: 'soot-kings-hearth' }, visibility: 'private' }

  it('rejects a second Game with the same name from one GM, case- and space-insensitively', async () => {
    const { call } = await world()
    expect((await call('PUT', `/games/${G1}`, GM, t)).status).toBe(200)
    const clash = await call('PUT', `/games/${G2}`, GM, { ...t, name: 'friday  night' })
    expect(clash.status).toBe(409)
    expect((await clash.json()).error).toMatch(/already have a Game called/)
  })

  it('lets a different GM use the same name, and lets a Game keep its own name on re-save', async () => {
    const { call, profiles } = await world()
    await profiles.update(ANA, { gameMaster: true })
    await call('PUT', `/games/${G1}`, GM, t)
    // Unique per GM, not globally: two tables may both be "Friday Night" (a Game can run for years).
    expect((await call('PUT', `/games/${G2}`, ANA, t)).status).toBe(200)
    // Re-saving the same Game keeps its own reservation rather than colliding with itself.
    expect((await call('PUT', `/games/${G1}`, GM, { ...t, visibility: 'public' })).status).toBe(200)
  })

  it('frees the name once the Game is deleted', async () => {
    const { call } = await world()
    await call('PUT', `/games/${G1}`, GM, t)
    await call('DELETE', `/games/${G1}`, GM)
    expect((await call('PUT', `/games/${G2}`, GM, t)).status).toBe(200)
  })

  it('keeps punctuation significant and rejects a whitespace-only name', async () => {
    const { call } = await world()
    await call('PUT', `/games/${G1}`, GM, { ...t, name: 'Ash & Ember' })
    // Punctuation is kept, so these are different names.
    expect((await call('PUT', `/games/${G2}`, GM, { ...t, name: 'Ash and Ember' })).status).toBe(200)
    expect(nameKey('  Friday   Night  ')).toBe('friday night')
    expect((await call('PUT', '/games/33333333-3333-4333-8333-333333333333', GM, { ...t, name: '   ' })).status).toBe(400)
  })
})
