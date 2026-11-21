import { describe, expect, it } from 'vitest'
import {
  authorizeUrl, base64url, checkIdToken, codeExchangeBody, decodeJwt, isExpiring, logoutUrl, pkceChallenge,
  randomString, readCallback, refreshBody, tokensFromResponse, userFromClaims, type AuthConfig,
} from './oauth.ts'

const cfg: AuthConfig = {
  domain: 'emberreach-login.auth.us-east-2.amazoncognito.com',
  clientId: 'client123',
  redirectUri: 'https://emberreach.morrisheap.com/',
}
const ISS = 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_AbCdEfGhI'
const NOW = 1_800_000_000_000

function jwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)))
  return `${enc({ alg: 'RS256', kid: 'k' })}.${enc(claims)}.signature`
}
const idClaims = { aud: 'client123', iss: ISS, exp: NOW / 1000 + 3600, nonce: 'n1', sub: 'abc', email: 'kes@example.com' }

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B example', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('makes URL-safe random strings of the right length from the injected RNG', () => {
    const s = randomString(32, a => a.fill(255))
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s).toHaveLength(43)
    expect(randomString(32)).not.toBe(randomString(32))
  })
})

describe('URLs', () => {
  it('builds the authorize URL with code + PKCE S256, state and nonce', () => {
    const u = new URL(authorizeUrl(cfg, { state: 's1', nonce: 'n1', challenge: 'c1' }))
    expect(u.origin + u.pathname).toBe(`https://${cfg.domain}/oauth2/authorize`)
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: 'code', client_id: 'client123', redirect_uri: cfg.redirectUri, scope: 'openid email profile',
      state: 's1', nonce: 'n1', code_challenge: 'c1', code_challenge_method: 'S256',
    })
  })
  it('opens the create-account page with the same OAuth parameters', () => {
    const p = { state: 's1', nonce: 'n1', challenge: 'c1' }
    const u = new URL(authorizeUrl(cfg, { ...p, screen: 'signup' }))
    expect(u.origin + u.pathname).toBe(`https://${cfg.domain}/signup`)
    expect(u.search).toBe(new URL(authorizeUrl(cfg, p)).search)
    expect(new URL(authorizeUrl(cfg, { ...p, screen: 'signin' })).pathname).toBe('/oauth2/authorize')
  })
  it('builds the logout URL back to the app', () => {
    const u = new URL(logoutUrl(cfg))
    expect(u.pathname).toBe('/logout')
    expect(u.searchParams.get('logout_uri')).toBe(cfg.redirectUri)
    expect(u.searchParams.get('client_id')).toBe('client123')
  })
  it('builds token request bodies', () => {
    expect(Object.fromEntries(codeExchangeBody(cfg, 'code1', 'ver1'))).toEqual({
      grant_type: 'authorization_code', client_id: 'client123', code: 'code1', redirect_uri: cfg.redirectUri, code_verifier: 'ver1',
    })
    expect(Object.fromEntries(refreshBody(cfg, 'r1'))).toEqual({ grant_type: 'refresh_token', client_id: 'client123', refresh_token: 'r1' })
  })
})

describe('readCallback', () => {
  it('reads code and state', () => expect(readCallback('?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' }))
  it('reads errors', () => expect(readCallback('?error=access_denied&error_description=Nope')).toEqual({ error: 'Nope' }))
  it('ignores normal page loads', () => {
    expect(readCallback('')).toBeNull()
    expect(readCallback('?code=abc')).toBeNull()
  })
})

describe('tokens', () => {
  it('reads a token response and computes expiry', () => {
    const t = tokensFromResponse({ access_token: 'a', id_token: 'i', refresh_token: 'r', expires_in: 3600 }, NOW)
    expect(t).toEqual({ accessToken: 'a', idToken: 'i', refreshToken: 'r', expiresAt: NOW + 3_600_000 })
  })
  it('keeps the old refresh token on refresh', () => {
    expect(tokensFromResponse({ access_token: 'a', id_token: 'i', expires_in: 60 }, NOW, 'old').refreshToken).toBe('old')
  })
  it('rejects a response without tokens', () => {
    expect(() => tokensFromResponse({ error: 'invalid_grant' }, NOW)).toThrow(/no tokens/)
  })
  it('treats a token as expiring a minute early', () => {
    const t = { accessToken: 'a', idToken: 'i', expiresAt: NOW + 30_000 }
    expect(isExpiring(t, NOW)).toBe(true)
    expect(isExpiring({ ...t, expiresAt: NOW + 120_000 }, NOW)).toBe(false)
  })
})

describe('ID token', () => {
  it('decodes unicode claims', () => expect(decodeJwt(jwt({ name: 'Késtrel 🔥' })).name).toBe('Késtrel 🔥'))

  it('accepts a good token and returns the user', () => {
    expect(checkIdToken(jwt(idClaims), cfg, { nonce: 'n1', now: NOW })).toEqual({ sub: 'abc', name: 'kes', email: 'kes@example.com', picture: undefined })
  })
  it.each([
    ['another audience', { aud: 'other' }, /another app/],
    ['a foreign issuer', { iss: 'https://evil.example/pool' }, /issuer/],
    ['an expired token', { exp: NOW / 1000 - 1 }, /expired/],
    ['a different nonce', { nonce: 'n2' }, /nonce/],
  ])('rejects %s', (_, override, err) => {
    expect(() => checkIdToken(jwt({ ...idClaims, ...override }), cfg, { nonce: 'n1', now: NOW })).toThrow(err)
  })

  it('prefers the display name and keeps only https pictures', () => {
    expect(userFromClaims({ sub: 'x', name: 'Kestrel Ashvane', picture: 'https://lh3.example/p.png' }))
      .toEqual({ sub: 'x', name: 'Kestrel Ashvane', email: undefined, picture: 'https://lh3.example/p.png' })
    expect(userFromClaims({ sub: 'x', picture: 'javascript:alert(1)' }).picture).toBeUndefined()
    expect(userFromClaims({ sub: 'x' }).name).toBe('Adventurer')
  })
})
