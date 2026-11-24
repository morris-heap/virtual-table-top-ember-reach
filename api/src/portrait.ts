// Hero portraits (VTTER-55). The image lives in a private S3 bucket under `<ownerId>/<heroId>`; the browser
// sends and fetches it with short-lived signed URLs that this API only hands to the hero's owner.
import character from '../../data/character.json'
import { ValidationError } from './sheet.ts'

export const PORTRAIT = character.portrait

export interface PortraitUpload {
  contentType: string
  size: number
}

export interface PortraitStore {
  /** A signed PUT URL for exactly this content type and size. */
  uploadUrl(ownerId: string, heroId: string, upload: PortraitUpload): Promise<string>
  /** A signed GET URL, or null if the hero has no portrait. */
  downloadUrl(ownerId: string, heroId: string): Promise<string | null>
  delete(ownerId: string, heroId: string): Promise<void>
}

/** The S3 key. The owner id comes from the verified token, so no one can name another player's prefix. */
export function portraitKey(ownerId: string, heroId: string): string {
  return `${ownerId}/${heroId}`
}

export function parsePortraitUpload(body: unknown): PortraitUpload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body must be an object')
  const { contentType, size } = body as Record<string, unknown>
  if (typeof contentType !== 'string' || !PORTRAIT.contentTypes.includes(contentType)) {
    throw new ValidationError(`contentType must be one of ${PORTRAIT.contentTypes.join(', ')}`)
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > PORTRAIT.maxBytes) {
    throw new ValidationError(`size must be a whole number of bytes, 1 to ${PORTRAIT.maxBytes}`)
  }
  return { contentType, size }
}
