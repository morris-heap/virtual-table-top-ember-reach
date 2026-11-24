// Turning mouse movement into a throw (VTTER-79).

export interface MouseSample {
  /** Position on the table, in tray units. */
  x: number
  z: number
  /** Milliseconds. */
  t: number
}

export const THROW = {
  /** Only the last stretch of movement counts, so a pause before the click means a gentle toss. */
  windowMs: 100,
  /** Samples closer together than this (milliseconds) are too noisy to give a velocity on their own. */
  minSpanMs: 15,
  /** Below this speed (tray units per second) the mouse counts as still. */
  stillSpeed: 1.5,
  /** A flick of the mouse is multiplied by this, so a quick wrist movement is a hard throw. */
  gain: 1.6,
  minSpeed: 12,
  maxSpeed: 70,
  /** Speed of the toss when the mouse is still. */
  tossSpeed: 9,
} as const

export interface ThrowVelocity {
  vx: number
  vz: number
  speed: number
  /** True when the mouse was still and the direction was chosen at random. */
  still: boolean
}

/**
 * Mouse velocity in tray units per second over the last `windowMs`, or zero with fewer than two samples.
 * Samples must carry the time the movement happened (the event's own timestamp), not the time a busy page got
 * around to handling it. If the recent samples are too close in time to give a steady reading, it looks further back.
 */
export function mouseVelocity(samples: readonly MouseSample[], now: number): { vx: number; vz: number } {
  let recent = samples.filter(s => now - s.t <= THROW.windowMs)
  if (recent.length >= 2 && recent[recent.length - 1].t - recent[0].t < THROW.minSpanMs) {
    recent = samples.filter(s => now - s.t <= THROW.windowMs * 3)
  }
  if (recent.length < 2) return { vx: 0, vz: 0 }
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return { vx: 0, vz: 0 }
  return { vx: (last.x - first.x) / dt, vz: (last.z - first.z) / dt }
}

/** The release velocity: the mouse direction, with strength from its speed (clamped). */
export function throwFromSamples(samples: readonly MouseSample[], now: number, rand: () => number = Math.random): ThrowVelocity {
  const { vx, vz } = mouseVelocity(samples, now)
  const speed = Math.hypot(vx, vz)
  if (speed < THROW.stillSpeed) {
    const angle = rand() * Math.PI * 2
    return { vx: Math.cos(angle) * THROW.tossSpeed, vz: Math.sin(angle) * THROW.tossSpeed, speed: THROW.tossSpeed, still: true }
  }
  const clamped = Math.min(THROW.maxSpeed, Math.max(THROW.minSpeed, speed * THROW.gain))
  return { vx: (vx / speed) * clamped, vz: (vz / speed) * clamped, speed: clamped, still: false }
}

export interface Obstacle {
  x: number
  z: number
  /** Radius of the die, in tray units. */
  r: number
}

export interface FreeSpot {
  x: number
  z: number
  /** Gap between the spot and the nearest die or wall (negative if nothing fits). */
  clearance: number
}

/**
 * The emptiest place on the table for a die of radius `radius`: the point with the most room around it
 * (distance to the nearest die's edge, or to a wall). Used to re-throw a cocked die where nothing covers it.
 */
export function freeSpot(
  others: readonly Obstacle[],
  halfX: number,
  halfZ: number,
  radius: number,
  rand: () => number = Math.random,
  samples = 240,
): FreeSpot {
  const minX = -halfX + radius
  const minZ = -halfZ + radius
  let best: FreeSpot = { x: 0, z: 0, clearance: -Infinity }
  for (let i = 0; i < samples; i++) {
    const x = minX + rand() * (halfX - radius - minX)
    const z = minZ + rand() * (halfZ - radius - minZ)
    let clearance = Infinity
    for (const o of others) clearance = Math.min(clearance, Math.hypot(o.x - x, o.z - z) - o.r - radius)
    if (clearance > best.clearance) best = { x, z, clearance }
  }
  return best
}
