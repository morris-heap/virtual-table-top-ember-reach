import { createPublicKey, createSign, createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { GITHUB, GITHUB_SCOPES, clientCredentials, handleGithubOidc, type GithubOidcDeps, type Signer } from '../src/github-oidc.ts'

const ISSUER = 'https://abc123.execute-api.us-east-2.amazonaws.com'
const NOW = 1_800_000_000_000
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const signer: Signer = {
  kid: 'test-key',
  async sign(data) {
    return createSign('RSA-SHA256').update(data).sign(privateKey)
  },
  async publicJwk() {
    const { kty, n, e } = publicKey.export({ format: 'jwk' })
    return { kty, n, e }
  },
}

const USER = { id: 4242, login: 'ember-bearer', name: 'Ash Tender', avatar_url: 'https://avatars.githubusercontent.com/u/4242' }
const EMAILS = [
  { email: 'old@example.com', primary: false, verified: true },
  { email: 'ash@example.com', primary: true, verified: true },
]

/** A fake GitHub: the token endpoint and the /user and /user/emails APIs. */
function github(opts: { token?: object; user?: object; emails?: object[]; apiStatus?: number } = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === GITHUB.token) return Response.json(opts.token ?? { access_token: 'gho_abc', token_type: 'bearer', scope: GITHUB_SCOPES })
    const auth = new Headers(init?.headers).get('authorization')
    if (auth !== 'Bearer gho_abc' || opts.apiStatus === 401) return new Response('{}', { status: 401 })
    if (url === `${GITHUB.api}/user`) return Response.json(opts.user ?? USER)
    if (url === `${GITHUB.api}/user/emails`) return Response.json(opts.emails ?? EMAILS)
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const deps = (fetch = github()): GithubOidcDeps => ({ clientId: 'gh-client', signer, fetch, now: () => NOW })

function tokenRequest(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${ISSUER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields),
  })
}
const GOOD = { grant_type: 'authorization_code', code: 'c1', client_id: 'gh-client', client_secret: 's3cret', redirect_uri: 'https://x/oauth2/idpresponse' }

function decode(jwt: string) {
  const [h, p, s] = jwt.split('.')
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'))
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url').toString()), payload: JSON.parse(Buffer.from(p, 'base64url').toString()) }
}

