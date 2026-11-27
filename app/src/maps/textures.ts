// Map textures (VTTER-119), generated in code: each is a small seeded tile, so there are no image files and the bundle
// stays small (as with the dice tray, ADR 0007). Colours come from the `--map-*` CSS variables, so they follow the theme.
import { seededRng } from '../engine/mapGen.ts'
import type { Texture } from '../engine/mapArt.ts'
import type { Rng } from '../engine/dice.ts'

/** Tile size in canvas pixels, and how many hex radii one tile covers on the map. */
const TILE = 128
export const TILE_WORLD = 3

/** Each texture's base colour: a `--map-*` variable and its fallback. */
const BASE: Record<Texture, [string, string]> = {
  land: ['floor', '#e9e1d6'], earth: ['earth', '#c9b08c'], dirt: ['earth', '#c9b08c'], grass: ['grass', '#a9c58a'],
  forest: ['forest', '#9fbf8f'], sand: ['sand', '#e8d6a8'], mud: ['mud', '#a99677'], swamp: ['swamp', '#8f9a6e'],
  rubble: ['rough', '#b9ab9b'], rock: ['rock', '#8f8377'], cave: ['cave', '#b3a796'], flagstone: ['stone', '#cfc6b8'],
  wood: ['wood', '#c79a64'], iron: ['iron', '#8d9298'], glass: ['glass', '#cfe3e8'], snow: ['snow', '#f4f6f8'],
  ice: ['ice', '#d6eaf2'], shallows: ['shallows', '#b6d6e6'], water: ['water', '#9cc3dc'], deep: ['deep', '#6f9fc0'],
  fire: ['fire', '#f2c3ae'], steam: ['steam', '#e4e0dc'], chasm: ['chasm', '#3b3430'], road: ['road', '#d8c49c'],
  stairs: ['stone', '#cfc6b8'],
}

type RGB = [number, number, number]

function parse(color: string): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color)
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : [200, 200, 200]
}

/** Lighter (amount > 0) or darker (amount < 0), as a CSS colour, with an optional alpha. */
export function shade(color: string, amount: number, alpha = 1): string {
  const [r, g, b] = parse(color)
  const t = amount > 0 ? 255 : 0
  const k = Math.abs(amount)
  const m = (c: number) => Math.round(c + (t - c) * k)
  return `rgba(${m(r)}, ${m(g)}, ${m(b)}, ${alpha})`
}

/** The base colour of a texture, read from the theme. */
export function baseColor(el: Element, t: Texture): string {
  const [name, fallback] = BASE[t]
  return getComputedStyle(el).getPropertyValue(`--map-${name}`).trim() || fallback
}

type Draw = (c: CanvasRenderingContext2D, base: string, rng: Rng) => void

/** Draws `fn` at (x, y) and at its wrapped copies, so features crossing the tile's edge tile seamlessly. */
function wrap(fn: (x: number, y: number) => void, x: number, y: number) {
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) fn(x + dx, y + dy)
}

function speckle(c: CanvasRenderingContext2D, base: string, rng: Rng, count: number, size: number, spread = 0.12) {
  for (let k = 0; k < count; k++) {
    const x = rng() * TILE
    const y = rng() * TILE
    const r = size * (0.5 + rng())
    c.fillStyle = shade(base, (rng() * 2 - 1) * spread)
    wrap((px, py) => { c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill() }, x, y)
  }
}

function waves(c: CanvasRenderingContext2D, base: string, rng: Rng, count: number, light: number) {
  c.lineWidth = 1.6
  c.lineCap = 'round'
  for (let k = 0; k < count; k++) {
    const x = rng() * TILE
    const y = rng() * TILE
    const w = 10 + rng() * 14
    c.strokeStyle = shade(base, light, 0.7)
    wrap((px, py) => {
      c.beginPath()
      c.moveTo(px, py)
      c.quadraticCurveTo(px + w / 4, py - 3, px + w / 2, py)
      c.quadraticCurveTo(px + (3 * w) / 4, py + 3, px + w, py)
      c.stroke()
    }, x, y)
  }
}

function cracks(c: CanvasRenderingContext2D, base: string, rng: Rng, count: number, amount: number) {
  c.lineWidth = 1
  for (let k = 0; k < count; k++) {
    let x = rng() * TILE
    let y = rng() * TILE
    const pts: [number, number][] = [[x, y]]
    for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 22; y += (rng() - 0.5) * 22; pts.push([x, y]) }
    c.strokeStyle = shade(base, amount, 0.6)
    wrap((sx, sy) => {
      const ox = sx - pts[0][0]
      const oy = sy - pts[0][1]
      c.beginPath()
      c.moveTo(sx, sy)
      for (const [px, py] of pts.slice(1)) c.lineTo(px + ox, py + oy)
      c.stroke()
    }, pts[0][0], pts[0][1])
  }
}

