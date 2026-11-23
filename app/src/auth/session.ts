// Browser side of sign-in (VTTER-53): redirects to Cognito managed login, finishes the code exchange on
// return, keeps tokens in sessionStorage (cleared when the tab closes; Cognito's own session cookie makes the
// next sign-in one click), refreshes the access token, and signs out.
import {
  authorizeUrl, checkIdToken, codeExchangeBody, isExpiring, logoutUrl, pkceChallenge, randomString, readCallback,
  refreshBody, tokensFromResponse, userFromClaims, decodeJwt, type AuthConfig, type SocialProvider, type Tokens, type User,
} from './oauth.ts'
import { ApiError } from '../api/request.ts'

const TOKENS = 'emberreach.auth.tokens'
const PENDING = 'emberreach.auth.pending'

interface Pending { state: string; nonce: string; verifier: string }

function load<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function store(key: string, value: unknown | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private mode): sign-in still works for this page load.
  }
}

async function tokenRequest(cfg: AuthConfig, body: URLSearchParams): Promise<unknown> {
  const res = await fetch(`https://${cfg.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => { throw new ApiError("Can't reach sign-in. Will retry when connected.", 0) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(`Sign-in failed: ${(json as { error?: string }).error ?? res.status}`, res.status)
  return json
}

/**
 * Sends the browser to the managed login page: the sign-in form, or the create-account form with
 * `screen: 'signup'`, or straight to a social provider. Either way Cognito returns to the app with a code.
 */
export async function signIn(
  cfg: AuthConfig, screen: 'signin' | 'signup' = 'signin', provider?: SocialProvider,
): Promise<void> {
  const pending: Pending = { state: randomString(), nonce: randomString(), verifier: randomString(48) }
  store(PENDING, pending)
  const challenge = await pkceChallenge(pending.verifier)
  window.location.assign(authorizeUrl(cfg, { ...pending, challenge, screen, provider }))
}

let completing: Promise<User | null> | null = null

/**
 * Call once on load. Finishes a sign-in if Cognito just redirected back with a code, removes the code from the
 * address bar, and returns the signed-in user (or null). Safe to call twice (React StrictMode).
 */
export function completeSignIn(cfg: AuthConfig): Promise<User | null> {
  completing ??= (async () => {
    const cb = readCallback(window.location.search)
    if (!cb) return currentUser()
    window.history.replaceState(null, '', cfg.redirectUri) // never leave the code in history
    const pending = load<Pending>(PENDING)
    store(PENDING, null)
    if ('error' in cb) throw new Error(`Sign-in cancelled or failed: ${cb.error}`)
    if (!pending || pending.state !== cb.state) throw new Error('Sign-in failed: state mismatch. Try again.')
    const now = Date.now()
    const tokens = tokensFromResponse(await tokenRequest(cfg, codeExchangeBody(cfg, cb.code, pending.verifier)), now)
    const user = checkIdToken(tokens.idToken, cfg, { nonce: pending.nonce, now })
    store(TOKENS, tokens)
    return user
  })()
  return completing
}

export function currentUser(): User | null {
  const t = load<Tokens>(TOKENS)
  if (!t) return null
  try {
    return userFromClaims(decodeJwt(t.idToken))
  } catch {
    return null
  }
}

/** A valid access token for the API, refreshed if it's about to expire. Null when signed out. */
let refreshing: Promise<string | null> | undefined
export async function getAccessToken(cfg: AuthConfig, force = false): Promise<string | null> {
  if (refreshing) return refreshing
  const t = load<Tokens>(TOKENS)
  if (!t) return null
  if (!force && !isExpiring(t, Date.now())) return t.accessToken
  if (!t.refreshToken) {
    return null
  }
  const refreshToken = t.refreshToken
  refreshing = (async () => { try {
    const fresh = tokensFromResponse(await tokenRequest(cfg, refreshBody(cfg, refreshToken)), Date.now(), refreshToken)
    if (load<Tokens>(TOKENS)?.refreshToken !== t.refreshToken) return null
    store(TOKENS, fresh)
    return fresh.accessToken
  } catch (error) {
    // Retain account identity and pending edits until an explicit sign-out. A network failure is not logout.
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) throw error
    return null
  } finally { refreshing = undefined } })()
  return refreshing
}

/** Revokes the refresh token, clears local tokens, and ends the managed login session. */
export async function signOut(cfg: AuthConfig): Promise<void> {
  const t = load<Tokens>(TOKENS)
  store(TOKENS, null)
  if (t?.refreshToken) {
    await fetch(`https://${cfg.domain}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.refreshToken, client_id: cfg.clientId }),
    }).catch(() => {})
  }
  window.location.assign(logoutUrl(cfg))
}
