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
    const h = makeHandler({ store, allowedOrigins: [ORIGIN], verifyToken: async () => null })
    const res = await h(event('GET', '/health'))
    expect(res.statusCode).toBe(200)
    expect(res.headers?.['access-control-allow-origin']).toBe(ORIGIN)
    expect(JSON.parse(res.body as string)).toEqual({ ok: true, db: 'ok' })
  })

  it('answers the CORS preflight with 204', async () => {
    const res = await makeHandler({ store, allowedOrigins: [ORIGIN], verifyToken: async () => null })(event('OPTIONS', '/characters'))
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })
})
