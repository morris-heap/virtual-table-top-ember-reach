// Sound parameters for dice impacts (VTTER-79). The tray turns these into Web Audio.

export type ImpactKind = 'floor' | 'dice' | 'wall'

export interface ImpactParams {
  /** 0-1 */
  gain: number
  /** Center of the click or thud, in Hz. */
  freq: number
  /** Seconds. */
  duration: number
  /** Share of the sound that is noise (the rest is a low thump). 0-1 */
  noise: number
}

/** Impacts slower than this (tray units per second) make no sound. */
export const MIN_IMPACT_SPEED = 0.8
/** Impact speed that plays at full volume. */
export const LOUD_IMPACT_SPEED = 22

const BASE: Record<ImpactKind, { freq: number; duration: number; noise: number; gain: number }> = {
  floor: { freq: 520, duration: 0.09, noise: 0.55, gain: 0.9 },
  dice: { freq: 1900, duration: 0.05, noise: 0.85, gain: 0.7 },
  wall: { freq: 320, duration: 0.11, noise: 0.35, gain: 0.55 },
}

/** Volume and pitch scale with how hard the dice hit. `rand` adds a little variety. */
export function impactParams(kind: ImpactKind, speed: number, rand: () => number = Math.random): ImpactParams | null {
  if (speed < MIN_IMPACT_SPEED) return null
  const base = BASE[kind]
  const hardness = Math.min(1, speed / LOUD_IMPACT_SPEED)
  return {
    gain: base.gain * hardness ** 1.2,
    freq: base.freq * (0.85 + 0.3 * hardness) * (0.92 + 0.16 * rand()),
    duration: base.duration * (0.8 + 0.4 * hardness),
    noise: base.noise,
  }
}

/** Never more voices than this at once, and never two within `MIN_GAP_MS`, so a pile of impacts can't clip. */
export const MAX_VOICES = 10
export const MIN_GAP_MS = 18

export function allowImpact(nowMs: number, lastMs: number, activeVoices: number): boolean {
  return activeVoices < MAX_VOICES && nowMs - lastMs >= MIN_GAP_MS
}
