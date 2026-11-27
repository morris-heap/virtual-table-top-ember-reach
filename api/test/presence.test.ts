import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameData from '../../data/game.json'
import type { FriendEdge, FriendIdentity } from '../src/friend.ts'
import type { GameRecord } from '../src/game.ts'
import { handle, type FriendStore, type GameStore, type PresenceStore, type ProfileStore } from '../src/handler.ts'
import { onlineIds, PRESENCE, type PresenceRecord } from '../src/presence.ts'
import type { ProfileRecord } from '../src/profile.ts'
import { MemoryPortraits } from './portraits-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
// Cognito ids: these must never appear in any response body.
const ANA = 'sub-ana-0001'
const BEN = 'sub-ben-0002'
const CAL = 'sub-cal-0003'
const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-26T12:00:00.000Z')
const window = PRESENCE.onlineSeconds * 1000

class MemoryProfiles {
  rows = new Map<string, ProfileRecord>()
  private n = 0
  async getOrCreate(ownerId: string) {
    let r = this.rows.get(ownerId)
    if (!r) {
      const at = NOW.toISOString()
      r = { displayName: ownerId.split('-')[1], gameMaster: false, playerId: `EMBER-AAAA${'ABCDEFGHJK'[this.n++]}`, createdAt: at, updatedAt: at }
      this.rows.set(ownerId, r)
    }
    return r
  }
  async peek(ownerId: string) { return this.rows.get(ownerId) ?? null }
  async ownerOfPlayer(playerId: string) {
    return [...this.rows].find(([, r]) => r.playerId === playerId)?.[0] ?? null
  }
}

class MemoryFriends implements Partial<FriendStore> {
  sides = new Map<string, FriendEdge['status']>() // `${me}/${other}`
  constructor(private profiles: MemoryProfiles) {}
  async list(me: string): Promise<FriendEdge[]> {
    return [...this.sides].filter(([k]) => k.startsWith(`${me}/`)).map(([k, status]) => ({ userId: k.split('/')[1], status }))
  }
  async mutualWith(me: string, ids: string[]) {
    return ids.filter(id => this.sides.get(`${id}/${me}`) === 'accepted')
  }
  async identities(ids: string[]) {
    const out: Record<string, FriendIdentity> = {}
    for (const id of ids) {
      const p = this.profiles.rows.get(id)
      if (p) out[id] = { playerId: p.playerId, displayName: p.displayName }
    }
    return out
  }
}

class MemoryPresence implements PresenceStore {
  seen: Record<string, PresenceRecord> = {}
  async beat(userId: string, gameId: string, nowMs: number) { this.seen[userId] = { gameId, seenAt: nowMs } }
  async presenceOf(userIds: string[]) {
    return Object.fromEntries(userIds.filter(id => this.seen[id]).map(id => [id, this.seen[id]]))
  }
}

/** Only the reads the handler makes: membership, a member's own Games, and heroes (none here). */
class MemoryGames implements Partial<GameStore> {
  games = new Map<string, GameRecord>()
  add(id: string, name: string, owner: string, members: string[]) {
    this.games.set(id, {
      id, name, ownerId: owner, memberIds: members, adventure: { source: 'builtin', id: 'soot-kings-hearth' },
      visibility: 'private', solo: false, listed: false, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    })
  }
  async getForMember(userId: string, id: string) {
    const g = this.games.get(id)
    return g && g.memberIds.includes(userId) ? g : null
  }
  async listFor(userId: string) { return [...this.games.values()].filter(g => g.memberIds.includes(userId)) }
  async heroesOf() { return {} }
}

const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any>; text(): Promise<string> }

