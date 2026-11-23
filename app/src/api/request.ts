// Pure helpers for talking to the API. Kept free of config and browser globals so they are unit-testable.

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
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
