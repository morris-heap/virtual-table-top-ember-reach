// Draws a die's body color and numbers onto one canvas atlas, one square cell per face (VTTER-79).
// Recoloring a die just redraws this canvas, so no image files are needed.
import { shade, type DiceStyle } from '../engine/diceStyle'
import { atlasLayout, type AtlasLayout, type Solid } from '../engine/polyhedra'

export const CELL_PX = 192

export interface Atlas {
  canvas: HTMLCanvasElement
  layout: AtlasLayout
}

export type LabelMode = 'plain' | 'tens'

function labelFor(value: number, mode: LabelMode): string {
  if (mode === 'tens') return value === 0 ? '00' : String(value * 10)
  return String(value)
}

export function drawAtlas(solid: Solid, style: DiceStyle, mode: LabelMode): Atlas {
  const layout = atlasLayout(solid)
  const canvas = document.createElement('canvas')
  canvas.width = layout.cols * CELL_PX
  canvas.height = layout.rows * CELL_PX
  const ctx = canvas.getContext('2d')!
  const px = CELL_PX / layout.unitsPerCell // pixels per face-plane unit
  const rim = shade(style.body, 0.55)
  const mid = shade(style.body, 0.8)
  const glow = shade(style.body, 1.18)

  solid.faces.forEach((face, i) => {
    const frame = layout.frames[i]
    const cx = (i % layout.cols) * CELL_PX + CELL_PX / 2
    const cy = Math.floor(i / layout.cols) * CELL_PX + CELL_PX / 2
    const at = (p: [number, number]): [number, number] => [cx + p[0] * px, cy - p[1] * px]

    // Fill the whole cell so texture filtering never bleeds a neighbor's color in.
    ctx.fillStyle = style.body
    ctx.fillRect(cx - CELL_PX / 2, cy - CELL_PX / 2, CELL_PX, CELL_PX)

    ctx.save()
    ctx.beginPath()
    frame.points.forEach((p, k) => { const [x, y] = at(p); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.closePath()
    ctx.clip()
    // A lit center fading to dark edges reads as a beveled face.
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, frame.circumradius * px)
    grad.addColorStop(0, glow)
    grad.addColorStop(0.7, style.body)
    grad.addColorStop(1, mid)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.lineJoin = 'round'
    ctx.strokeStyle = rim
    ctx.lineWidth = frame.inradius * px * 0.34
    ctx.stroke()
    ctx.strokeStyle = mid
    ctx.lineWidth = frame.inradius * px * 0.16
    ctx.stroke()
    ctx.restore()

    ctx.fillStyle = style.number
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (solid.kind === 'd4') {
      // A d4 prints the number at each corner of a face, with its top pointing at that corner.
      const size = Math.round(frame.inradius * px * 0.62)
      ctx.font = `700 ${size}px system-ui, "Segoe UI", sans-serif`
      face.indices.forEach((vi, k) => {
        const p = frame.points[k]
        const [x, y] = at([p[0] * 0.58, p[1] * 0.58])
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.atan2(p[0], p[1]))
        ctx.fillText(String(solid.vertexValues![vi]), 0, 0)
        ctx.restore()
      })
      return
    }
    const text = labelFor(face.value, mode)
    const size = Math.round(frame.inradius * px * (text.length > 1 ? 1.0 : 1.35))
    ctx.font = `700 ${size}px system-ui, "Segoe UI", sans-serif`
    ctx.fillText(text, cx, cy + size * 0.04)
    if (text === '6' || text === '9') {
      // Underline so a 6 can't be mistaken for a 9.
      const w = ctx.measureText(text).width
      ctx.fillRect(cx - w / 2, cy + size * 0.5, w, Math.max(2, size * 0.07))
    }
  })
  return { canvas, layout }
}
