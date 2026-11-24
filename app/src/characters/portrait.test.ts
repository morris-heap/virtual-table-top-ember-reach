import { describe, expect, it } from 'vitest'
import character from '../../../data/character.json'
import { coverCrop, portraitFileError } from './portrait.ts'

const { sourceMaxBytes, width, height } = character.portrait

describe('portraitFileError', () => {
  it('accepts the source types up to the size limit', () => {
    for (const type of character.portrait.sourceTypes) expect(portraitFileError({ type, size: sourceMaxBytes })).toBeNull()
  })
  it('rejects other types, including SVG and HTML', () => {
    for (const type of ['image/svg+xml', 'text/html', 'image/gif', '']) expect(portraitFileError({ type, size: 10 })).toMatch(/PNG, JPEG or WebP/)
  })
  it('rejects empty and oversized files', () => {
    expect(portraitFileError({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(portraitFileError({ type: 'image/png', size: sourceMaxBytes + 1 })).toMatch(/The most is 10 MB/)
  })
})

describe('coverCrop', () => {
  it('keeps the whole image when it already has the frame shape', () => {
    expect(coverCrop(512, 682, width, height)).toEqual({ x: 0, y: 0, w: 512, h: 682 })
  })
  it('crops the sides of a wide image, centred', () => {
    const c = coverCrop(1000, 341, width, height)
    expect([c.w, c.h, c.y]).toEqual([256, 341, 0])
    expect(c.x).toBe(372)
  })
  it('crops the top and bottom of a tall image, centred', () => {
    const c = coverCrop(256, 1000, width, height)
    expect([c.w, c.h, c.x]).toEqual([256, 341, 0])
    expect(c.y).toBe(329)
  })
  it('never asks for more than the image has, even when it is smaller than the frame', () => {
    const c = coverCrop(100, 100, width, height)
    expect(c.x + c.w).toBeLessThanOrEqual(100)
    expect(c.y + c.h).toBeLessThanOrEqual(100)
  })
})
