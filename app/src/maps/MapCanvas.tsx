// The map itself, on a canvas (VTTER-119). The hexes are the invisible rules layer; what is drawn is art: each object
// is one smooth, textured shape, walls are continuous lines, roads and rivers run through hex centres, and small
// details are scattered from a seed. Clicks and paint strokes still resolve to hexes and edges through hex.ts.
// Shapes are built once per object and culled to the screen, so a 100×100 map stays quick on a phone.
// One finger paints (or, with Select, pans and taps to pick); two fingers pan and pinch to zoom; a mouse wheel zooms.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { edgeAt, hexAt, hexCenter, hexCorners, indexOf, type Grid } from '../engine/hex.ts'
import {
  artKey, artOf, boundsOf, drawOrder, scatterDecor, smoothRing, traceOutline, type Art, type Decor, type Pt, type Ring, type Texture,
} from '../engine/mapArt.ts'
import type { MapDoc } from '../engine/mapModel.ts'
import { fitView, markOf, panBy, visibleRange, zoomAt, type Paint, type View } from '../engine/mapView.ts'
import { decodeRuns } from '../engine/runs.ts'
import { baseColor, shade, TextureBank } from './textures.ts'

export type Tool = 'select' | 'paint' | 'erase'

/** Below this hex size the map draws flat colours, with no textures, outlines or decoration. */
const FLAT_BELOW = 10
/** Decoration appears from this hex size up. */
const DECOR_FROM = 14
const GRID_FADE_MS = 200

/** An object's drawing, with its paths built once. */
interface Built {
  key: string
  a: Art
  shape: Path2D | null
  lines: Path2D | null
  bbox: { x0: number; y0: number; x1: number; y1: number }
  decor?: Decor[]
}

function addRings(p: Path2D, rings: Ring[]) {
  for (const ring of rings) {
    if (!ring.length) continue
    p.moveTo(ring[0][0], ring[0][1])
    for (let k = 1; k < ring.length; k++) p.lineTo(ring[k][0], ring[k][1])
    p.closePath()
  }
}

function addLines(p: Path2D, lines: Pt[][]) {
  for (const line of lines) {
    if (!line.length) continue
    p.moveTo(line[0][0], line[0][1])
    // A one-point line still draws as a dot with round caps.
    if (line.length === 1) p.lineTo(line[0][0], line[0][1])
    for (let k = 1; k < line.length; k++) p.lineTo(line[k][0], line[k][1])
  }
}

function build(a: Art, key: string): Built {
  if (a.kind === 'shape') {
    const shape = new Path2D()
    addRings(shape, a.rings)
    return { key, a, shape, lines: null, bbox: boundsOf(a.rings) }
  }
  if (a.kind === 'route') {
    const lines = new Path2D()
    addLines(lines, a.lines)
    let shape: Path2D | null = null
    if (a.rings) { shape = new Path2D(); addRings(shape, a.rings) }
    const b = boundsOf(a.lines)
    return { key, a, shape, lines, bbox: { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 } }
  }
  if (a.kind === 'edges') {
    const lines = new Path2D()
    addLines(lines, a.lines)
    return { key, a, shape: null, lines, bbox: boundsOf(a.lines) }
  }
  return { key, a, shape: null, lines: null, bbox: boundsOf(a.segments) }
}

type DecorKind = 'tuft' | 'tree' | 'pebble' | 'dot' | 'ripple' | 'reed' | 'flame' | 'puff'