describe('GitHub OIDC wrapper', () => {
  it('redirects /authorize to GitHub with GitHub scopes and the same state', async () => {
    const res = await handleGithubOidc(new Request(
      `${ISSUER}/authorize?response_type=code&client_id=gh-client&redirect_uri=https%3A%2F%2Fx%2Foauth2%2Fidpresponse&scope=openid+email+profile&state=st1`,
    ), deps())
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(GITHUB.authorize)
    expect(Object.fromEntries(loc.searchParams)).toEqual({
      client_id: 'gh-client', redirect_uri: 'https://x/oauth2/idpresponse', state: 'st1', scope: GITHUB_SCOPES, allow_signup: 'true',
    })
  })

  it('exchanges the code and returns a signed ID token for the GitHub user', async () => {
    const fetch = github()
    const res = await handleGithubOidc(tokenRequest(GOOD), deps(fetch))
    expect(res.status).toBe(200)
    const body = await res.json() as { access_token: string; id_token: string; token_type: string }
    expect(body.access_token).toBe('gho_abc')
    expect(body.token_type).toBe('Bearer')
    const { ok, header, payload } = decode(body.id_token)
    expect(ok).toBe(true)
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })
    expect(payload).toEqual({
      iss: ISSUER, aud: 'gh-client', iat: NOW / 1000, exp: NOW / 1000 + 300,
      sub: '4242', name: 'Ash Tender', preferred_username: 'ember-bearer', email: 'ash@example.com', email_verified: true,
      picture: USER.avatar_url,
    })
    // The secret from Cognito is forwarded to GitHub as-is.
    const sent = new URLSearchParams(String((fetch.mock.calls[0][1] as RequestInit).body))
    expect(Object.fromEntries(sent)).toEqual({ client_id: 'gh-client', client_secret: 's3cret', code: 'c1', redirect_uri: GOOD.redirect_uri })
  })

  it('accepts client_secret_basic', async () => {
    const { client_id: _id, client_secret: _s, ...rest } = GOOD
    const basic = Buffer.from('gh-client:s3cret').toString('base64')
    const res = await handleGithubOidc(tokenRequest(rest, { Authorization: `Basic ${basic}` }), deps())
    expect(res.status).toBe(200)
  })

  it('refuses other clients, bad grants and codes GitHub rejects', async () => {
    expect((await handleGithubOidc(tokenRequest({ ...GOOD, client_id: 'someone-else' }), deps())).status).toBe(401)
    expect((await handleGithubOidc(tokenRequest({ ...GOOD, grant_type: 'refresh_token' }), deps())).status).toBe(400)
    const rejected = await handleGithubOidc(tokenRequest(GOOD), deps(github({ token: { error: 'bad_verification_code' } })))
    expect(rejected.status).toBe(400)
    expect((await rejected.json() as { error: string }).error).toBe('invalid_grant')
  })

  it('falls back to the login and the first verified email, and refuses accounts with none', async () => {
    const res = await handleGithubOidc(tokenRequest(GOOD), deps(github({
      user: { id: 7, login: 'quiet', name: null },
      emails: [{ email: 'unverified@example.com', primary: true, verified: false }, { email: 'v@example.com', primary: false, verified: true }],
    })))
    const { payload } = decode((await res.json() as { id_token: string }).id_token)
    expect(payload).toMatchObject({ sub: '7', name: 'quiet', email: 'v@example.com' })
    expect(payload.picture).toBeUndefined()

    const none = await handleGithubOidc(tokenRequest(GOOD), deps(github({ emails: [{ email: 'u@example.com', primary: true, verified: false }] })))
    expect(none.status).toBe(400)
    expect((await none.json() as { error: string }).error).toBe('access_denied')
  })

  it('serves userinfo for a GitHub access token', async () => {
    const res = await handleGithubOidc(new Request(`${ISSUER}/userinfo`, { headers: { Authorization: 'Bearer gho_abc' } }), deps())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sub: '4242', email: 'ash@example.com' })
    const bad = await handleGithubOidc(new Request(`${ISSUER}/userinfo`, { headers: { Authorization: 'Bearer nope' } }), deps())
    expect(bad.status).toBe(401)
    expect((await handleGithubOidc(new Request(`${ISSUER}/userinfo`), deps())).status).toBe(401)
  })

  it('publishes a JWKS that verifies its tokens, and discovery for its own URL', async () => {
    const jwks = await (await handleGithubOidc(new Request(`${ISSUER}/.well-known/jwks.json`), deps())).json() as { keys: Record<string, string>[] }
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).toMatchObject({ kid: 'test-key', alg: 'RS256', use: 'sig', kty: 'RSA' })
    const key = createPublicKey({ key: jwks.keys[0] as never, format: 'jwk' })
    const idToken = (await (await handleGithubOidc(tokenRequest(GOOD), deps())).json() as { id_token: string }).id_token
    const [h, p, s] = idToken.split('.')
    expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'))).toBe(true)

    const conf = await (await handleGithubOidc(new Request(`${ISSUER}/.well-known/openid-configuration`), deps())).json() as Record<string, string>
    expect(conf.issuer).toBe(ISSUER)
    expect(conf.token_endpoint).toBe(`${ISSUER}/token`)
    expect(conf.jwks_uri).toBe(`${ISSUER}/.well-known/jwks.json`)
  })

  it('404s unknown routes', async () => {
    expect((await handleGithubOidc(new Request(`${ISSUER}/nope`), deps())).status).toBe(404)
  })

  it('reads client credentials from either place', () => {
    const form = new URLSearchParams({ client_id: 'a', client_secret: 'b' })
    expect(clientCredentials(new Request(ISSUER), form)).toEqual({ id: 'a', secret: 'b' })
    const req = new Request(ISSUER, { headers: { Authorization: `Basic ${Buffer.from('x%3Ay:p:w').toString('base64')}` } })
    expect(clientCredentials(req, new URLSearchParams())).toEqual({ id: 'x:y', secret: 'p:w' })
    expect(clientCredentials(new Request(ISSUER), new URLSearchParams())).toBeNull()
  })
})
