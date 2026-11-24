import type { PortraitStore, PortraitUpload } from '../src/portrait.ts'

/** In-memory PortraitStore. `urls` records what was signed, so tests can check keys and sizes. */
export class MemoryPortraits implements PortraitStore {
  objects = new Set<string>()
  uploads: Array<{ ownerId: string; heroId: string } & PortraitUpload> = []
  async uploadUrl(ownerId: string, heroId: string, upload: PortraitUpload) {
    this.uploads.push({ ownerId, heroId, ...upload })
    this.objects.add(`${ownerId}/${heroId}`)
    return `https://bucket.test/${ownerId}/${heroId}?sig=put`
  }
  async downloadUrl(ownerId: string, heroId: string) {
    return this.objects.has(`${ownerId}/${heroId}`) ? `https://bucket.test/${ownerId}/${heroId}?sig=get` : null
  }
  async delete(ownerId: string, heroId: string) {
    this.objects.delete(`${ownerId}/${heroId}`)
  }
}
