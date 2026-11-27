// The map canvas's gestures (VTTER-123). jsdom draws nothing, so the zoom is read from the canvas's data-zoom.
// A phone sends several pointer moves before React renders; the pinch must still zoom the right way when they
// are handled together, which is what went wrong before (the zoom factor was read after later moves changed it).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { newMap } from '../engine/mapModel.ts'
import { paintOf } from '../engine/mapView.ts'
import MapCanvas from './MapCanvas.tsx'

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
})
afterEach(cleanup)

function open() {
  const map = newMap('Pinch', 'small')
  render(
    <MapCanvas map={map} mapId="m1" showGrid={false} paint={paintOf(map)} selectedId={null} edgeTarget={false} tool="select"
      onStroke={() => {}} onStrokeEnd={() => {}} onPick={() => {}} />,
  )
  return screen.getByRole('img', { name: /Hex map/ })
}

const zoom = (c: HTMLElement) => Number(c.getAttribute('data-zoom'))

/** Two fingers on a line through (200, 200), `from` px apart, moved in steps to `to` px apart, all in one render. */
function pinch(c: HTMLElement, from: number, to: number, steps = 6) {
  const at = (id: number, d: number) => ({ pointerId: id, clientX: 200 + (id === 1 ? -d : d) / 2, clientY: 200, button: 0 })
  fireEvent.pointerDown(c, at(1, from))
  fireEvent.pointerDown(c, at(2, from))
  act(() => {
    for (let k = 1; k <= steps; k++) {
      const d = from + ((to - from) * k) / steps
      fireEvent.pointerMove(c, at(1, d))
      fireEvent.pointerMove(c, at(2, d))
    }
  })
  fireEvent.pointerUp(c, at(1, to))
  fireEvent.pointerUp(c, at(2, to))
}

describe('pinch zoom on the map', () => {
  it('zooms in when the fingers spread apart', () => {
    const c = open()
    const before = zoom(c)
    pinch(c, 40, 120)
    expect(zoom(c)).toBeGreaterThan(before)
  })

  it('zooms out when the fingers pinch together', () => {
    const c = open()
    pinch(c, 40, 160) // zoom in first, so there is room to zoom out
    const before = zoom(c)
    pinch(c, 160, 40)
    expect(zoom(c)).toBeLessThan(before)
  })

  it('zooms by the ratio of the finger distances', () => {
    const c = open()
    const before = zoom(c)
    pinch(c, 50, 100)
    expect(zoom(c) / before).toBeCloseTo(2, 1)
  })
})