function blotches(c: CanvasRenderingContext2D, base: string, rng: Rng, count: number, size: number, spread: number, alpha = 0.5) {
  for (let k = 0; k < count; k++) {
    const x = rng() * TILE
    const y = rng() * TILE
    const rx = size * (0.6 + rng())
    const ry = rx * (0.5 + rng() * 0.5)
    const rot = rng() * Math.PI
    c.fillStyle = shade(base, (rng() * 2 - 1) * spread, alpha)
    wrap((px, py) => { c.beginPath(); c.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); c.fill() }, x, y)
  }
}

function stones(c: CanvasRenderingContext2D, base: string, rng: Rng, rows: number, gap: number, rounded: number) {
  const h = TILE / rows
  for (let r = 0; r < rows; r++) {
    let x = rng() * h
    const y = r * h
    // Stones of varied width across the row, wrapping at the tile's edge.
    const widths: number[] = []
    let total = 0
    while (total < TILE - h * 0.6) { const w = h * (0.8 + rng() * 0.9); widths.push(w); total += w }
    const scale = TILE / total
    for (const w0 of widths) {
      const w = w0 * scale
      c.fillStyle = shade(base, (rng() * 2 - 1) * 0.08)
      c.strokeStyle = shade(base, -0.35, 0.8)
      c.lineWidth = gap
      const sx = x
      wrap((px, py) => {
        c.beginPath()
        c.roundRect(px + gap / 2, py + gap / 2, w - gap, h - gap, rounded)
        c.fill()
        c.stroke()
      }, sx, y)
      x += w
    }
  }
}

