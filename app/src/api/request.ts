// Pure helpers for talking to the API. Kept free of config and browser globals so they are unit-testable.

export class ApiError extends Error {
  retryAfter = 5000
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function request<T>(url: string, method: string, token: (force?: boolean) => Promise<string | null>, body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const access = await token(attempt === 1)
    if (!access) throw new ApiError('Your session expired. Sign in again.', 401)
    let res: Response
    try { res = await fetcher(url, jsonInit(method, access, body)) }
    catch { throw new ApiError("Can't reach the server. Check your connection.", 0) }
    if (res.status === 401 && attempt === 0) continue
    if (!res.ok) {
      const error = new ApiError(res.status === 401 ? 'Your session expired. Sign in again.' : await errorMessage(res), res.status)
      const retry = res.headers.get('Retry-After')
      if (retry) {
        const ms = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
        if (Number.isFinite(ms)) error.retryAfter = Math.max(1000, ms)
      }
      throw error
    }
    return res.status === 204 ? undefined as T : await res.json() as T
  }
  throw new ApiError('Your session expired. Sign in again.', 401)
}

/** fetch options for a call with a bearer token and an optional JSON body. */
export function jsonInit(method: string, token: string, body?: unknown): RequestInit {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }
}

/** The API's `{ "error": "..." }` message if it sent one, otherwise a generic line for the status. */
export async function errorMessage(res: Pick<Response, 'status' | 'json'>): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error) return body.error
  } catch {
    // Not JSON: fall through.
  }
  if (res.status === 401) return 'Your session expired. Sign in again.'
  if (res.status === 503) return 'The server is busy. Try again in a moment.'
  return `Something went wrong (${res.status}).`
}
