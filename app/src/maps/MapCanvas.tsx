// The map itself, on a canvas. Draws only the hexes on screen, so a 100×100 map stays quick on a phone.
// One finger paints (or, with Select, pans and taps to pick); two fingers pan and pinch to zoom; a mouse wheel zooms.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { edgeAt, edgeSegment, hexAt, hexCenter, hexCorners, indexOf, type Grid } from '../engine/hex.ts'
import type { MapDoc } from '../engine/mapModel.ts'
import { fillOf, fitView, markOf, panBy, visibleRange, zoomAt, type Paint, type View } from '../engine/mapView.ts'
import { decodeRuns } from '../engine/runs.ts'

export type Tool = 'select' | 'paint' | 'erase'

interface Props {
  map: Pick<MapDoc, 'width' | 'height' | 'objects'>
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

export default function MapCanvas({ map, paint, selectedId, edgeTarget, tool, onStroke, onStrokeEnd, onPick }: Props) {
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

  // Draw.
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const grid: Grid = { width: map.width, height: map.height }
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(box.width * dpr)
    c.height = Math.round(box.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, box.width, box.height)
    const color = (k: string, f: string) => css(c, `--map-${k}`, f)
    const fills: Record<string, string> = {}
    const fillColor = (k: string) => (fills[k] ??= color(k, '#ddd'))
    const empty = color('empty', '#f1ebe4')
    const line = color('grid', 'rgba(0,0,0,.08)')
    const gm = color('gm', '#6b4fa3')
    const sel = css(c, '--ember', '#d9531e')
    const wall = color('wall', '#3b302a')
    const ink = css(c, '--text', '#2a2420')
    const s = view.size
    const r = visibleRange(grid, view, box.width, box.height)
    const selected = selectedId ? map.objects.find(o => o.id === selectedId) : undefined
    const selectedHexes = new Set(selected && !edgeTarget ? decodeRuns(selected.at) : [])
    const hexPath = (i: number) => {
      const { x, y } = hexCenter(grid, i, s)
      const pts = hexCorners(x + view.x, y + view.y, s)
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let k = 1; k < 6; k++) ctx.lineTo(pts[k][0], pts[k][1])
      ctx.closePath()
    }
    for (let row = r.row0; row <= r.row1; row++) {
      for (let col = r.col0; col <= r.col1; col++) {
        const i = indexOf(grid, col, row)
        const k = paint.fill[i]
        hexPath(i)
        ctx.fillStyle = k < 0 ? empty : fillColor(fillOf(map.objects[k]))
        ctx.fill()
        if (s >= 6) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke() }
        if (paint.gm[i]) {
          ctx.strokeStyle = gm
          ctx.lineWidth = Math.max(1, s / 8)
          ctx.setLineDash([Math.max(2, s / 4), Math.max(2, s / 4)])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (selectedHexes.has(i)) {
          ctx.fillStyle = 'rgba(217, 83, 30, .28)'
          ctx.fill()
        }
      }
    }
    // Edges: walls and fences as lines, Portals in the ember colour, the selected object highlighted.
    const inView = (e: number) => {
      const owner = e % (grid.width * grid.height)
      const col = owner % grid.width
      const row = Math.floor(owner / grid.width)
      return col >= r.col0 - 1 && col <= r.col1 + 1 && row >= r.row0 - 1 && row <= r.row1 + 1
    }
    for (const { e, o } of paint.edges) {
      if (!inView(e)) continue
      const [[x1, y1], [x2, y2]] = edgeSegment(grid, e, s)
      ctx.beginPath()
      ctx.moveTo(x1 + view.x, y1 + view.y)
      ctx.lineTo(x2 + view.x, y2 + view.y)
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(2, s / (o.kind === 'portal' ? 3 : 4))
      ctx.strokeStyle = o.id === selectedId ? sel : o.kind === 'portal' ? color('portal', '#d9531e') : o.gmOnly ? gm : wall
      ctx.stroke()
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
  }, [map, paint, view, box, selectedId, edgeTarget])

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
