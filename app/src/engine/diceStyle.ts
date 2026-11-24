// Dice colors for the 3D dice tray (VTTER-79). A local display preference, never sent to the API.
import { DIE_KINDS, type DieKind } from './polyhedra'

export type Finish = 'opaque' | 'translucent' | 'metallic'
export const FINISHES: readonly Finish[] = ['opaque', 'translucent', 'metallic']

export interface DiceStyle {
  body: string
  number: string
  finish: Finish
}

export interface StyleSettings {
  /** False: one style for every die. True: each die type may have its own. */
  perType: boolean
  all: DiceStyle
  types: Partial<Record<DieKind, DiceStyle>>
}

export const DEFAULT_STYLE: DiceStyle = { body: '#7a4fb5', number: '#ffffff', finish: 'opaque' }

export const BODY_PRESETS = ['#b3402a', '#7a4fb5', '#2f7d8a', '#c27a14', '#3b6fb5', '#2a2420', '#f1e8e0', '#2f7d4f'] as const
export const NUMBER_PRESETS = ['#ffffff', '#f2c14e', '#2a2420', '#d9531e'] as const

/** Text needs 3:1 against the body to read comfortably at dice sizes. */
export const MIN_CONTRAST = 3

export function defaultSettings(): StyleSettings {
  return { perType: false, all: { ...DEFAULT_STYLE }, types: {} }
}

const HEX = /^#[0-9a-f]{6}$/i

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

export function parseHex(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function toHex(rgb: readonly number[]): string {
  return '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

/** Lighten (factor > 1) or darken (factor < 1) a color. */
export function shade(hex: string, factor: number): string {
  const rgb = parseHex(hex)
  return toHex(factor >= 1 ? rgb.map(c => c + (255 - c) * (factor - 1)) : rgb.map(c => c * factor))
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** True when the numbers would be hard to read on the body color. A warning only. */
export function lowContrast(style: DiceStyle): boolean {
  return contrastRatio(style.body, style.number) < MIN_CONTRAST
}

export function styleFor(settings: StyleSettings, kind: DieKind): DiceStyle {
  return settings.perType ? settings.types[kind] ?? settings.all : settings.all
}

function sanitizeStyle(value: unknown): DiceStyle | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!isHex(v.body) || !isHex(v.number)) return null
  const finish = FINISHES.find(f => f === v.finish) ?? 'opaque'
  return { body: v.body.toLowerCase(), number: v.number.toLowerCase(), finish }
}

/** Accept saved settings only in the exact shape; anything else falls back to the defaults. */
export function sanitizeSettings(value: unknown): StyleSettings {
  const fallback = defaultSettings()
  if (typeof value !== 'object' || value === null) return fallback
  const v = value as Record<string, unknown>
  const all = sanitizeStyle(v.all) ?? fallback.all
  const types: StyleSettings['types'] = {}
  if (typeof v.types === 'object' && v.types !== null) {
    for (const kind of DIE_KINDS) {
      const s = sanitizeStyle((v.types as Record<string, unknown>)[kind])
      if (s) types[kind] = s
    }
  }
  return { perType: v.perType === true, all, types }
}
