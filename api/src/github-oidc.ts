// GitHub sign-in for Cognito (VTTER-62). GitHub's OAuth isn't OpenID Connect: it has no ID token, discovery
// document or JWKS. This small OIDC provider sits between Cognito and GitHub:
//   GET  /authorize                          302 to GitHub's authorize page, with GitHub's scopes
//   POST /token                              exchanges the code with GitHub, returns its access token + a signed ID token
//   GET  /userinfo                           the GitHub user as OIDC claims (Bearer = GitHub access token)
//   GET  /.well-known/jwks.json              the public key for the ID token signature
//   GET  /.well-known/openid-configuration   discovery
// Pure: fetch and the signer are injected. The GitHub client secret is never stored here: Cognito sends it with
// each /token call, and it's forwarded to GitHub. The issuer is this API's own URL, taken from the request.

export const GITHUB = {
  authorize: 'https://github.com/login/oauth/authorize',
  token: 'https://github.com/login/oauth/access_token',
  api: 'https://api.github.com',
} as const

/** What we ask GitHub for: the profile and the (private) email addresses. */
export const GITHUB_SCOPES = 'read:user user:email'

/** Signs ID tokens with RS256. Production uses a KMS key (github-oidc-lambda.ts); tests inject a local key. */
export interface Signer {
  kid: string
  /** RSASSA-PKCS1-v1_5 SHA-256 signature over the bytes. */
  sign(data: Uint8Array): Promise<Uint8Array>
  /** The public key as a JWK (kty, n, e). */
  publicJwk(): Promise<Record<string, unknown>>
}

export interface GithubOidcDeps {
  /** The GitHub OAuth app's client id. Only this client may use /token. */
  clientId: string
  signer: Signer
  fetch: typeof fetch
  now: () => number
}

export interface Claims {
  sub: string
  name: string
  preferred_username: string
  email: string
  email_verified: true
  picture?: string
}

const ID_TOKEN_TTL_S = 300
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
const oauthError = (status: number, error: string, description: string) =>
  json(status, { error, error_description: description })

function b64url(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString('base64url')
}

/** A signed RS256 JWT. */
export async function signJwt(signer: Signer, payload: Record<string, unknown>): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: signer.kid }))
  const body = b64url(JSON.stringify(payload))
  const sig = await signer.sign(new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(sig)}`
}

class GithubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function githubApi<T>(deps: GithubOidcDeps, token: string, path: string): Promise<T> {
  const res = await deps.fetch(`${GITHUB.api}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'emberreach-github-oidc',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (res.status === 401) throw new GithubError(401, 'GitHub rejected the access token')
  if (!res.ok) throw new GithubError(502, `GitHub ${path} returned ${res.status}`)
  return (await res.json()) as T
}

interface GithubUser { id: number; login: string; name: string | null; avatar_url?: string }
interface GithubEmail { email: string; primary: boolean; verified: boolean }

/**
 * The GitHub user as OIDC claims. `sub` is GitHub's numeric user id (stable across username changes).
 * The email is the primary address if it's verified, else the first verified one. Accounts need an email
 * (it's required in the user pool), so a GitHub account with no verified email can't sign in.
 */
export async function githubClaims(deps: GithubOidcDeps, token: string): Promise<Claims> {
  const [user, emails] = await Promise.all([
    githubApi<GithubUser>(deps, token, '/user'),
    githubApi<GithubEmail[]>(deps, token, '/user/emails'),
  ])
  const verified = emails.filter(e => e.verified)
  const email = (verified.find(e => e.primary) ?? verified[0])?.email
  if (!email) throw new GithubError(403, 'Your GitHub account has no verified email address')
  const avatar = user.avatar_url?.startsWith('https://') ? user.avatar_url : undefined
  return {
    sub: String(user.id),
    name: user.name?.trim() || user.login,
    preferred_username: user.login,
    email,
    email_verified: true,
    ...(avatar ? { picture: avatar } : {}),
  }
}

