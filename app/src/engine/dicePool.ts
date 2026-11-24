// The dice pool and its totals for the 3D dice tray (VTTER-79).
import { roll, type Rng } from './dice'
import { DIE_KINDS, type DieKind, type SolidKind, solidKindOf } from './polyhedra'

export type Pool = Record<DieKind, number>

/** Most physical dice in one throw. A d100 is two dice (tens and units). Tuned against frame rate. */
export const MAX_PHYSICAL_DICE = 20

export function emptyPool(): Pool {
  return { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 }
}

const weight = (kind: DieKind) => (kind === 'd100' ? 2 : 1)

export function physicalCount(pool: Pool): number {
  return DIE_KINDS.reduce((sum, k) => sum + pool[k] * weight(k), 0)
}

export function canAdd(pool: Pool, kind: DieKind): boolean {
  return physicalCount(pool) + weight(kind) <= MAX_PHYSICAL_DICE
}

export function addDie(pool: Pool, kind: DieKind): Pool {
  return canAdd(pool, kind) ? { ...pool, [kind]: pool[kind] + 1 } : pool
}

export function removeDie(pool: Pool, kind: DieKind): Pool {
  return pool[kind] > 0 ? { ...pool, [kind]: pool[kind] - 1 } : pool
}

/** "2d4 + 1d6", or an empty string for an empty pool. */
export function formatPool(pool: Pool): string {
  return DIE_KINDS.filter(k => pool[k] > 0).map(k => `${pool[k]}${k}`).join(' + ')
}

export type DieRole = 'single' | 'tens' | 'units'

/** One physical die in the tray. */
export interface PoolDie {
  id: string
  kind: DieKind
  solid: SolidKind
  role: DieRole
  /** Dice that make one result: a single die, or a d100's tens and units. */
  group: string
}

export function expandPool(pool: Pool): PoolDie[] {
  const dice: PoolDie[] = []
  for (const kind of DIE_KINDS) {
    for (let n = 1; n <= pool[kind]; n++) {
      const group = `${kind}-${n}`
      if (kind === 'd100') {
        dice.push({ id: `${group}-tens`, kind, solid: 'd10', role: 'tens', group })
        dice.push({ id: `${group}-units`, kind, solid: 'd10', role: 'units', group })
      } else {
        dice.push({ id: group, kind, solid: solidKindOf(kind), role: 'single', group })
      }
    }
  }
  return dice
}

/** Percentile roll: a tens die (0-90) plus a units die (0-9). 00 + 0 counts as 100. */
export function percentile(tens: number, units: number): number {
  const total = tens + units
  return total === 0 ? 100 : total
}

/** A raw face number as it counts toward a roll. A d10 showing 0 counts as 10. */
export function faceToValue(kind: DieKind, role: DieRole, raw: number): number {
  if (role === 'tens') return raw * 10
  if (role === 'units') return raw
  return kind === 'd10' && raw === 0 ? 10 : raw
}

export interface DieResult {
  /** Raw face number. */
  value: number
  /** True when the die came to rest cocked, so `value` must not be trusted. */
  cocked: boolean
}

export interface Entry {
  key: string
  kind: DieKind
  /** Counted value, or null while any die in the entry is cocked. */
  value: number | null
  /** For a d100: "40 + 7". */
  detail?: string
  cocked: boolean
  /** Ids of the cocked dice, for re-throwing. */
  cockedIds: string[]
}

export interface Summary {
  entries: Entry[]
  /** Sum of every resolved entry. */
  total: number
  /** True when no die is cocked or missing. */
  complete: boolean
}

/** Turn what each die showed into entries and a total. */
export function summarize(dice: PoolDie[], results: ReadonlyMap<string, DieResult>): Summary {
  const groups = new Map<string, PoolDie[]>()
  for (const die of dice) groups.set(die.group, [...(groups.get(die.group) ?? []), die])
  const entries: Entry[] = []
  for (const [key, members] of groups) {
    const kind = members[0].kind
    const bad = members.filter(d => { const r = results.get(d.id); return !r || r.cocked })
    if (bad.length > 0) {
      entries.push({ key, kind, value: null, cocked: true, cockedIds: bad.map(d => d.id) })
      continue
    }
    const counted = members.map(d => faceToValue(d.kind, d.role, results.get(d.id)!.value))
    if (kind === 'd100') {
      const tens = counted[members.findIndex(d => d.role === 'tens')]
      const units = counted[members.findIndex(d => d.role === 'units')]
      entries.push({ key, kind, value: percentile(tens, units), detail: `${tens === 0 ? '00' : tens} + ${units}`, cocked: false, cockedIds: [] })
    } else {
      entries.push({ key, kind, value: counted[0], cocked: false, cockedIds: [] })
    }
  }
  return {
    entries,
    total: entries.reduce((sum, e) => sum + (e.value ?? 0), 0),
    complete: entries.every(e => !e.cocked),
  }
}

/** Roll the whole pool with a random number generator. Used when 3D is unavailable. */
export function rollPool(dice: PoolDie[], rng: Rng = Math.random): Map<string, DieResult> {
  const out = new Map<string, DieResult>()
  for (const die of dice) {
    const sides = die.solid === 'd4' ? 4 : die.solid === 'd6' ? 6 : die.solid === 'd8' ? 8 : die.solid === 'd10' ? 10 : die.solid === 'd12' ? 12 : 20
    const face = roll(sides, rng)
    // A d10 (and a d100's dice) are marked 0-9.
    out.set(die.id, { value: die.solid === 'd10' ? face - 1 : face, cocked: false })
  }
  return out
}

/** The tray holds this many dice at its base size. */
export const TRAY_BASE_DICE = 8
export const TRAY_MAX_SCALE = 1.7

/**
 * How much larger than its base size the table is for a pool of `count` dice: the floor area grows with the
 * number of dice, so a big pool gets room to spread out instead of piling up.
 */
export function trayScale(count: number): number {
  const s = Math.sqrt(Math.max(count, 1) / TRAY_BASE_DICE)
  return Math.round(Math.min(TRAY_MAX_SCALE, Math.max(1, s)) * 20) / 20
}
