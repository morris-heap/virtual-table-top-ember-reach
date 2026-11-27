import { describe, expect, it } from 'vitest'
import { handle, type CharacterStore } from '../src/handler.ts'
import { PORTRAIT } from '../src/portrait.ts'
import { parseSheet, type CharacterRecord } from '../src/sheet.ts'
import { MemoryPortraits } from './portraits-helper.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const HERO = '33333333-3333-4333-8333-333333333333'

const sheet = parseSheet({
  name: 'Kestrel', player: 'P', level: 1, ancestry: 'Emberkin', calling: 'Hexer', background: '', oath: '',
  attributes: { might: -1, grace: 1, wits: 2, lore: 3, spirit: 2, presence: 0 },
  grit: 6, ember: 4, deathFails: 0, wounds: [], skills: {}, attacks: [], signature: '', talents: [], spells: [], minerals: [],
  armor: 'none', shield: false, silver: 0, supplyDie: 'd8', gear: '', contacts: '', notes: '',
})

function setup() {
  const rows = new Map<string, CharacterRecord>()
  const store = {
    ping: async () => {}, list: async () => [],
    get: async (o: string, id: string) => rows.get(`${o}/${id}`) ?? null,
    save: async (o: string, id: string) => { throw new Error('unused ' + o + id) },
    delete: async (o: string, id: string) => rows.delete(`${o}/${id}`),
  } as CharacterStore
  const portraits = new MemoryPortraits()
  const hero = (owner: string) => rows.set(`${owner}/${HERO}`, { ...sheet, id: HERO, ownerId: owner, createdAt: '', updatedAt: '' })
  const call = (method: string, owner: string | null, body?: unknown, path = `/characters/${HERO}/portrait`) =>
    handle(new Request(`https://api.test${path}`, {
      method,
      headers: { Origin: ORIGIN, ...(owner ? { Authorization: `Bearer token-${owner}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), {
      store, portraits, allowedOrigins: [ORIGIN],
      verifyToken: async t => t.slice('token-'.length),
      // The portrait routes never touch these.
      profiles: {} as never, adventures: {} as never, games: {} as never, friends: {} as never, chat: {} as never, maps: {} as never, presence: { presenceOf: async () => ({}), beat: async () => {} } as never,
    })
  return { call, hero, portraits }
}

const png = { contentType: 'image/webp', size: 1000 }

describe('portrait routes (VTTER-55)', () => {
  it('requires sign-in', async () => {
    const { call, hero } = setup()
    hero(A)
    expect((await call('GET', null)).status).toBe(401)
    expect((await call('POST', null, png)).status).toBe(401)
    expect((await call('DELETE', null)).status).toBe(401)
  })

  it('gives the owner a signed upload for exactly the approved type and size', async () => {
    const { call, hero, portraits } = setup()
    hero(A)
    const res = await call('POST', A, png)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      method: 'PUT', expiresIn: PORTRAIT.urlSeconds,
      headers: { 'Content-Type': 'image/webp', 'Content-Length': '1000' },
    })
    // The key is built from the verified owner, never from the request.
    expect(portraits.uploads).toEqual([{ ownerId: A, heroId: HERO, ...png }])
  })

  it('refuses other types and oversized files', async () => {
    const { call, hero } = setup()
    hero(A)
    for (const bad of [
      { contentType: 'image/svg+xml', size: 10 }, { contentType: 'text/html', size: 10 },
      { contentType: 'image/webp', size: PORTRAIT.maxBytes + 1 }, { contentType: 'image/webp', size: 0 },
      { contentType: 'image/webp', size: 1.5 }, { contentType: 'image/webp' }, { contentType: 'image/png', size: 10 }, null, [],
    ]) {
      expect((await call('POST', A, bad)).status).toBe(400)
    }
  })

  it('reads back a signed URL, or 404 when there is no portrait', async () => {
    const { call, hero } = setup()
    hero(A)
    expect((await call('GET', A)).status).toBe(404)
    await call('POST', A, png)
    const res = await call('GET', A)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { url: string }).url).toContain(`${A}/${HERO}`)
  })

  it("never reaches another player's hero or portrait", async () => {
    const { call, hero, portraits } = setup()
    hero(A)
    await call('POST', A, png)
    // B names A's hero id: B's own prefix has nothing, and the hero is not B's.
    expect((await call('GET', B)).status).toBe(404)
    expect((await call('POST', B, png)).status).toBe(404)
    expect(portraits.uploads).toHaveLength(1)
    await call('DELETE', B)
    expect(portraits.objects.has(`${A}/${HERO}`)).toBe(true)
  })

  it('deletes the portrait, and deleting the hero removes it too', async () => {
    const { call, hero, portraits } = setup()
    hero(A)
    await call('POST', A, png)
    expect((await call('DELETE', A)).status).toBe(204)
    expect(portraits.objects.size).toBe(0)
    await call('POST', A, png)
    expect((await call('DELETE', A, undefined, `/characters/${HERO}`)).status).toBe(204)
    expect(portraits.objects.size).toBe(0)
  })

  it("lists only the caller's own portraits in one call", async () => {
    const { call, hero } = setup()
    hero(A)
    expect((await call('GET', null, undefined, '/portraits')).status).toBe(401)
    expect(await (await call('GET', A, undefined, '/portraits')).json()).toMatchObject({ portraits: {} })
    await call('POST', A, png)
    const mine = (await (await call('GET', A, undefined, '/portraits')).json()) as { portraits: Record<string, string> }
    expect(Object.keys(mine.portraits)).toEqual([HERO])
    expect((await (await call('GET', B, undefined, '/portraits')).json() as { portraits: object }).portraits).toEqual({})
    expect((await call('PUT', A, png, '/portraits')).status).toBe(405)
  })

  it('rejects other methods, a bad id and other sub-paths', async () => {
    const { call, hero } = setup()
    hero(A)
    expect((await call('PUT', A, png)).status).toBe(405)
    expect((await call('GET', A, undefined, '/characters/not-a-uuid/portrait')).status).toBe(400)
    expect((await call('GET', A, undefined, `/characters/${HERO}/other`)).status).toBe(404)
  })
})
