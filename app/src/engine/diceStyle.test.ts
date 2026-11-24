import { describe, expect, it } from 'vitest'
import {
  BODY_PRESETS, contrastRatio, DEFAULT_STYLE, defaultSettings, lowContrast, NUMBER_PRESETS, sanitizeSettings, shade, styleFor,
} from './diceStyle'

describe('contrast', () => {
  it('is 21 for black on white and 1 for the same color', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#7a4fb5', '#7a4fb5')).toBeCloseTo(1, 9)
  })
  it('does not depend on the order', () => {
    expect(contrastRatio('#d9531e', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#d9531e'), 9)
  })
  it('warns on hard-to-read numbers and not on the default', () => {
    expect(lowContrast(DEFAULT_STYLE)).toBe(false)
    expect(lowContrast({ body: '#f1e8e0', number: '#ffffff', finish: 'opaque' })).toBe(true)
    expect(lowContrast({ body: '#2a2420', number: '#2a2420', finish: 'opaque' })).toBe(true)
  })
  it('the default number color reads on every preset body that is meant for it', () => {
    // White numbers do not work on the pale preset, which is why the number presets include a dark color.
    const readable = BODY_PRESETS.filter(b => NUMBER_PRESETS.some(n => contrastRatio(b, n) >= 3))
    expect(readable).toEqual(BODY_PRESETS)
  })
})

describe('shade', () => {
  it('darkens and lightens', () => {
    expect(shade('#808080', 0.5)).toBe('#404040')
    expect(shade('#000000', 1.5)).toBe('#808080')
    expect(shade('#ff0000', 1)).toBe('#ff0000')
  })
})

describe('styleFor', () => {
  it('uses the one style for every die unless set per type', () => {
    const s = defaultSettings()
    s.types.d20 = { body: '#b3402a', number: '#ffffff', finish: 'metallic' }
    expect(styleFor(s, 'd20')).toEqual(DEFAULT_STYLE)
    s.perType = true
    expect(styleFor(s, 'd20').body).toBe('#b3402a')
    expect(styleFor(s, 'd6')).toEqual(DEFAULT_STYLE)
  })
})

describe('sanitizeSettings', () => {
  it('falls back to the defaults for junk', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings())
    expect(sanitizeSettings('x')).toEqual(defaultSettings())
    expect(sanitizeSettings({ all: { body: 'red', number: '#fff' } })).toEqual(defaultSettings())
  })
  it('keeps valid colors, drops invalid per-type entries and unknown finishes', () => {
    const out = sanitizeSettings({
      perType: true,
      all: { body: '#AA00BB', number: '#ffffff', finish: 'glittery' },
      types: { d4: { body: '#112233', number: '#ffffff', finish: 'metallic' }, d6: { body: 'nope', number: '#fff' }, d99: {} },
    })
    expect(out.perType).toBe(true)
    expect(out.all).toEqual({ body: '#aa00bb', number: '#ffffff', finish: 'opaque' })
    expect(Object.keys(out.types)).toEqual(['d4'])
  })
})
