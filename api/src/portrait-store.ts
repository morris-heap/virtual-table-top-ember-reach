// S3 implementation of PortraitStore. The bucket is private; access is only through these signed URLs.
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { DatabaseUnavailable } from './handler.ts'
import { PORTRAIT, portraitKey, type PortraitStore, type PortraitUpload } from './portrait.ts'

export class S3PortraitStore implements PortraitStore {
  constructor(private s3: S3Client, private bucket: string) {}

  async uploadUrl(ownerId: string, heroId: string, { contentType, size }: PortraitUpload) {
    // Content-Type and Content-Length are signed, so the upload must match what the API approved.
    const cmd = new PutObjectCommand({
      Bucket: this.bucket, Key: portraitKey(ownerId, heroId), ContentType: contentType, ContentLength: size,
    })
    return getSignedUrl(this.s3, cmd, {
      expiresIn: PORTRAIT.urlSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    })
  }

  async downloadUrl(ownerId: string, heroId: string) {
    const Key = portraitKey(ownerId, heroId)
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key }))
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return null
      throw new DatabaseUnavailable()
    }
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key }), { expiresIn: PORTRAIT.urlSeconds })
  }

  async list(ownerId: string) {
    const prefix = `${ownerId}/`
    const out = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 200 }))
    const urls: Record<string, string> = {}
    await Promise.all((out.Contents ?? []).map(async ({ Key }) => {
      if (!Key?.startsWith(prefix)) return
      urls[Key.slice(prefix.length)] = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key }), { expiresIn: PORTRAIT.urlSeconds })
    }))
    return urls
  }

  async delete(ownerId: string, heroId: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: portraitKey(ownerId, heroId) }))
  }
}