async function world() {
  const profiles = new MemoryProfiles()
  const friends = new MemoryFriends(profiles)
  const presence = new MemoryPresence()
  const games = new MemoryGames()
  for (const who of [ANA, BEN, CAL]) await profiles.getOrCreate(who)
  const call = (method: string, path: string, as?: string) => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (as) headers.Authorization = `Bearer token-${as}`
    return handle(new Request(`https://api.test${path}`, { method, headers }), {
      store: {} as never, profiles: profiles as unknown as ProfileStore, adventures: {} as never, games: games as unknown as GameStore,
      friends: friends as unknown as FriendStore, chat: {} as never, presence, portraits: new MemoryPortraits(),
      allowedOrigins: [ORIGIN], verifyToken,
    }) as unknown as Promise<Reply>
  }
  const idOf = async (who: string) => (await profiles.getOrCreate(who)).playerId
  const befriend = (a: string, b: string) => { friends.sides.set(`${a}/${b}`, 'accepted'); friends.sides.set(`${b}/${a}`, 'accepted') }
  const beat = (who: string, gameId: string, agoMs = 0) => { presence.seen[who] = { gameId, seenAt: NOW.getTime() - agoMs } }
  return { profiles, friends, presence, games, call, idOf, befriend, beat }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

describe('onlineIds', () => {
  const seen = {
    a: { gameId: G1, seenAt: NOW.getTime() },
    b: { gameId: G1, seenAt: NOW.getTime() - window },
    c: { gameId: G1, seenAt: NOW.getTime() - window - 1 },
    d: { gameId: G2, seenAt: NOW.getTime() },
  }
  it('counts a beat up to the window old, and not a ms older', () => {
    expect(onlineIds(seen, NOW.getTime()).sort()).toEqual(['a', 'b', 'd'])
  })
  it('can ask for one Game, so a player at another table is not at this one', () => {
    expect(onlineIds(seen, NOW.getTime(), G1).sort()).toEqual(['a', 'b'])
  })
  it('beats well inside the window, so one missed beat is not offline', () => {
    expect(gameData.presence.heartbeatSeconds * 2).toBeLessThanOrEqual(gameData.presence.onlineSeconds)
  })
})

describe('PUT /games/:id/presence', () => {
  it('needs sign-in and a member', async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA, BEN])
    expect((await w.call('PUT', `/games/${G1}/presence`)).status).toBe(401)
    expect((await w.call('PUT', `/games/${G1}/presence`, CAL)).status).toBe(404)
    expect(w.presence.seen[CAL]).toBeUndefined() // a non-member's beat is never written
  })

  it('refuses the wrong methods', async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA])
    expect((await w.call('GET', `/games/${G1}/presence`, ANA)).status).toBe(405)
    expect((await w.call('DELETE', `/games/${G1}/presence`, ANA)).status).toBe(405)
  })

  it("writes only the caller's own presence, for that Game, and answers who is at the table", async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA, BEN])
    w.beat(BEN, G1, 10_000)
    const r = await w.call('PUT', `/games/${G1}/presence`, ANA)
    expect(r.status).toBe(200)
    expect(w.presence.seen[ANA]).toEqual({ gameId: G1, seenAt: NOW.getTime() })
    expect(Object.keys(w.presence.seen).sort()).toEqual([ANA, BEN].sort())
    const body = await r.json()
    expect(body.online.sort()).toEqual([await w.idOf(ANA), await w.idOf(BEN)].sort())
  })

  it('does not count a member who is at another table or has gone quiet', async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA, BEN, CAL])
    w.beat(BEN, G2)
    w.beat(CAL, G1, window + 1)
    const body = await (await w.call('PUT', `/games/${G1}/presence`, ANA)).json()
    expect(body.online).toEqual([await w.idOf(ANA)])
  })

  it('never returns a Cognito id', async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA, BEN])
    w.beat(BEN, G1)
    const text = await (await w.call('PUT', `/games/${G1}/presence`, ANA)).text()
    for (const sub of [ANA, BEN, CAL]) expect(text).not.toContain(sub)
  })
})

