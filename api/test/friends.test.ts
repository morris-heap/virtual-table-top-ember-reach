import { describe, expect, it } from 'vitest'
import adventureData from '../../data/adventure.json'
import type { AdventureDraft, AdventureRecord } from '../src/adventure.ts'
import { FRIEND_LIMITS, type FriendEdge, type FriendIdentity, type FriendStatus } from '../src/friend.ts'
import { handle, type AdventureStore, type FriendStore, type GameStore, type ProfileStore } from '../src/handler.ts'
import type { ProfilePatch, ProfileRecord } from '../src/profile.ts'
import { MemoryPortraits } from './portraits-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
// Cognito ids: these must never appear in any response body.
const ANA = 'sub-ana-0001'
const BEN = 'sub-ben-0002'
const CAL = 'sub-cal-0003'
const ADV = '44444444-4444-4444-8444-444444444444'
const ADV_PRIVATE = '55555555-5555-4555-8555-555555555555'

class MemoryProfiles implements ProfileStore {
  rows = new Map<string, ProfileRecord>()
  private n = 0
  async getOrCreate(ownerId: string) {
    let r = this.rows.get(ownerId)
    if (!r) {
      const now = new Date().toISOString()
      r = { displayName: ownerId.split('-')[1], gameMaster: false, playerId: `EMBER-AAAA${'ABCDEFGHJK'[this.n++]}`, createdAt: now, updatedAt: now }
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
  async ownerOfPlayer(playerId: string) {
    return [...this.rows].find(([, r]) => r.playerId === playerId)?.[0] ?? null
  }
}

/** Mirrors the DynamoDB layout: each player holds their own side, keyed (me, other). */
class MemoryFriends implements FriendStore {
  sides = new Map<string, FriendStatus>() // `${me}/${other}`
  constructor(private profiles: MemoryProfiles) {}
  async list(me: string): Promise<FriendEdge[]> {
    return [...this.sides].filter(([k]) => k.startsWith(`${me}/`)).map(([k, status]) => ({ userId: k.split('/')[1], status }))
  }
  async get(me: string, other: string) {
    const status = this.sides.get(`${me}/${other}`)
    return status ? { userId: other, status } : null
  }
  async request(from: string, to: string) {
    this.sides.set(`${from}/${to}`, 'outgoing')
    if (this.sides.get(`${to}/${from}`) !== 'accepted') this.sides.set(`${to}/${from}`, 'incoming')
  }
  async accept(me: string, other: string) {
    this.sides.set(`${me}/${other}`, 'accepted')
    this.sides.set(`${other}/${me}`, 'accepted')
  }
  async remove(me: string, other: string) {
    this.sides.delete(`${me}/${other}`)
    this.sides.delete(`${other}/${me}`)
  }
  async areFriends(a: string, b: string) {
    return this.sides.get(`${a}/${b}`) === 'accepted' && this.sides.get(`${b}/${a}`) === 'accepted'
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

class MemoryAdventures implements AdventureStore {
  rows = new Map<string, AdventureRecord>()
  async list(owner: string) {
    return [...this.rows.values()].filter(r => r.ownerId === owner)
      .map(({ id, title, summary, levelMin, levelMax, visibility, updatedAt }) => ({ id, title, summary, levelMin, levelMax, visibility, updatedAt }))
  }
  async get(owner: string, id: string) { return this.rows.get(`${owner}/${id}`) ?? null }
  async save(owner: string, id: string, d: AdventureDraft) {
    const r = { ...d, id, ownerId: owner, createdAt: 'x', updatedAt: 'x' }
    this.rows.set(`${owner}/${id}`, r)
    return r
  }
  async delete() { return false }
}

const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any>; text(): Promise<string> }

function world() {
  const profiles = new MemoryProfiles()
  const friends = new MemoryFriends(profiles)
  const adventures = new MemoryAdventures()
  const call = (method: string, path: string, opts: { as?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (opts.as) headers.Authorization = `Bearer token-${opts.as}`
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
      {
        store: {} as never, games: {} as GameStore, profiles, adventures, friends, chat: {} as never,
        portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken,
      },
    ) as unknown as Promise<Reply>
  }
  const idOf = async (who: string) => (await profiles.getOrCreate(who)).playerId
  return { profiles, friends, adventures, call, idOf }
}

const draft = (title: string, visibility: string): AdventureDraft => ({
  title, summary: '', levelMin: 1, levelMax: 2, visibility, scenes: [], hooks: [],
})

/** Ana and Ben become friends. */
async function befriend(w: ReturnType<typeof world>, a = ANA, b = BEN) {
  await w.call('PUT', `/friends/${await w.idOf(b)}`, { as: a })
  await w.call('PUT', `/friends/${await w.idOf(a)}`, { as: b })
}

describe('friend requests', () => {
  it('needs sign-in', async () => {
    const w = world()
    expect((await w.call('GET', '/friends')).status).toBe(401)
    expect((await w.call('PUT', '/friends/EMBER-22222')).status).toBe(401)
  })

  it('sends a request that shows as outgoing for me and incoming for them', async () => {
    const w = world()
    const ben = await w.idOf(BEN)
    const sent = await w.call('PUT', `/friends/${ben}`, { as: ANA })
    expect(sent.status).toBe(200)
    expect((await sent.json()).outgoing).toEqual([{ playerId: ben, displayName: 'ben' }])
    const theirs = await (await w.call('GET', '/friends', { as: BEN })).json()
    expect(theirs.incoming).toEqual([{ playerId: await w.idOf(ANA), displayName: 'ana' }])
    expect(theirs.friends).toEqual([])
  })

  it('becomes a friendship when they accept, and is visible on both sides', async () => {
    const w = world()
    await befriend(w)
    for (const who of [ANA, BEN]) {
      const body = await (await w.call('GET', '/friends', { as: who })).json()
      expect(body.friends).toHaveLength(1)
      expect(body.incoming).toEqual([])
      expect(body.outgoing).toEqual([])
    }
  })

  it('accepts when both have asked each other', async () => {
    const w = world()
    // Both sides wrote `outgoing` (a request that crossed in flight).
    w.friends.sides.set(`${ANA}/${BEN}`, 'outgoing')
    w.friends.sides.set(`${BEN}/${ANA}`, 'outgoing')
    await w.idOf(ANA); await w.idOf(BEN)
    const res = await w.call('PUT', `/friends/${await w.idOf(BEN)}`, { as: ANA })
    expect((await res.json()).friends).toHaveLength(1)
  })

  it('refuses a request to yourself, to an unknown ID and with a malformed ID', async () => {
    const w = world()
    expect((await w.call('PUT', `/friends/${await w.idOf(ANA)}`, { as: ANA })).status).toBe(400)
    expect((await w.call('PUT', '/friends/EMBER-99999', { as: ANA })).status).toBe(404)
    expect((await w.call('PUT', '/friends/nonsense', { as: ANA })).status).toBe(400)
  })

  it('is idempotent: asking twice leaves one request', async () => {
    const w = world()
    const ben = await w.idOf(BEN)
    await w.call('PUT', `/friends/${ben}`, { as: ANA })
    const again = await (await w.call('PUT', `/friends/${ben}`, { as: ANA })).json()
    expect(again.outgoing).toHaveLength(1)
  })

  it('declines, cancels and removes with DELETE, and 404s when there is nothing to delete', async () => {
    const w = world()
    const ana = await w.idOf(ANA)
    const ben = await w.idOf(BEN)
    await w.call('PUT', `/friends/${ben}`, { as: ANA })
    expect((await w.call('DELETE', `/friends/${ana}`, { as: BEN })).status).toBe(204) // decline
    expect(await (await w.call('GET', '/friends', { as: ANA })).json()).toEqual({ friends: [], incoming: [], outgoing: [] })
    expect((await w.call('DELETE', `/friends/${ana}`, { as: BEN })).status).toBe(404)

    await w.call('PUT', `/friends/${ben}`, { as: ANA })
    expect((await w.call('DELETE', `/friends/${ben}`, { as: ANA })).status).toBe(204) // cancel
    await befriend(w)
    expect((await w.call('DELETE', `/friends/${ben}`, { as: ANA })).status).toBe(204) // remove
    expect((await (await w.call('GET', '/friends', { as: BEN })).json()).friends).toEqual([])
  })

  it('caps outgoing requests and incoming requests', async () => {
    const w = world()
    const target = await w.idOf(BEN)
    // Ana already has the maximum waiting.
    for (let i = 0; i < FRIEND_LIMITS.maxOutgoing; i++) w.friends.sides.set(`${ANA}/other-${i}`, 'outgoing')
    expect((await w.call('PUT', `/friends/${target}`, { as: ANA })).status).toBe(400)

    // Cal's inbox is full.
    const cal = await w.idOf(CAL)
    for (let i = 0; i < FRIEND_LIMITS.maxIncoming; i++) w.friends.sides.set(`${CAL}/spam-${i}`, 'incoming')
    expect((await w.call('PUT', `/friends/${cal}`, { as: BEN })).status).toBe(400)
  })

  it('refuses to accept past the friend limit', async () => {
    const w = world()
    const ben = await w.idOf(BEN)
    await w.call('PUT', `/friends/${ben}`, { as: ANA })
    for (let i = 0; i < FRIEND_LIMITS.maxFriends; i++) w.friends.sides.set(`${BEN}/pal-${i}`, 'accepted')
    expect((await w.call('PUT', `/friends/${await w.idOf(ANA)}`, { as: BEN })).status).toBe(400)
  })

  it('treats a one-sided stale friendship as a fresh request', async () => {
    const w = world()
    await w.idOf(ANA); await w.idOf(BEN)
    w.friends.sides.set(`${ANA}/${BEN}`, 'accepted') // Ben removed Ana, but Ana's side survived
    const res = await w.call('PUT', `/friends/${await w.idOf(BEN)}`, { as: ANA })
    const body = await res.json()
    expect(body.friends).toEqual([])
    expect(body.outgoing).toHaveLength(1)
  })

  it('never puts a Cognito id in a response', async () => {
    const w = world()
    await befriend(w)
    await w.adventures.save(ANA, ADV, draft('Shared', 'friends'))
    const bodies = [
      await (await w.call('GET', '/friends', { as: BEN })).text(),
      await (await w.call('GET', `/friends/${await w.idOf(ANA)}/adventures`, { as: BEN })).text(),
      await (await w.call('GET', `/friends/${await w.idOf(ANA)}/adventures/${ADV}`, { as: BEN })).text(),
    ]
    for (const text of bodies) for (const sub of [ANA, BEN, CAL]) expect(text).not.toContain(sub)
  })
})

describe("a friend's adventures", () => {
  async function shared() {
    const w = world()
    await befriend(w)
    await w.adventures.save(ANA, ADV, draft('Shared', 'friends'))
    await w.adventures.save(ANA, ADV_PRIVATE, draft('Secret', 'private'))
    return w
  }

  it('lets a friend list and read a friends-visibility adventure, and only that kind', async () => {
    const w = await shared()
    const ana = await w.idOf(ANA)
    const list = await (await w.call('GET', `/friends/${ana}/adventures`, { as: BEN })).json()
    expect(list.adventures.map((a: { title: string }) => a.title)).toEqual(['Shared'])
    const one = await w.call('GET', `/friends/${ana}/adventures/${ADV}`, { as: BEN })
    expect(one.status).toBe(200)
    expect((await one.json()).title).toBe('Shared')
    expect((await w.call('GET', `/friends/${ana}/adventures/${ADV_PRIVATE}`, { as: BEN })).status).toBe(404)
  })

  it('answers 404 to everyone who is not a friend', async () => {
    const w = await shared()
    const ana = await w.idOf(ANA)
    await w.idOf(CAL)
    // A stranger.
    expect((await w.call('GET', `/friends/${ana}/adventures`, { as: CAL })).status).toBe(404)
    expect((await w.call('GET', `/friends/${ana}/adventures/${ADV}`, { as: CAL })).status).toBe(404)
    // A pending requester has not been accepted.
    await w.call('PUT', `/friends/${ana}`, { as: CAL })
    expect((await w.call('GET', `/friends/${ana}/adventures/${ADV}`, { as: CAL })).status).toBe(404)
    // An unknown player looks the same as a non-friend.
    expect((await w.call('GET', '/friends/EMBER-99999/adventures', { as: BEN })).status).toBe(404)
  })

  it('stops at once when either side removes the friendship', async () => {
    const w = await shared()
    const ana = await w.idOf(ANA)
    // Ben still holds "accepted", but Ana's side is gone: no access.
    w.friends.sides.delete(`${ANA}/${BEN}`)
    expect((await w.call('GET', `/friends/${ana}/adventures/${ADV}`, { as: BEN })).status).toBe(404)
  })

  it('is read-only, and unknown sub-paths are 404', async () => {
    const w = await shared()
    const ana = await w.idOf(ANA)
    expect((await w.call('PUT', `/friends/${ana}/adventures/${ADV}`, { as: BEN, body: {} })).status).toBe(405)
    expect((await w.call('DELETE', `/friends/${ana}/adventures/${ADV}`, { as: BEN })).status).toBe(405)
    expect((await w.call('GET', `/friends/${ana}/heroes`, { as: BEN })).status).toBe(404)
    expect((await w.call('GET', `/friends/${ana}/adventures/${ADV}/extra`, { as: BEN })).status).toBe(404)
  })
})

describe('adventure visibility', () => {
  it('data/adventure.json makes friends live and keeps public off', () => {
    expect(adventureData.liveVisibilities).toContain('friends')
    expect(adventureData.liveVisibilities).not.toContain('public')
  })

  it('accepts friends and still refuses public when an author saves', async () => {
    const w = world()
    const body = { ...draft('T', 'friends'), scenes: [], hooks: [] }
    expect((await w.call('PUT', `/adventures/${ADV}`, { as: ANA, body })).status).toBe(200)
    expect((await w.call('PUT', `/adventures/${ADV}`, { as: ANA, body: { ...body, visibility: 'public' } })).status).toBe(400)
  })
})
