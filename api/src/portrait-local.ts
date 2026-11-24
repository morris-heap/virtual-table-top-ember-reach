// Local-only PortraitStore for `npm run dev` when no PORTRAIT_BUCKET is set (VTTER-55). Images are kept in memory
// and served by the dev server itself, so the upload UI can be tried with no S3 bucket. Never used in the Lambda.
import { PORTRAIT, portraitKey, type PortraitStore, type PortraitUpload } from './portrait.ts'

export class LocalPortraitStore implements PortraitStore {
  private images = new Map<string, { type: string; bytes: Buffer }>()
  constructor(private base: string) {}

  async uploadUrl(ownerId: string, heroId: string, _upload: PortraitUpload) {
    return `${this.base}/_portraits/${portraitKey(ownerId, heroId)}`
  }
  async downloadUrl(ownerId: string, heroId: string) {
    const key = portraitKey(ownerId, heroId)
    return this.images.has(key) ? `${this.base}/_portraits/${key}` : null
  }
  async delete(ownerId: string, heroId: string) {
    this.images.delete(portraitKey(ownerId, heroId))
  }

  /** The dev server's stand-in for S3. Returns [status, content type, body]. */
  serve(method: string, key: string, type: string, body: Buffer): [number, string, Buffer] {
    if (method === 'PUT') {
      if (!PORTRAIT.contentTypes.includes(type) || body.length < 1 || body.length > PORTRAIT.maxBytes) return [400, 'text/plain', Buffer.from('Rejected')]
      this.images.set(key, { type, bytes: body })
      return [200, 'text/plain', Buffer.alloc(0)]
    }
    const image = this.images.get(key)
    return image ? [200, image.type, image.bytes] : [404, 'text/plain', Buffer.from('Not found')]
  }
}