describe('the roster of a Game', () => {
  it('marks members online only when their recent beat named this Game', async () => {
    const w = await world()
    w.games.add(G1, 'Friday', ANA, [ANA, BEN, CAL])
    w.beat(ANA, G1)
    w.beat(BEN, G2) // online, but at another table
    w.beat(CAL, G1, window + 1) // gone quiet
    const game = await (await w.call('GET', `/games/${G1}`, ANA)).json()
    const online = Object.fromEntries(game.members.map((m: { playerId: string; online: boolean }) => [m.playerId, m.online]))
    expect(online).toEqual({ [await w.idOf(ANA)]: true, [await w.idOf(BEN)]: false, [await w.idOf(CAL)]: false })
  })
})

describe('presence on the friends list', () => {
  it('shows a mutual friend online, naming the Game only when the caller is at that table too', async () => {
    const w = await world()
    w.befriend(ANA, BEN)
    w.befriend(ANA, CAL)
    w.games.add(G1, 'Friday', BEN, [BEN, ANA]) // Ana is at this one
    w.games.add(G2, 'Secret', CAL, [CAL]) // Ana is not
    w.beat(BEN, G1)
    w.beat(CAL, G2)
    const { friends } = await (await w.call('GET', '/friends', ANA)).json()
    const row = (id: string) => friends.find((f: { playerId: string }) => f.playerId === id)
    expect(row(await w.idOf(BEN))).toMatchObject({ online: true, game: { id: G1, name: 'Friday' } })
    expect(row(await w.idOf(CAL))).toMatchObject({ online: true, game: null }) // a private Game's name stays private
  })

  it('shows a friend as offline when their beat is stale or they never sent one', async () => {
    const w = await world()
    w.befriend(ANA, BEN)
    w.befriend(ANA, CAL)
    w.beat(BEN, G1, window + 1)
    const { friends } = await (await w.call('GET', '/friends', ANA)).json()
    expect(friends.map((f: { online: boolean }) => f.online)).toEqual([false, false])
    expect(friends.every((f: { game: unknown }) => f.game === null)).toBe(true)
  })

  it('never shows presence for someone who removed you, even if your side still says friends', async () => {
    const w = await world()
    w.friends.sides.set(`${ANA}/${BEN}`, 'accepted') // Ana's side is stale: Ben's side is gone
    w.beat(BEN, G1)
    w.games.add(G1, 'Friday', BEN, [BEN, ANA])
    const { friends } = await (await w.call('GET', '/friends', ANA)).json()
    expect(friends).toHaveLength(1)
    expect(friends[0]).toMatchObject({ online: false, game: null })
  })

  it('never shows presence for a pending request in either direction', async () => {
    const w = await world()
    w.friends.sides.set(`${ANA}/${BEN}`, 'outgoing')
    w.friends.sides.set(`${BEN}/${ANA}`, 'incoming')
    w.friends.sides.set(`${ANA}/${CAL}`, 'incoming')
    w.friends.sides.set(`${CAL}/${ANA}`, 'outgoing')
    w.beat(BEN, G1)
    w.beat(CAL, G1)
    const lists = await (await w.call('GET', '/friends', ANA)).json()
    expect(lists.friends).toEqual([])
    for (const row of [...lists.incoming, ...lists.outgoing]) expect(Object.keys(row).sort()).toEqual(['displayName', 'playerId'])
  })

  it('asks the store for presence once for everyone, and not at all with no friends', async () => {
    const w = await world()
    const spy = vi.spyOn(w.presence, 'presenceOf')
    await w.call('GET', '/friends', ANA)
    expect(spy).not.toHaveBeenCalled()
    w.befriend(ANA, BEN)
    w.befriend(ANA, CAL)
    await w.call('GET', '/friends', ANA)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].sort()).toEqual([BEN, CAL].sort())
  })

  it('never returns a Cognito id', async () => {
    const w = await world()
    w.befriend(ANA, BEN)
    w.games.add(G1, 'Friday', BEN, [BEN, ANA])
    w.beat(BEN, G1)
    const text = await (await w.call('GET', '/friends', ANA)).text()
    for (const sub of [ANA, BEN, CAL]) expect(text).not.toContain(sub)
    expect(text).not.toMatch(/"(ownerId|userId|seenAt)"/)
  })
})
