import { describe, expect, it } from 'vitest'
import { CHAT_LIMITS, isUnread, newMessageId, parseMessage, type ChatMessageRecord } from '../src/chat.ts'
import type { FriendEdge, FriendIdentity } from '../src/friend.ts'
import { handle, type ChatStore, type FriendStore, type GameStore, type ProfileStore } from '../src/handler.ts'
import type { ProfileRecord } from '../src/profile.ts'
import { MemoryPortraits } from './portraits-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
// Cognito ids: these must never appear in any response body.
const ANA = 'sub-ana-0001'
const BEN = 'sub-ben-0002'
const CAL = 'sub-cal-0003'

class MemoryProfiles {
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
  async peek(ownerId: string) { return this.rows.get(ownerId) ?? null }
  async ownerOfPlayer(playerId: string) {
    return [...this.rows].find(([, r]) => r.playerId === playerId)?.[0] ?? null
  }
}

type Side = { status: FriendEdge['status']; lastMessageAt?: string; lastReadAt?: string }

/** Both sides share state with MemoryChat, the way the real table does: the markers sit on the friend items. */
class MemoryFriends implements FriendStore {
  sides = new Map<string, Side>() // `${me}/${other}`
  constructor(private profiles: MemoryProfiles) {}
  async list(me: string): Promise<FriendEdge[]> {
    return [...this.sides].filter(([k]) => k.startsWith(`${me}/`)).map(([k, s]) => ({ userId: k.split('/')[1], ...s }))
  }
  async get(me: string, other: string) {
    const s = this.sides.get(`${me}/${other}`)
    return s ? { userId: other, ...s } : null
  }
  async request() {}
  async accept(me: string, other: string) {
    this.sides.set(`${me}/${other}`, { status: 'accepted' })
    this.sides.set(`${other}/${me}`, { status: 'accepted' })
  }
  async remove(me: string, other: string) {
    this.sides.delete(`${me}/${other}`)
    this.sides.delete(`${other}/${me}`)
  }
  async areFriends(a: string, b: string) {
    return this.sides.get(`${a}/${b}`)?.status === 'accepted' && this.sides.get(`${b}/${a}`)?.status === 'accepted'
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

class MemoryChat implements ChatStore {
  threads = new Map<string, ChatMessageRecord[]>()
  sentBy = new Map<string, number>()
  tick = 0
  constructor(private friends: MemoryFriends, private maxPerMinute = CHAT_LIMITS.maxPerMinute) {}
  private key = (a: string, b: string) => [a, b].sort().join('#')
  async list(a: string, b: string, q: { before?: string; after?: string }) {
    const all = this.threads.get(this.key(a, b)) ?? []
    if (q.after !== undefined) {
      const next = all.filter(m => m.id > q.after!)
      return { messages: next.slice(0, CHAT_LIMITS.pageSize), hasMore: next.length > CHAT_LIMITS.pageSize }
    }
    const older = q.before !== undefined ? all.filter(m => m.id < q.before!) : all
    return { messages: older.slice(-CHAT_LIMITS.pageSize), hasMore: older.length > CHAT_LIMITS.pageSize }
  }
  async send(from: string, to: string, text: string) {
    const n = (this.sentBy.get(from) ?? 0) + 1
    if (n > this.maxPerMinute) return null
    this.sentBy.set(from, n)
    const at = new Date(Date.UTC(2026, 10, 26, 12, 0, this.tick++)).toISOString()
    const m = { id: newMessageId(new Date(at), () => 0.5), from, text, createdAt: at }
    this.threads.set(this.key(from, to), [...(this.threads.get(this.key(from, to)) ?? []), m])
    const theirs = this.friends.sides.get(`${to}/${from}`)
    if (theirs) theirs.lastMessageAt = at
    const mine = this.friends.sides.get(`${from}/${to}`)
    if (mine) mine.lastReadAt = at
    return m
  }
  async markRead(me: string, other: string) {
    const s = this.friends.sides.get(`${me}/${other}`)
    if (s) s.lastReadAt = '9999-12-31T00:00:00.000Z'
  }
}

const verifyToken = async (token: string) => (token.startsWith('token-') ? token.slice('token-'.length) : null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reply = Omit<Response, 'json'> & { json(): Promise<any>; text(): Promise<string> }

function world(maxPerMinute?: number) {
  const profiles = new MemoryProfiles()
  const friends = new MemoryFriends(profiles)
  const chat = new MemoryChat(friends, maxPerMinute)
  const call = (method: string, path: string, opts: { as?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (opts.as) headers.Authorization = `Bearer token-${opts.as}`
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    return handle(
      new Request(`https://api.test${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
      {
        store: {} as never, games: {} as GameStore, profiles: profiles as unknown as ProfileStore, adventures: {} as never,
        friends, chat, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken,
      },
    ) as unknown as Promise<Reply>
  }
  const idOf = async (who: string) => (await profiles.getOrCreate(who)).playerId
  return { profiles, friends, chat, call, idOf }
}

async function befriend(w: ReturnType<typeof world>, a = ANA, b = BEN) {
  await w.profiles.getOrCreate(a)
  await w.profiles.getOrCreate(b)
  await w.friends.accept(a, b)
}

const say = async (w: ReturnType<typeof world>, from: string, to: string, text: string) =>
  w.call('POST', `/friends/${await w.idOf(to)}/messages`, { as: from, body: { text } })

describe('parseMessage', () => {
  it('trims, folds line endings and keeps newlines', () => {
    expect(parseMessage({ text: '  Friday at 7?\r\nBring the map.  ' })).toBe('Friday at 7?\nBring the map.')
  })
  it('refuses empty text, text over the limit, control characters and non-strings', () => {
    expect(() => parseMessage({ text: '   ' })).toThrow()
    expect(() => parseMessage({ text: 'x'.repeat(CHAT_LIMITS.maxLength + 1) })).toThrow()
    expect(parseMessage({ text: 'x'.repeat(CHAT_LIMITS.maxLength) })).toHaveLength(CHAT_LIMITS.maxLength)
    expect(() => parseMessage({ text: 'a\u0000b' })).toThrow()
    expect(() => parseMessage({ text: 5 })).toThrow()
    expect(() => parseMessage(null)).toThrow()
  })
})

describe('isUnread', () => {
  it('is unread only when a message is newer than the last time the thread was opened', () => {
    expect(isUnread({})).toBe(false)
    expect(isUnread({ lastMessageAt: '2026-11-26T10:00:00.000Z' })).toBe(true)
    expect(isUnread({ lastMessageAt: '2026-11-26T10:00:00.000Z', lastReadAt: '2026-11-26T09:00:00.000Z' })).toBe(true)
    expect(isUnread({ lastMessageAt: '2026-11-26T10:00:00.000Z', lastReadAt: '2026-11-26T10:00:00.000Z' })).toBe(false)
  })
})

describe('chat routes', () => {
  it('needs sign-in', async () => {
    const w = world()
    expect((await w.call('GET', '/friends/EMBER-AAAAB/messages')).status).toBe(401)
    expect((await w.call('POST', '/friends/EMBER-AAAAB/messages', { body: { text: 'hi' } })).status).toBe(401)
    expect((await w.call('POST', '/friends/EMBER-AAAAB/messages/read')).status).toBe(401)
  })

  it('lets friends talk, and shows each side which messages are theirs', async () => {
    const w = world()
    await befriend(w)
    const sent = await say(w, ANA, BEN, 'Friday at 7?')
    expect(sent.status).toBe(201)
    expect(await sent.json()).toMatchObject({ mine: true, text: 'Friday at 7?' })
    await say(w, BEN, ANA, 'Works for me')

    const ana = await (await w.call('GET', `/friends/${await w.idOf(BEN)}/messages`, { as: ANA })).json()
    expect(ana.messages.map((m: { text: string; mine: boolean }) => [m.text, m.mine])).toEqual([['Friday at 7?', true], ['Works for me', false]])
    const ben = await (await w.call('GET', `/friends/${await w.idOf(ANA)}/messages`, { as: BEN })).json()
    expect(ben.messages.map((m: { mine: boolean }) => m.mine)).toEqual([false, true])
    expect(ben.hasMore).toBe(false)
  })

  it('answers the same 404 for a stranger, a pending request, yourself and an unknown player', async () => {
    const w = world()
    await w.profiles.getOrCreate(ANA)
    await w.profiles.getOrCreate(CAL)
    await befriend(w, ANA, BEN)
    w.friends.sides.set(`${ANA}/${CAL}`, { status: 'outgoing' })
    w.friends.sides.set(`${CAL}/${ANA}`, { status: 'incoming' })
    const cal = await w.idOf(CAL)
    const replies = [
      await w.call('GET', `/friends/${cal}/messages`, { as: ANA }),
      await w.call('POST', `/friends/${cal}/messages`, { as: ANA, body: { text: 'hi' } }),
      await w.call('POST', `/friends/${cal}/messages/read`, { as: ANA }),
      await w.call('GET', `/friends/${await w.idOf(ANA)}/messages`, { as: ANA }),
      await w.call('GET', '/friends/EMBER-ZZZZZ/messages', { as: ANA }),
    ]
    for (const r of replies) expect(r.status).toBe(404)
    expect(new Set(await Promise.all(replies.map(r => r.text()))).size).toBe(1)
    expect(w.chat.threads.size).toBe(0)
  })

  it('stops at once when either side removes the friendship', async () => {
    const w = world()
    await befriend(w)
    await say(w, ANA, BEN, 'before')
    w.friends.sides.delete(`${BEN}/${ANA}`) // Ben removed Ana; her side is stale
    const ben = await w.idOf(BEN)
    expect((await w.call('GET', `/friends/${ben}/messages`, { as: ANA })).status).toBe(404)
    expect((await say(w, ANA, BEN, 'after')).status).toBe(404)
    expect((await w.call('GET', `/friends/${await w.idOf(ANA)}/messages`, { as: BEN })).status).toBe(404)
  })

  it('never lets an account id into a response', async () => {
    const w = world()
    await befriend(w)
    await say(w, ANA, BEN, 'one')
    await say(w, BEN, ANA, 'two')
    const bodies = [
      await (await w.call('GET', `/friends/${await w.idOf(BEN)}/messages`, { as: ANA })).text(),
      await (await say(w, ANA, BEN, 'three')).text(),
      await (await w.call('GET', '/friends', { as: BEN })).text(),
    ]
    for (const body of bodies) for (const sub of [ANA, BEN, CAL]) expect(body).not.toContain(sub)
    for (const body of bodies) expect(body).not.toMatch(/"(from|ownerId)"/)
  })

  it('rejects a bad message with 400 and a message the app can show', async () => {
    const w = world()
    await befriend(w)
    const ben = await w.idOf(BEN)
    for (const body of [{ text: '' }, { text: 'x'.repeat(CHAT_LIMITS.maxLength + 1) }, { nope: 1 }, [] ]) {
      const r = await w.call('POST', `/friends/${ben}/messages`, { as: ANA, body })
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBeTruthy()
    }
    expect(w.chat.threads.size).toBe(0)
  })

  it('answers 429 with Retry-After once a sender is over the per-minute cap', async () => {
    const w = world(2)
    await befriend(w)
    expect((await say(w, ANA, BEN, 'one')).status).toBe(201)
    expect((await say(w, ANA, BEN, 'two')).status).toBe(201)
    const third = await say(w, ANA, BEN, 'three')
    expect(third.status).toBe(429)
    expect(third.headers.get('Retry-After')).toBeTruthy()
    expect((await say(w, BEN, ANA, 'still fine')).status).toBe(201) // the cap is per sender
  })

  it('reads forward from a cursor and back from a cursor, and refuses a malformed one', async () => {
    const w = world(1000)
    await befriend(w)
    for (let i = 1; i <= CHAT_LIMITS.pageSize + 5; i++) await say(w, ANA, BEN, `m${i}`)
    const path = `/friends/${await w.idOf(BEN)}/messages`
    const latest = await (await w.call('GET', path, { as: ANA })).json()
    expect(latest.messages).toHaveLength(CHAT_LIMITS.pageSize)
    expect(latest.hasMore).toBe(true)
    expect(latest.messages.at(-1).text).toBe(`m${CHAT_LIMITS.pageSize + 5}`)

    const older = await (await w.call('GET', `${path}?before=${encodeURIComponent(latest.messages[0].id)}`, { as: ANA })).json()
    expect(older.messages.map((m: { text: string }) => m.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    expect(older.hasMore).toBe(false)

    const newer = await (await w.call('GET', `${path}?after=${encodeURIComponent(latest.messages.at(-2).id)}`, { as: ANA })).json()
    expect(newer.messages.map((m: { text: string }) => m.text)).toEqual([`m${CHAT_LIMITS.pageSize + 5}`])

    for (const q of ['before=nope', 'after=2026-11-26', `before=${encodeURIComponent(latest.messages[0].id)}&after=${encodeURIComponent(latest.messages[0].id)}`]) {
      expect((await w.call('GET', `${path}?${q}`, { as: ANA })).status).toBe(400)
    }
  })

  it('flags unread on the friend list for the receiver only, and clears it when the thread is read', async () => {
    const w = world()
    await befriend(w)
    const unread = async (who: string) => (await (await w.call('GET', '/friends', { as: who })).json()).friends[0].unread
    expect(await unread(BEN)).toBe(false)
    await say(w, ANA, BEN, 'hello')
    expect(await unread(BEN)).toBe(true)
    expect(await unread(ANA)).toBe(false) // the sender has seen it
    expect((await w.call('POST', `/friends/${await w.idOf(ANA)}/messages/read`, { as: BEN })).status).toBe(204)
    expect(await unread(BEN)).toBe(false)
  })

  it('refuses the wrong methods and unknown sub-paths', async () => {
    const w = world()
    await befriend(w)
    const base = `/friends/${await w.idOf(BEN)}/messages`
    expect((await w.call('DELETE', base, { as: ANA })).status).toBe(405)
    expect((await w.call('GET', `${base}/read`, { as: ANA })).status).toBe(405)
    expect((await w.call('POST', `${base}/other`, { as: ANA })).status).toBe(404)
  })
})