const DRAW: Record<Texture, Draw> = {
  land: (c, b, r) => speckle(c, b, r, 140, 1.2, 0.06),
  earth: (c, b, r) => { speckle(c, b, r, 220, 1.3, 0.12); blotches(c, b, r, 10, 10, 0.06, 0.4) },
  dirt: (c, b, r) => { speckle(c, b, r, 200, 1.2, 0.14); blotches(c, b, r, 8, 8, 0.08, 0.4) },
  grass: (c, b, r) => {
    blotches(c, b, r, 14, 14, 0.07, 0.5)
    c.lineWidth = 1.2
    c.lineCap = 'round'
    for (let k = 0; k < 260; k++) {
      const x = r() * TILE
      const y = r() * TILE
      const lean = (r() - 0.5) * 4
      const tall = 4 + r() * 2
      c.strokeStyle = shade(b, (r() * 2 - 1) * 0.22, 0.8)
      wrap((px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + lean, py - tall); c.stroke() }, x, y)
    }
  },
  forest: (c, b, r) => {
    blotches(c, b, r, 18, 16, 0.1, 0.6)
    for (let k = 0; k < 30; k++) {
      const x = r() * TILE
      const y = r() * TILE
      const rad = 6 + r() * 8
      c.fillStyle = shade(b, -0.12 - r() * 0.12, 0.85)
      wrap((px, py) => { c.beginPath(); c.arc(px, py, rad, 0, Math.PI * 2); c.fill() }, x, y)
      c.fillStyle = shade(b, 0.12, 0.6)
      wrap((px, py) => { c.beginPath(); c.arc(px - rad / 3, py - rad / 3, rad / 2.5, 0, Math.PI * 2); c.fill() }, x, y)
    }
  },
  sand: (c, b, r) => { speckle(c, b, r, 320, 0.8, 0.1); waves(c, b, r, 8, -0.08) },
  mud: (c, b, r) => { blotches(c, b, r, 26, 9, 0.16, 0.55); speckle(c, b, r, 80, 1, 0.18) },
  swamp: (c, b, r) => { blotches(c, b, r, 18, 10, 0.12, 0.5); blotches(c, shade(b, -0.1), r, 6, 12, 0.05, 0.35); waves(c, b, r, 6, 0.15) },
  rubble: (c, b, r) => { speckle(c, b, r, 60, 1, 0.1); blotches(c, b, r, 70, 4, 0.25, 0.9) },
  rock: (c, b, r) => { blotches(c, b, r, 24, 12, 0.12, 0.5); cracks(c, b, r, 14, -0.35) },
  cave: (c, b, r) => { speckle(c, b, r, 240, 1.1, 0.12); blotches(c, b, r, 10, 12, 0.06, 0.4); cracks(c, b, r, 6, -0.3) },
  flagstone: (c, b, r) => stones(c, b, r, 4, 2, 3),
  stairs: (c, b) => {
    const h = TILE / 8
    for (let k = 0; k < 8; k++) {
      c.fillStyle = shade(b, k % 2 ? -0.06 : 0.06)
      c.fillRect(0, k * h, TILE, h)
      c.fillStyle = shade(b, -0.35, 0.8)
      c.fillRect(0, k * h + h - 2, TILE, 2)
    }
  },
  road: (c, b, r) => stones(c, b, r, 8, 1.5, 5),
  wood: (c, b, r) => {
    const h = TILE / 6
    for (let k = 0; k < 6; k++) {
      c.fillStyle = shade(b, (r() * 2 - 1) * 0.08)
      c.fillRect(0, k * h, TILE, h)
      c.strokeStyle = shade(b, -0.2, 0.5)
      c.lineWidth = 0.8
      for (let g = 0; g < 3; g++) {
        const y = k * h + 3 + r() * (h - 6)
        c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(TILE / 3, y + (r() - 0.5) * 3, (2 * TILE) / 3, y + (r() - 0.5) * 3, TILE, y); c.stroke()
      }
      c.fillStyle = shade(b, -0.4, 0.9)
      c.fillRect(0, k * h + h - 1.5, TILE, 1.5)
      const seam = r() * TILE
      c.fillRect(seam, k * h, 1.5, h)
    }
  },
  iron: (c, b, r) => {
    const h = TILE / 2
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = shade(b, (r() * 2 - 1) * 0.06)
      c.fillRect(i * h + 1, j * h + 1, h - 2, h - 2)
      c.fillStyle = shade(b, -0.35)
      for (const [dx, dy] of [[5, 5], [h - 5, 5], [5, h - 5], [h - 5, h - 5]]) { c.beginPath(); c.arc(i * h + dx, j * h + dy, 1.6, 0, Math.PI * 2); c.fill() }
    }
  },
  glass: (c, b, r) => {
    c.lineWidth = 3
    for (let k = 0; k < 6; k++) {
      const x = r() * TILE
      c.strokeStyle = shade(b, 0.4, 0.5)
      wrap((px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + 20, py - 20); c.stroke() }, x, r() * TILE)
    }
  },
  snow: (c, b, r) => { blotches(c, '#c8d6e4', r, 10, 14, 0.05, 0.25); speckle(c, b, r, 120, 0.8, -0.06) },
  ice: (c, b, r) => { blotches(c, b, r, 10, 16, 0.08, 0.4); cracks(c, b, r, 10, 0.5) },
  shallows: (c, b, r) => { blotches(c, b, r, 12, 12, 0.08, 0.4); waves(c, b, r, 12, 0.3) },
  water: (c, b, r) => { blotches(c, b, r, 10, 16, 0.06, 0.4); waves(c, b, r, 14, 0.25) },
  deep: (c, b, r) => { blotches(c, b, r, 10, 18, 0.08, 0.4); waves(c, b, r, 12, 0.18) },
  fire: (c, _b, r) => { blotches(c, '#f08a3c', r, 16, 10, 0.2, 0.45); blotches(c, '#ffd36b', r, 10, 6, 0.1, 0.5) },
  steam: (c, b, r) => { speckle(c, b, r, 100, 1, 0.08); blotches(c, '#ffffff', r, 12, 10, 0, 0.35) },
  chasm: (c, b, r) => { blotches(c, b, r, 16, 14, 0.15, 0.6); cracks(c, b, r, 10, -0.5) },
}

/** Builds and caches one pattern per texture and colour. */
export class TextureBank {
  private cache = new Map<string, CanvasPattern | string>()

  pattern(ctx: CanvasRenderingContext2D, t: Texture, base: string): CanvasPattern | string {
    const key = `${t}|${base}`
    const hit = this.cache.get(key)
    if (hit) return hit
    let out: CanvasPattern | string = base
    const tile = typeof document !== 'undefined' ? document.createElement('canvas') : null
    const c = tile?.getContext('2d')
    if (tile && c) {
      tile.width = TILE
      tile.height = TILE
      c.fillStyle = base
      c.fillRect(0, 0, TILE, TILE)
      DRAW[t](c, base, seededRng(`texture:${t}`))
      const p = ctx.createPattern(tile, 'repeat')
      if (p) {
        // One tile covers TILE_WORLD hex radii, so the texture zooms with the map.
        if (typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(TILE_WORLD / TILE))
        out = p
      }
    }
    this.cache.set(key, out)
    return out
  }
}
