// OAuth 2.0 authorization code + PKCE against Cognito managed login, and the OIDC ID token checks
// (docs/adr/0004-auth-cognito.md, VTTER-53). Pure functions: no storage, no redirects, no network.
// The browser side (session storage, fetch, redirects) is in session.ts.

export interface AuthConfig {
  /** Cognito domain without scheme, e.g. emberreach-login.auth.us-east-2.amazoncognito.com */
  domain: string
  clientId: string
  /** Exact URL registered on the app client for sign-in and sign-out redirects (includes the Vite base). */
  redirectUri: string
}

export interface Tokens {
  accessToken: string
  idToken: string
  refreshToken?: string
  /** Epoch ms when the access token expires. */
  expiresAt: number
}

export interface User {
  sub: string
  name: string
  email?: string
  picture?: string
}

export const SCOPES = 'openid email profile'

/** base64url without padding (RFC 7636). */
export function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A random URL-safe string: the PKCE code verifier, `state` and `nonce`. */
export function randomString(
  bytes = 32,
  fill: (a: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = a => crypto.getRandomValues(a),
): string {
  return base64url(fill(new Uint8Array(bytes)))
}

/** PKCE S256 code challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/**
 * The managed login URL. `screen: 'signup'` opens the create-account form (Cognito's /signup page, which takes
 * the same OAuth parameters and returns through the same code + PKCE redirect).
 */
export function authorizeUrl(
  cfg: AuthConfig,
  p: { state: string; nonce: string; challenge: string; screen?: 'signin' | 'signup' },
): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  })
  return `https://${cfg.domain}/${p.screen === 'signup' ? 'signup' : 'oauth2/authorize'}?${q}`
}

/** Ends the Cognito managed login session, then returns to the app. */
export function logoutUrl(cfg: AuthConfig): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, logout_uri: cfg.redirectUri })
  return `https://${cfg.domain}/logout?${q}`
}

export type Callback = { code: string; state: string } | { error: string } | null

/** Reads `?code=&state=` (or `?error=`) that Cognito appends to the redirect URI. Null if this isn't a callback. */
export function readCallback(search: string): Callback {
  const q = new URLSearchParams(search)
  const error = q.get('error')
  if (error) return { error: q.get('error_description') || error }
  const code = q.get('code')
  const state = q.get('state')
  return code && state ? { code, state } : null
}

export function codeExchangeBody(cfg: AuthConfig, code: string, verifier: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code', client_id: cfg.clientId, code, redirect_uri: cfg.redirectUri, code_verifier: verifier,
  })
}

export function refreshBody(cfg: AuthConfig, refreshToken: string): URLSearchParams {
  return new URLSearchParams({ grant_type: 'refresh_token', client_id: cfg.clientId, refresh_token: refreshToken })
}

/** Tokens from a /oauth2/token response. A refresh response has no new refresh token, so the old one is kept. */
export function tokensFromResponse(body: unknown, now: number, previousRefresh?: string): Tokens {
  const b = body as Record<string, unknown>
  if (typeof b?.access_token !== 'string' || typeof b.id_token !== 'string') throw new Error('Sign-in failed: no tokens returned')
  const expiresIn = typeof b.expires_in === 'number' ? b.expires_in : 3600
  return {
    accessToken: b.access_token,
    idToken: b.id_token,
    refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : previousRefresh,
    expiresAt: now + expiresIn * 1000,
  }
}

/** True when the access token expires within `skewMs` (default 1 minute). */
export function isExpiring(t: Tokens, now: number, skewMs = 60_000): boolean {
  return t.expiresAt - skewMs <= now
}

/** A JWT's payload. Doesn't check the signature: the API verifies every access token it receives. */
export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('Not a JWT')
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
}

/**
 * OIDC checks on an ID token received straight from the token endpoint over TLS: audience, issuer host,
 * expiry and the nonce we sent. Returns the user to show in the header.
 */
export function checkIdToken(idToken: string, cfg: AuthConfig, opts: { nonce?: string; now: number }): User {
  const c = decodeJwt(idToken)
  if (c.aud !== cfg.clientId) throw new Error('Sign-in failed: token is for another app')
  if (typeof c.iss !== 'string' || !/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[\w-]+$/.test(c.iss)) {
    throw new Error('Sign-in failed: unexpected token issuer')
  }
  if (typeof c.exp !== 'number' || c.exp * 1000 <= opts.now) throw new Error('Sign-in failed: token expired')
  if (opts.nonce !== undefined && c.nonce !== opts.nonce) throw new Error('Sign-in failed: nonce mismatch')
  return userFromClaims(c)
}

export function userFromClaims(c: Record<string, unknown>): User {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const email = str(c.email)
  return {
    sub: String(c.sub),
    name: str(c.name) ?? str(c.given_name) ?? str(c.preferred_username) ?? email?.split('@')[0] ?? 'Adventurer',
    email,
    picture: str(c.picture)?.startsWith('https://') ? str(c.picture) : undefined,
  }
}
