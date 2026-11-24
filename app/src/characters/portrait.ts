// Hero portraits (VTTER-55, docs/adr/0003-backend-dynamodb-lambda.md). The image sits in a private bucket: the API
// hands this player short-lived signed URLs, so there is never a public link to keep or to leak.
import character from '../../../data/character.json'
import { call } from '../api/client.ts'
import { ApiError } from '../api/request.ts'

const { contentTypes, maxBytes } = character.portrait

export const PORTRAIT_ACCEPT = contentTypes.join(',')

/** What is wrong with a file before it is sent, or null if it is fine. Mirrors the API's limits. */
export function portraitFileError(file: { type: string; size: number }): string | null {
  if (!contentTypes.includes(file.type)) return 'Use a PNG, JPEG or WebP image.'
  if (file.size < 1) return 'That file is empty.'
  if (file.size > maxBytes) return `That image is ${(file.size / 1048576).toFixed(1)} MB. The most is ${maxBytes / 1048576} MB.`
  return null
}

interface Upload { url: string; headers: Record<string, string> }

export const portraitApi = {
  /** A signed read URL, or null when the hero has no portrait. */
  async url(heroId: string): Promise<string | null> {
    try {
      return (await call<{ url: string }>('GET', `/characters/${encodeURIComponent(heroId)}/portrait`)).url
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },
  async upload(heroId: string, file: File): Promise<void> {
    const bad = portraitFileError(file)
    if (bad) throw new ApiError(bad, 400)
    const signed = await call<Upload>('POST', `/characters/${encodeURIComponent(heroId)}/portrait`, { contentType: file.type, size: file.size })
    let res: Response
    // The browser sets Content-Length itself, from the body.
    try { res = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }) }
    catch { throw new ApiError("Can't reach the image store. Check your connection.", 0) }
    if (!res.ok) throw new ApiError(`The image was not saved (${res.status}). Try again.`, res.status)
  },
  remove: (heroId: string) => call<void>('DELETE', `/characters/${encodeURIComponent(heroId)}/portrait`),
}
