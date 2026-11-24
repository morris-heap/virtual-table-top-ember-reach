import { describe, expect, it } from 'vitest'
import character from '../../../data/character.json'
import { portraitFileError } from './portrait.ts'

const { maxBytes } = character.portrait

describe('portraitFileError', () => {
  it('accepts the allowed types up to the size limit', () => {
    for (const type of character.portrait.contentTypes) expect(portraitFileError({ type, size: maxBytes })).toBeNull()
  })
  it('rejects other types, including SVG and HTML', () => {
    for (const type of ['image/svg+xml', 'text/html', 'image/gif', '']) expect(portraitFileError({ type, size: 10 })).toMatch(/PNG, JPEG or WebP/)
  })
  it('rejects empty and oversized files', () => {
    expect(portraitFileError({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(portraitFileError({ type: 'image/png', size: maxBytes + 1 })).toMatch(/The most is 1 MB/)
  })
})