/** Which textures get scattered details, how many per hex (inside, and on the rim), and what they look like. */
const DECOR: Partial<Record<Texture, { kind: DecorKind; density: number; rim: number }>> = {
  grass: { kind: 'tuft', density: 0.9, rim: 0.9 },
  forest: { kind: 'tree', density: 1.3, rim: 1.6 },
  rock: { kind: 'pebble', density: 0.3, rim: 0.8 },
  cave: { kind: 'pebble', density: 0.15, rim: 1.4 },
  rubble: { kind: 'pebble', density: 1.4, rim: 1.4 },
  earth: { kind: 'pebble', density: 0.25, rim: 0.25 },
  land: { kind: 'pebble', density: 0.1, rim: 0.1 },
  sand: { kind: 'dot', density: 0.5, rim: 0.5 },
  snow: { kind: 'dot', density: 0.3, rim: 0.3 },
  water: { kind: 'ripple', density: 0.35, rim: 0.2 },
  deep: { kind: 'ripple', density: 0.3, rim: 0.2 },
  shallows: { kind: 'ripple', density: 0.4, rim: 0.4 },
  swamp: { kind: 'reed', density: 0.8, rim: 1 },
  mud: { kind: 'pebble', density: 0.3, rim: 0.3 },
  fire: { kind: 'flame', density: 0.8, rim: 0.6 },
  steam: { kind: 'puff', density: 0.6, rim: 0.4 },
}

