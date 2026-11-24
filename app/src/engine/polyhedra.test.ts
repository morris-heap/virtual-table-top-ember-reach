import { describe, expect, it } from 'vitest'
import { atlasLayout, cross, dot, faceFrame, faceUV, length, solidFor, sub, type SolidKind } from './polyhedra'

const KINDS: SolidKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20']
const FACES: Record<SolidKind, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }

describe('solids', () => {
  it.each(KINDS)('%s has the right number of faces', kind => {
    expect(solidFor(kind).faces).toHaveLength(FACES[kind])
  })

  it.each(KINDS)('%s is a closed convex solid (Euler: V - E + F = 2)', kind => {
    const s = solidFor(kind)
    const edges = s.faces.reduce((n, f) => n + f.indices.length, 0) / 2
    expect(s.vertices.length - edges + s.faces.length).toBe(2)
  })

  it.each(KINDS)('%s faces are flat, outward facing and wound counter-clockwise', kind => {
    const s = solidFor(kind)
    for (const f of s.faces) {
      const d = dot(f.normal, s.vertices[f.indices[0]])
      expect(d).toBeGreaterThan(0)
      for (const i of f.indices) expect(dot(f.normal, s.vertices[i])).toBeCloseTo(d, 6)
      const [a, b, c] = f.indices.map(i => s.vertices[i])
      expect(dot(cross(sub(b, a), sub(c, b)), f.normal)).toBeGreaterThan(0)
    }
  })

  it.each(KINDS)('%s is scaled to its radius', kind => {
    const s = solidFor(kind)
    expect(Math.max(...s.vertices.map(length))).toBeCloseTo(s.radius, 9)
  })
})

describe('face numbers', () => {
  it('numbers a d6 1-6 with opposite faces adding to 7', () => {
    const s = solidFor('d6')
    expect(s.faces.map(f => f.value).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
    for (const f of s.faces) {
      const opposite = s.faces.find(g => dot(g.normal, f.normal) < -0.99)!
      expect(f.value + opposite.value).toBe(7)
    }
  })

  it('numbers a d10 0-9 with opposite faces adding to 9', () => {
    const s = solidFor('d10')
    expect(s.faces.map(f => f.value).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const f of s.faces) {
      const opposite = s.faces.find(g => dot(g.normal, f.normal) < -0.99)!
      expect(f.value + opposite.value).toBe(9)
    }
  })

  it.each([['d8', 8], ['d12', 12], ['d20', 20]] as const)('numbers a %s 1-%i with each number once', (kind, sides) => {
    const values = solidFor(kind).faces.map(f => f.value).sort((a, b) => a - b)
    expect(values).toEqual(Array.from({ length: sides }, (_, i) => i + 1))
  })

  it('gives each d4 face the number at the vertex opposite it', () => {
    const s = solidFor('d4')
    for (const f of s.faces) {
      const opposite = s.vertices.findIndex((_, i) => !f.indices.includes(i))
      expect(f.value).toBe(s.vertexValues![opposite])
    }
    expect(s.faces.map(f => f.value).sort()).toEqual([1, 2, 3, 4])
  })
})

describe('texture layout', () => {
  it.each(KINDS)('%s: every face fits inside its atlas cell and keeps its area', kind => {
    const s = solidFor(kind)
    const layout = atlasLayout(s)
    s.faces.forEach((f, i) => {
      const frame = faceFrame(s, i)
      expect(frame.up[0] * f.normal[0] + frame.up[1] * f.normal[1] + frame.up[2] * f.normal[2]).toBeCloseTo(0, 9)
      expect(frame.inradius).toBeGreaterThan(0)
      // Face-plane polygon area equals the 3D face area (shoelace vs fan of triangles).
      let flat = 0
      frame.points.forEach((p, k) => { const q = frame.points[(k + 1) % frame.points.length]; flat += p[0] * q[1] - q[0] * p[1] })
      let solid = 0
      const v = f.indices.map(j => s.vertices[j])
      for (let k = 1; k < v.length - 1; k++) solid += length(cross(sub(v[k], v[0]), sub(v[k + 1], v[0]))) / 2
      expect(Math.abs(flat) / 2).toBeCloseTo(solid, 6)
      for (const p of frame.points) {
        const [u, w] = faceUV(layout, i, p)
        const col = i % layout.cols
        const row = Math.floor(i / layout.cols)
        expect(u).toBeGreaterThan(col / layout.cols)
        expect(u).toBeLessThan((col + 1) / layout.cols)
        expect(1 - w).toBeGreaterThan(row / layout.rows)
        expect(1 - w).toBeLessThan((row + 1) / layout.rows)
      }
    })
  })

  it('maps the face center to the middle of its cell', () => {
    const layout = atlasLayout(solidFor('d20'))
    const [u, v] = faceUV(layout, 0, [0, 0])
    expect(u).toBeCloseTo(0.5 / layout.cols, 9)
    expect(1 - v).toBeCloseTo(0.5 / layout.rows, 9)
  })
})
