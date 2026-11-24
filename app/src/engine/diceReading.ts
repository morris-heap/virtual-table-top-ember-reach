// Reading a settled die (VTTER-79): which face is up, and is the die flat enough to trust?
import { dot, type Solid, type Vec3 } from './polyhedra'

/** Quaternion as [x, y, z, w], the layout both three.js and cannon-es use. */
export type Quat = [number, number, number, number]

/** A die resting more than this far from flat counts as cocked. */
export const COCKED_TILT_DEG = 7

export interface Reading {
  /** The raw face number (a d10 shows 0-9, a d100's tens die 0-9 for 00-90). */
  value: number
  /** Degrees the resting face is tilted from flat on the table. */
  tiltDeg: number
  cocked: boolean
}

/** Rotate a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  // t = 2 * cross(q.xyz, v); result = v + w * t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ]
}

const UP: Vec3 = [0, 1, 0]

/**
 * Read the die from its orientation, with the table's up axis as +Y.
 * Every die but the d4 reads the face that points up. The d4 reads the number at its top vertex,
 * which is the number on the face opposite the one lying on the table (see `Face.value`).
 */
export function readDie(solid: Solid, q: Quat, tiltLimitDeg = COCKED_TILT_DEG): Reading {
  const isD4 = solid.kind === 'd4'
  let best = 0
  let bestY = isD4 ? Infinity : -Infinity
  solid.faces.forEach((face, i) => {
    const y = dot(rotate(q, face.normal), UP)
    if (isD4 ? y < bestY : y > bestY) {
      best = i
      bestY = y
    }
  })
  const flat = Math.min(1, Math.abs(bestY))
  const tiltDeg = (Math.acos(flat) * 180) / Math.PI
  return { value: solid.faces[best].value, tiltDeg, cocked: tiltDeg > tiltLimitDeg }
}