function drawDecor(ctx: CanvasRenderingContext2D, items: Decor[], kind: DecorKind, base: string, x0: number, y0: number, x1: number, y1: number) {
  for (const d of items) {
    if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue
    const size = 0.1 + d.r * 0.12
    ctx.beginPath()
    switch (kind) {
      case 'tuft':
        ctx.strokeStyle = shade(base, -0.35, 0.8)
        ctx.lineWidth = 0.035
        for (const lean of [-0.6, 0, 0.6]) { ctx.moveTo(d.x + lean * size * 0.4, d.y); ctx.lineTo(d.x + lean * size, d.y - size * 1.4) }
        ctx.stroke()
        break
      case 'tree':
        ctx.fillStyle = shade(base, -0.25 - d.v * 0.1, 0.9)
        ctx.arc(d.x, d.y, size * 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = shade(base, 0.15, 0.7)
        ctx.arc(d.x - size * 0.6, d.y - size * 0.6, size * 0.9, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'pebble':
        ctx.fillStyle = shade(base, d.v < 0.5 ? -0.3 : 0.2, 0.9)
        ctx.ellipse(d.x, d.y, size * 0.8, size * 0.55, d.rot, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = shade(base, -0.45, 0.6)
        ctx.lineWidth = 0.02
        ctx.stroke()
        break
      case 'dot':
        ctx.fillStyle = shade(base, d.v < 0.5 ? -0.2 : 0.3, 0.8)
        ctx.arc(d.x, d.y, size * 0.3, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'ripple':
        ctx.strokeStyle = shade(base, 0.4, 0.7)
        ctx.lineWidth = 0.03
        ctx.arc(d.x, d.y, size * 1.6, Math.PI * 1.15, Math.PI * 1.85)
        ctx.stroke()
        break
      case 'reed':
        ctx.strokeStyle = shade(base, -0.4, 0.8)
        ctx.lineWidth = 0.03
        for (const dx of [-0.05, 0, 0.05]) { ctx.moveTo(d.x + dx, d.y); ctx.lineTo(d.x + dx * 2, d.y - size * 2) }
        ctx.stroke()
        break
      case 'flame':
        ctx.fillStyle = d.v < 0.5 ? 'rgba(240, 120, 40, .8)' : 'rgba(255, 200, 80, .8)'
        ctx.moveTo(d.x, d.y - size * 1.8)
        ctx.quadraticCurveTo(d.x + size, d.y, d.x, d.y + size * 0.4)
        ctx.quadraticCurveTo(d.x - size, d.y, d.x, d.y - size * 1.8)
        ctx.fill()
        break
      case 'puff':
        ctx.fillStyle = 'rgba(255, 255, 255, .45)'
        ctx.arc(d.x, d.y, size * 1.5, 0, Math.PI * 2)
        ctx.fill()
        break
    }
  }
}

/** A door, gate, window or opening drawn across its edge, in world units. */
function drawPortal(ctx: CanvasRenderingContext2D, [a, b]: [Pt, Pt], type: string, c: { ink: string; fill: string; accent: string; gm: string; empty: string }) {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  ctx.save()
  ctx.translate(mx, my)
  ctx.rotate(angle)
  const half = len / 2
  ctx.lineWidth = 0.05
  ctx.strokeStyle = c.ink
  switch (type) {
    case 'door':
    case 'secret-door':
      ctx.fillStyle = c.fill
      ctx.fillRect(-half * 0.7, -0.1, half * 1.4, 0.2)
      if (type === 'secret-door') { ctx.strokeStyle = c.gm; ctx.setLineDash([0.08, 0.06]) }
      ctx.strokeRect(-half * 0.7, -0.1, half * 1.4, 0.2)
      ctx.setLineDash([])
      break
    case 'gate':
    case 'portcullis': {
      ctx.lineWidth = 0.07
      ctx.beginPath()
      ctx.moveTo(-half * 0.8, 0)
      ctx.lineTo(half * 0.8, 0)
      const bars = type === 'portcullis' ? 7 : 4
      for (let k = 0; k < bars; k++) {
        const x = -half * 0.7 + (k * half * 1.4) / (bars - 1)
        ctx.moveTo(x, -0.1)
        ctx.lineTo(x, 0.1)
      }
      ctx.stroke()
      break
    }
    case 'window':
    case 'arrow-slit': {
      const w = type === 'window' ? half * 0.9 : half * 0.35
      ctx.fillStyle = 'rgba(190, 220, 235, .95)'
      ctx.fillRect(-w, -0.06, w * 2, 0.12)
      ctx.strokeRect(-w, -0.06, w * 2, 0.12)
      break
    }
    default: {
      // An opening or a hole: a gap with a jamb at each end.
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 0.08
      ctx.beginPath()
      for (const x of [-half * 0.85, half * 0.85]) { ctx.moveTo(x, -0.16); ctx.lineTo(x, 0.16) }
      ctx.stroke()
    }
  }
  ctx.restore()
}

interface Props {
  map: Pick<MapDoc, 'width' | 'height' | 'objects'>
  /** Seeds the outlines' noise and the decoration, so every map looks its own way and always the same way. */
  mapId: string
  /** Shows the hex grid. It fades in and out; hit testing works the same with or without it. */
  showGrid: boolean
  paint: Paint
  selectedId: string | null
  /** True when the selected object lives on edges (a wall, a door), so strokes pick edges, not hexes. */
  edgeTarget: boolean
  tool: Tool
  /** A hex or edge index touched by a paint or erase stroke. */
  onStroke(index: number): void
  /** The end of a stroke, so the editor can record one change for the whole stroke. */
  onStrokeEnd(): void
  /** A tap with the Select tool. */
  onPick(hex: number): void
}

const TAP_SLOP = 6

function css(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

export default function MapCanvas({ map, mapId, showGrid, paint, selectedId, edgeTarget, tool, onStroke, onStrokeEnd, onPick }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ width: 600, height: 420 })
  const grid: Grid = { width: map.width, height: map.height }
  const [view, setView] = useState<View>(() => fitView(grid, 600, 420))
  const fitted = useRef(false)

  // Track the container's size; fit the map the first time it is known.
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width < 10 || height < 10) return
      setBox({ width, height })
      if (!fitted.current) { fitted.current = true; setView(fitView({ width: map.width, height: map.height }, width, height)) }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [map.width, map.height])

  // The grid fades in and out rather than snapping.
  const [gridAlpha, setGridAlpha] = useState(showGrid ? 1 : 0)
  const gridNow = useRef(gridAlpha)
  useEffect(() => {
    const target = showGrid ? 1 : 0
    if (gridNow.current === target) return
    const from = gridNow.current
    let t0: number | null = null
    let raf = requestAnimationFrame(function step(t) {
      t0 ??= t
      const k = Math.min(1, (t - t0) / GRID_FADE_MS)
      gridNow.current = from + (target - from) * k
      setGridAlpha(gridNow.current)
      if (k < 1) raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [showGrid])

  // Each object's drawing, rebuilt only when what it depends on changes (artKey).
  const art = useRef(new Map<string, Built>())
  const textures = useRef(new TextureBank())
  const order = useMemo(() => drawOrder(map), [map])
  const gmShape = useMemo(() => {
    const hexes: number[] = []
    paint.gm.forEach((v, i) => { if (v) hexes.push(i) })
    return hexes.length ? traceOutline({ width: map.width, height: map.height }, hexes).map(r => smoothRing(r, 1)) : []
  }, [paint, map.width, map.height])

  // Draw.
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || typeof Path2D === 'undefined') return
    const grid: Grid = { width: map.width, height: map.height }
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(box.width * dpr)
    c.height = Math.round(box.height * dpr)
    const color = (k: string, f: string) => css(c, `--map-${k}`, f)
    const empty = color('empty', '#f1ebe4')
    const line = color('grid', 'rgba(0,0,0,.08)')
    const gm = color('gm', '#6b4fa3')
    const sel = css(c, '--ember', '#d9531e')
    const wall = color('wall', '#3b302a')
    const portal = color('portal', '#d9531e')
    const ink = css(c, '--text', '#2a2420')
    const s = view.size
    const r = visibleRange(grid, view, box.width, box.height)
    const flat = s < FLAT_BELOW
    const bases = new Map<Texture, string>()
    const base = (t: Texture) => { let b = bases.get(t); if (!b) { b = baseColor(c, t); bases.set(t, b) } return b }

    // Screen space for the background, grid and marks; world space (1 unit = 1 hex radius) for the art.
    const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.x, dpr * view.y)
    screen()
    ctx.fillStyle = empty
    ctx.fillRect(0, 0, box.width, box.height)

    // Rebuild what changed, drop what was deleted.
    const live = new Set<string>()
    for (const o of order) {
      live.add(o.id)
      const key = artKey(o, mapId)
      const had = art.current.get(o.id)
      if (had?.key === key && had.a.o === o) continue
      if (had?.key === key) { art.current.set(o.id, { ...had, a: { ...had.a, o } as Art }); continue }
      const a = artOf(grid, o, mapId)
      if (a) art.current.set(o.id, build(a, key))
    }
    for (const id of [...art.current.keys()]) if (!live.has(id)) art.current.delete(id)

    const vx0 = -view.x / s
    const vy0 = -view.y / s
    const vx1 = (box.width - view.x) / s
    const vy1 = (box.height - view.y) / s
    const onScreen = (b: Built['bbox']) => b.x1 >= vx0 - 1 && b.x0 <= vx1 + 1 && b.y1 >= vy0 - 1 && b.y0 <= vy1 + 1
    const drawn: Built[] = []
    for (const o of order) {
      const b = art.current.get(o.id)
      if (b && onScreen(b.bbox)) drawn.push(b)
    }

    // Shapes and fill Routes, lowest layer first.
    world()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // The art stops at a straight frame inside the map's zigzag hex border, so the map reads as a drawn sheet.
    // Only the drawing is clipped: the border hexes are still there, and the grid still shows them whole.
    const H = Math.sqrt(3)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0.5, H / 2, 1.5 * grid.width - 0.5, H * grid.height - H / 2)
    ctx.clip()
    for (const b of drawn) {
      const a = b.a
      if (a.kind !== 'shape' && a.kind !== 'route') continue
      const bc = base(a.texture)
      const fill = flat ? bc : textures.current.pattern(ctx, a.texture, bc)
      if (b.shape) {
        ctx.fillStyle = fill
        ctx.fill(b.shape, 'evenodd')
        if (!flat) {
          ctx.strokeStyle = shade(bc, -0.35, 0.7)
          ctx.lineWidth = a.kind === 'shape' && a.o.kind === 'enclosure' ? 0.12 : 0.06
          ctx.stroke(b.shape)
        }
      }
      if (b.lines) {
        const width = a.texture === 'water' || a.texture === 'shallows' ? 1.2 : 1.0
        if (!flat) {
          ctx.strokeStyle = shade(bc, -0.3, 0.8)
          ctx.lineWidth = width + 0.14
          ctx.stroke(b.lines)
        }
        ctx.strokeStyle = fill
        ctx.lineWidth = width
        ctx.stroke(b.lines)
      }
      // Decoration: seeded from the map id and hex index, so it never moves and is never stored. It is drawn with
      // its own shape, so the layers above cover it.
      const style = a.kind === 'shape' && s >= DECOR_FROM ? DECOR[a.texture] : undefined
      if (style) {
        b.decor ??= scatterDecor(grid, decodeRuns(a.o.at), `${mapId}|${a.o.id}`, style.density, style.rim)
        drawDecor(ctx, b.decor, style.kind, bc, vx0, vy0, vx1, vy1)
      }
      if (a.o.id === selectedId && b.shape) {
        ctx.strokeStyle = sel
        ctx.lineWidth = 0.1
        ctx.stroke(b.shape)
      }
    }
    ctx.restore()

    // The grid: hidden for viewing, faded in for editing or on demand. Hit testing never depends on it.
    if (gridAlpha > 0.01 && s >= 6) {
      screen()
      ctx.globalAlpha = gridAlpha
      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let row = r.row0; row <= r.row1; row++) {
        for (let col = r.col0; col <= r.col1; col++) {
          const { x, y } = hexCenter(grid, indexOf(grid, col, row), s)
          const pts = hexCorners(x + view.x, y + view.y, s)
          ctx.moveTo(pts[0][0], pts[0][1])
          for (let k = 1; k < 6; k++) ctx.lineTo(pts[k][0], pts[k][1])
          ctx.closePath()
        }
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    world()
    // GM-only areas: one dashed outline around them.
    if (gmShape.length) {
      const p = new Path2D()
      addRings(p, gmShape)
      ctx.strokeStyle = gm
      ctx.lineWidth = 0.1
      ctx.setLineDash([0.3, 0.25])
      ctx.stroke(p)
      ctx.setLineDash([])
    }

    // Walls and fences: one continuous stroke per run of edges.
    for (const b of drawn) {
      const a = b.a
      if (a.kind !== 'edges' || !b.lines) continue
      const fence = a.o.type === 'fence'
      ctx.strokeStyle = a.o.id === selectedId ? sel : a.o.gmOnly ? gm : wall
      ctx.lineWidth = fence ? 0.1 : 0.26
      if (fence) ctx.setLineDash([0.32, 0.12])
      ctx.stroke(b.lines)
      ctx.setLineDash([])
    }

    // Portals: a door or gate symbol on its edge.
    for (const b of drawn) {
      const a = b.a
      if (a.kind !== 'portal') continue
      for (const seg of a.segments) drawPortal(ctx, seg, a.o.type, {
        ink: a.o.id === selectedId ? sel : a.o.gmOnly ? gm : ink,
        fill: base('wood'), accent: portal, gm, empty,
      })
    }

    // The selected object's hexes, tinted: painting is still per hex.
    screen()
    const selected = selectedId ? map.objects.find(o => o.id === selectedId) : undefined
    if (selected && !edgeTarget && s >= 5) {
      ctx.fillStyle = 'rgba(217, 83, 30, .22)'
      for (const i of decodeRuns(selected.at)) {
        if (i >= grid.width * grid.height) continue
        const col = i % grid.width
        const row = Math.floor(i / grid.width)
        if (col < r.col0 || col > r.col1 || row < r.row0 || row > r.row1) continue
        const { x, y } = hexCenter(grid, i, s)
        const pts = hexCorners(x + view.x, y + view.y, s)
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let k = 1; k < 6; k++) ctx.lineTo(pts[k][0], pts[k][1])
        ctx.closePath()
        ctx.fill()
      }
    }

    // Zoomed far out, a mark is just a dot, so Start and Exit can still be found on a Large map.
    if (s < 5) {
      for (const { hex, o } of paint.marks) {
        const { x, y } = hexCenter(grid, hex, s)
        ctx.fillStyle = o.id === selectedId ? ink : sel
        ctx.fillRect(x + view.x - s, y + view.y - s, s * 2, s * 2)
      }
    }
    // Static Objects and Entities: a disc with a letter.
    if (s >= 5) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${Math.round(s * 0.8)}px system-ui, sans-serif`
      for (const { hex, o } of paint.marks) {
        const col = hex % grid.width
        const row = Math.floor(hex / grid.width)
        if (col < r.col0 || col > r.col1 || row < r.row0 || row > r.row1) continue
        const { x, y } = hexCenter(grid, hex, s)
        ctx.beginPath()
        ctx.arc(x + view.x, y + view.y, s * 0.62, 0, Math.PI * 2)
        ctx.fillStyle = o.id === selectedId ? sel : o.kind === 'entity' ? color(o.type === 'foe' ? 'foe' : 'npc', '#a3322a') : color('mark', '#fff')
        ctx.fill()
        ctx.strokeStyle = o.gmOnly ? gm : ink
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = o.kind === 'entity' || o.id === selectedId ? '#fff' : ink
        ctx.fillText(markOf(o), x + view.x, y + view.y + 1)
      }
    }
  }, [map, paint, view, box, selectedId, edgeTarget, order, gmShape, gridAlpha, mapId])

  // Pointers: one paints or pans, two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ kind: 'pan' | 'paint' | 'pinch' | 'none'; startX: number; startY: number; moved: boolean; last: number | null; dist: number }>(
    { kind: 'none', startX: 0, startY: 0, moved: false, last: null, dist: 0 })

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const target = (x: number, y: number) => {
    const wx = x - view.x
    const wy = y - view.y
    return edgeTarget ? edgeAt(grid, wx, wy, view.size) : hexAt(grid, wx, wy, view.size)
  }

  function stroke(x: number, y: number) {
    const t = target(x, y)
    if (t !== null && t !== gesture.current.last) { gesture.current.last = t; onStroke(t) }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    canvas.current?.setPointerCapture?.(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (pointers.current.size === 2) {
      if (g.kind === 'paint') onStrokeEnd()
      const [a, b] = [...pointers.current.values()]
      gesture.current = { kind: 'pinch', startX: 0, startY: 0, moved: true, last: null, dist: Math.hypot(a.x - b.x, a.y - b.y) }
      return
    }
    const painting = (tool === 'paint' || tool === 'erase') && e.button === 0 && selectedId !== null
    gesture.current = { kind: painting ? 'paint' : 'pan', startX: p.x, startY: p.y, moved: false, last: null, dist: 0 }
    if (painting) stroke(p.x, p.y)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      // Pan by half this pointer's move (the midpoint moves half as far), then zoom about the midpoint.
      setView(v => zoomAt(panBy(v, (p.x - prev.x) / 2, (p.y - prev.y) / 2), g.dist ? dist / g.dist : 1, mx, my))
      g.dist = dist
      return
    }
    if (Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP) g.moved = true
    if (g.kind === 'pan') setView(v => panBy(v, p.x - prev.x, p.y - prev.y))
    else if (g.kind === 'paint') stroke(p.x, p.y)
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const g = gesture.current
    const p = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) return
    if (g.kind === 'paint') onStrokeEnd()
    if (g.kind === 'pan' && !g.moved && tool === 'select' && p) {
      const hex = hexAt(grid, p.x - view.x, p.y - view.y, view.size)
      if (hex !== null) onPick(hex)
    }
    gesture.current = { ...g, kind: 'none' }
  }

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      setView(v => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => setView(v => zoomAt(v, f, box.width / 2, box.height / 2))

  return (
    <div className="map-canvas" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: box.width, height: box.height, cursor: tool === 'select' ? 'grab' : 'crosshair' }}
        role="img"
        aria-label={`Hex map, ${map.width} by ${map.height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={e => e.preventDefault()}
      />
      <div className="map-zoom" role="group" aria-label="Zoom">
        <button type="button" className="account-btn" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="account-btn" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        <button type="button" className="account-btn" onClick={() => setView(fitView(grid, box.width, box.height))}>Fit</button>
      </div>
    </div>
  )
}
