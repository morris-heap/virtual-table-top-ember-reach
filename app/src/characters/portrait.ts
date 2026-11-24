// Hero portraits (VTTER-55, docs/adr/0003-backend-dynamodb-lambda.md). The image sits in a private bucket: the API
// hands this player short-lived signed URLs, so there is never a public link to keep or to leak. The app shrinks
// every image to the size in data/character.json before it is sent.
import character from '../../../data/character.json'
import { call } from '../api/client.ts'
import { ApiError } from '../api/request.ts'

const P = character.portrait

export const PORTRAIT_ACCEPT = P.sourceTypes.join(',')

/** What is wrong with a chosen file before it is read, or null if it is fine. */
export function portraitFileError(file: { type: string; size: number }): string | null {
  if (!P.sourceTypes.includes(file.type)) return 'Use a PNG, JPEG or WebP image.'
  if (file.size < 1) return 'That file is empty.'
  if (file.size > P.sourceMaxBytes) return `That image is ${(file.size / 1048576).toFixed(1)} MB. The most is ${P.sourceMaxBytes / 1048576} MB.`
  return null
}

/** The part of a source image to keep so it fills the frame with no stretching: a centred crop of the frame's shape. */
export function coverCrop(srcW: number, srcH: number, frameW: number, frameH: number) {
  const scale = Math.max(frameW / srcW, frameH / srcH)
  const w = Math.min(srcW, Math.round(frameW / scale))
  const h = Math.min(srcH, Math.round(frameH / scale))
  return { x: Math.floor((srcW - w) / 2), y: Math.floor((srcH - h) / 2), w, h }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
}

/** Crops to the portrait frame, scales down, and encodes as WebP (JPEG where the browser cannot) under the size limit. */
export async function resizePortrait(file: File): Promise<Blob> {
  const bad = portraitFileError(file)
  if (bad) throw new ApiError(bad, 400)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new ApiError('That file is not an image this browser can open.', 400) }
  const canvas = document.createElement('canvas')
  canvas.width = P.width
  canvas.height = P.height
  const crop = coverCrop(bitmap.width, bitmap.height, P.width, P.height)
  canvas.getContext('2d')!.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, P.width, P.height)
  bitmap.close()
  for (const type of P.contentTypes) {
    for (const quality of [0.9, 0.8, 0.7, 0.55, 0.4]) {
      const blob = await toBlob(canvas, type, quality)
      if (!blob || blob.type !== type) break // this browser cannot encode that type: try the next
      if (blob.size <= P.maxBytes) return blob
    }
  }
  throw new ApiError('That image could not be made small enough. Try a simpler one.', 400)
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
  /** Signed read URLs for all of your heroes that have one, keyed by hero id (for the hero lists). */
  async urls(): Promise<Record<string, string>> {
    return (await call<{ portraits: Record<string, string> }>('GET', '/portraits')).portraits
  },
  async upload(heroId: string, file: File): Promise<void> {
    const image = await resizePortrait(file)
    const signed = await call<Upload>('POST', `/characters/${encodeURIComponent(heroId)}/portrait`, { contentType: image.type, size: image.size })
    let res: Response
    // The browser sets Content-Length itself, from the body.
    try { res = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': image.type }, body: image }) }
    catch { throw new ApiError('Cannot reach the image store. Check your connection.', 0) }
    if (!res.ok) throw new ApiError(`The image was not saved (${res.status}). Try again.`, res.status)
  },
  remove: (heroId: string) => call<void>('DELETE', `/characters/${encodeURIComponent(heroId)}/portrait`),
}