/** Client credentials from `client_secret_basic` (Authorization header) or `client_secret_post` (form body). */
export function clientCredentials(req: Request, form: URLSearchParams): { id: string; secret: string } | null {
  const basic = /^Basic\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (basic) {
    const raw = Buffer.from(basic[1], 'base64').toString('utf8')
    const i = raw.indexOf(':')
    if (i < 0) return null
    return { id: decodeURIComponent(raw.slice(0, i)), secret: decodeURIComponent(raw.slice(i + 1)) }
  }
  const id = form.get('client_id')
  const secret = form.get('client_secret')
  return id && secret ? { id, secret } : null
}

async function token(req: Request, deps: GithubOidcDeps, issuer: string): Promise<Response> {
  const form = new URLSearchParams(await req.text())
  if (form.get('grant_type') !== 'authorization_code') return oauthError(400, 'unsupported_grant_type', 'Only authorization_code')
  const code = form.get('code')
  if (!code) return oauthError(400, 'invalid_request', 'Missing code')
  const client = clientCredentials(req, form)
  if (!client || client.id !== deps.clientId) return oauthError(401, 'invalid_client', 'Unknown client')

  const gh = await deps.fetch(GITHUB.token, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      ...(form.get('redirect_uri') ? { redirect_uri: form.get('redirect_uri')! } : {}),
    }),
  })
  const ghBody = (await gh.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string }
  if (!gh.ok || !ghBody.access_token) {
    // GitHub answers 200 with { error } for a bad code or secret.
    const bad = ghBody.error === 'incorrect_client_credentials' ? 'invalid_client' : 'invalid_grant'
    return oauthError(400, bad, ghBody.error_description ?? 'GitHub refused the code')
  }

  const claims = await githubClaims(deps, ghBody.access_token)
  const iat = Math.floor(deps.now() / 1000)
  const idToken = await signJwt(deps.signer, { iss: issuer, aud: client.id, iat, exp: iat + ID_TOKEN_TTL_S, ...claims })
  return json(200, { access_token: ghBody.access_token, token_type: 'Bearer', expires_in: 3600, id_token: idToken })
}

async function userinfo(req: Request, deps: GithubOidcDeps): Promise<Response> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!bearer) return json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer' })
  return json(200, await githubClaims(deps, bearer[1]))
}

/** Sends Cognito's authorize request on to GitHub, swapping the OIDC scopes for GitHub's. */
function authorize(url: URL): Response {
  const q = new URLSearchParams()
  for (const key of ['client_id', 'redirect_uri', 'state']) {
    const v = url.searchParams.get(key)
    if (v) q.set(key, v)
  }
  q.set('scope', GITHUB_SCOPES)
  q.set('allow_signup', 'true')
  return new Response(null, { status: 302, headers: { Location: `${GITHUB.authorize}?${q}`, 'Cache-Control': 'no-store' } })
}

export function discovery(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'name', 'preferred_username', 'email', 'email_verified', 'picture'],
  }
}

export async function handleGithubOidc(req: Request, deps: GithubOidcDeps): Promise<Response> {
  const url = new URL(req.url)
  const issuer = url.origin
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`
  try {
    switch (route) {
      case 'GET /authorize': return authorize(url)
      case 'POST /token': return await token(req, deps, issuer)
      case 'GET /userinfo':
      case 'POST /userinfo': return await userinfo(req, deps)
      case 'GET /.well-known/jwks.json':
        return json(200, { keys: [{ ...(await deps.signer.publicJwk()), kid: deps.signer.kid, use: 'sig', alg: 'RS256' }] },
          { 'Cache-Control': 'public, max-age=3600' })
      case 'GET /.well-known/openid-configuration':
        return json(200, discovery(issuer), { 'Cache-Control': 'public, max-age=3600' })
      default: return json(404, { error: 'not_found' })
    }
  } catch (e) {
    if (e instanceof GithubError) {
      return e.status === 401
        ? json(401, { error: 'invalid_token', error_description: e.message }, { 'WWW-Authenticate': 'Bearer' })
        : oauthError(e.status === 403 ? 400 : 502, e.status === 403 ? 'access_denied' : 'server_error', e.message)
    }
    console.error('github-oidc failed', e)
    return oauthError(500, 'server_error', 'Unexpected error')
  }
}
