import { MemoryPortraits } from './portraits-helper.ts'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import type { CharacterStore } from '../src/handler.ts'
import { makeHandler, toRequest } from '../src/lambda.ts'

const ORIGIN = 'https://emberreach.morris-heap.com'

function event(method: string, path: string, opts: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: { origin: ORIGIN },
    requestContext: { domainName: 'api.example', http: { method, path } } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    ...opts,
  }
}

const store: CharacterStore = {
  ping: async () => {},
  list: async () => [],
  get: async () => null,
  save: async () => { throw new Error('unused') },
  delete: async () => false,
}

const unused = async () => { throw new Error('unused') }
const profiles = { getOrCreate: unused, update: unused, peek: async () => null, ownerOfPlayer: async () => null, findByName: async () => [], allowSearch: async () => true }
const adventures = { list: async () => [], get: async () => null, save: unused, delete: async () => false }
const games = {
  getForMember: async () => null, listFor: async () => [], countOwned: async () => 0, countJoined: async () => 0,
  save: unused, delete: async () => false, gmOf: async () => null, getByGm: async () => null,
  addMember: async () => null, removeMember: async () => {},
  heroesOf: async () => ({}), setHero: async () => {}, listPublic: async () => ({ games: [], cursor: null }),
}

describe('Lambda adapter', () => {
  it('builds a Request with the path, query, headers and a decoded base64 body', async () => {
    const req = toRequest(event('PUT', '/characters/x', {
      rawQueryString: 'a=1', headers: { authorization: 'Bearer abc' },
      body: Buffer.from('{"name":"K"}').toString('base64'), isBase64Encoded: true,
    }))
    expect(req.url).toBe('https://api.example/characters/x?a=1')
    expect(req.method).toBe('PUT')
    expect(req.headers.get('Authorization')).toBe('Bearer abc')
    expect(await req.json()).toEqual({ name: 'K' })
  })

  it('returns status, CORS headers and body from the handler', async () => {
    const h = makeHandler({ store, profiles, adventures, games, friends: {} as never, chat: {} as never, presence: { presenceOf: async () => ({}), beat: async () => {} } as never, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken: async () => null })
    const res = await h(event('GET', '/health'))
    expect(res.statusCode).toBe(200)
    expect(res.headers?.['access-control-allow-origin']).toBe(ORIGIN)
    expect(JSON.parse(res.body as string)).toEqual({ ok: true, db: 'ok' })
  })

  it('answers the CORS preflight with 204', async () => {
    const res = await makeHandler({ store, profiles, adventures, games, friends: {} as never, chat: {} as never, presence: { presenceOf: async () => ({}), beat: async () => {} } as never, portraits: new MemoryPortraits(), allowedOrigins: [ORIGIN], verifyToken: async () => null })(event('OPTIONS', '/characters'))
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })
})
