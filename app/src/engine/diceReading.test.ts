import { describe, expect, it } from 'vitest'
import { COCKED_TILT_DEG, readDie, rotate, type Quat } from './diceReading'
import { cross, dot, solidFor, type SolidKind, type Vec3 } from './polyhedra'

/** Shortest rotation taking unit vector a onto unit vector b. */
function between(a: Vec3, b: Vec3): Quat {
  const c = cross(a, b)
  const w = 1 + dot(a, b)
  if (w < 1e-9) return [1, 0, 0, 0] // opposite: half turn about X (fine for these tests' axes)
  const n = Math.hypot(c[0], c[1], c[2], w)
  return [c[0] / n, c[1] / n, c[2] / n, w / n]
}

/** Rotate about the Y axis (the table's up). */
function spin(deg: number): Quat {
  const h = (deg * Math.PI) / 360
  return [0, Math.sin(h), 0, Math.cos(h)]
}

function mul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

const UP: Vec3 = [0, 1, 0]
const DOWN: Vec3 = [0, -1, 0]
const KINDS: SolidKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20']

describe('rotate', () => {
  it('turns +X to -Z with a quarter turn about Y', () => {
    const r = rotate(spin(90), [1, 0, 0])
    expect(r[0]).toBeCloseTo(0, 9)
    expect(r[2]).toBeCloseTo(-1, 9)
  })
})

describe('readDie', () => {
  it.each(KINDS.filter(k => k !== 'd4'))('%s reads the face that is up, whatever way it is turned', kind => {
    const s = solidFor(kind)
    s.faces.forEach(face => {
      const q = mul(spin(37), between(face.normal, UP))
      const r = readDie(s, q)
      expect(r.value).toBe(face.value)
      expect(r.cocked).toBe(false)
      expect(r.tiltDeg).toBeLessThan(0.01)
    })
  })

  it('reads the d4 by its top vertex: the face on the table is opposite it', () => {
    const s = solidFor('d4')
    s.faces.forEach(face => {
      const q = mul(spin(120), between(face.normal, DOWN))
      const r = readDie(s, q)
      expect(r.value).toBe(face.value)
      expect(r.cocked).toBe(false)
      // The vertex with that number is the highest one.
      const top = s.vertices.map(v => rotate(q, v)[1])
      expect(s.vertexValues![top.indexOf(Math.max(...top))]).toBe(r.value)
    })
  })

  it.each(KINDS)('%s resting a little off flat is not cocked, but well off flat is', kind => {
    const s = solidFor(kind)
    const face = s.faces[0]
    const target = kind === 'd4' ? DOWN : UP
    const flat = between(face.normal, target)
    const tilt = (deg: number): Quat => {
      const h = (deg * Math.PI) / 360
      return mul([Math.sin(h), 0, 0, Math.cos(h)], flat)
    }
    expect(readDie(s, tilt(COCKED_TILT_DEG - 3)).cocked).toBe(false)
    expect(readDie(s, tilt(COCKED_TILT_DEG + 6)).cocked).toBe(true)
  })

  it('reports a die balanced on an edge as cocked', () => {
    // A cube standing on an edge has its nearest face 45 degrees off flat.
    const s = solidFor('d6')
    const edge = readDie(s, mul([0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)], between(s.faces[0].normal, UP)))
    expect(edge.cocked).toBe(true)
    expect(edge.tiltDeg).toBeCloseTo(45, 4)
  })
})
