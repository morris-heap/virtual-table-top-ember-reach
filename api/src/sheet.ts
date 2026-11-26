// The character sheet the API sends and receives (sheets/character-sheet.md), and its validation.
// Allowed values come from /data, never hard-coded (CLAUDE.md).
import character from '../../data/character.json'
import core from '../../data/core.json'

export const ATTRIBUTES = core.attributes.map(a => a.toLowerCase()) as AttributeKey[]
export type AttributeKey = 'might' | 'grace' | 'wits' | 'lore' | 'spirit' | 'presence'

/** One weapon or attack spell. To hit and damage are free text, like "+5" and "d6 + 1". */
export interface Attack { name: string; toHit: string; damage: string; properties: string; notes: string }
export interface Spell { name: string; ember: number; target: string; effect: string }

export interface CharacterSheet {
  rulesVersion: string
  name: string
  player: string
  level: number
  ancestry: string
  calling: string
  background: string
  oath: string
  attributes: Record<AttributeKey, number>
  grit: number
  ember: number
  deathFails: number
  /** One entry per Wound, in the order taken: the Attribute rolled on the d6. */
  wounds: string[]
  /** Skill name → rank. Missing skills are rank 0. */
  skills: Record<string, number>
  attacks: Attack[]
  signature: string
  talents: string[]
  spells: Spell[]
  armor: string
  shield: boolean
  silver: number
  supplyDie: string
  gear: string
  contacts: string
  notes: string
}

export interface CharacterRecord extends CharacterSheet {
  id: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type CharacterSummary = Pick<CharacterRecord, 'id' | 'name' | 'level' | 'ancestry' | 'calling' | 'updatedAt'>

export class ValidationError extends Error {}

const SKILLS = [...character.skills, ...character.weaponSkills]
const ARMOR = character.armor.map(a => a.id)
const MAX_TEXT = 2000
const MAX_LIST = 50

export function fail(msg: string): never {
  throw new ValidationError(msg)
}
export function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${field} must be an object`)
  return v as Record<string, unknown>
}
export function text(v: unknown, field: string, { min = 0, max = MAX_TEXT, def = '' } = {}): string {
  if (v === undefined || v === null) v = def
  if (typeof v !== 'string') fail(`${field} must be a string`)
  const s = v.trim()
  if (s.length < min || s.length > max) fail(`${field} must be ${min}-${max} characters`)
  return s
}
export function int(v: unknown, field: string, min: number, max: number, def?: number): number {
  if ((v === undefined || v === null) && def !== undefined) return def
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) fail(`${field} must be a whole number from ${min} to ${max}`)
  return v as number
}
export function list(v: unknown, field: string, max = MAX_LIST): unknown[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) fail(`${field} must be a list`)
  if (v.length > max) fail(`${field} can have at most ${max} entries`)
  return v
}
export function oneOf(v: unknown, field: string, allowed: string[], def: string): string {
  if (v === undefined || v === null) return def
  if (typeof v !== 'string' || !allowed.includes(v)) fail(`${field} must be one of: ${allowed.join(', ')}`)
  return v
}

/** Heroes saved with a numeric testBonus: 5 becomes "+5", -1 becomes "-1", 0 stays blank. */
function legacyToHit(v: unknown, field: string): string {
  const n = int(v, field, -20, 50, 0)
  return n > 0 ? `+${n}` : n < 0 ? String(n) : ''
}

export function parseSheet(body: unknown): CharacterSheet {
  const b = obj(body, 'body')
  const level = int(b.level, 'level', character.levels.min, character.levels.max, character.levels.min)
  const { min: aMin, max: aMax } = character.attributeRange

  const attrsIn = obj(b.attributes ?? {}, 'attributes')
  const attributes = {} as Record<AttributeKey, number>
  for (const a of ATTRIBUTES) attributes[a] = int(attrsIn[a], `attributes.${a}`, aMin, aMax, 0)

  const maxRank = level >= 7 ? character.skillRank.maxAtLevel7 : character.skillRank.max
  const skillsIn = obj(b.skills ?? {}, 'skills')
  const skills: Record<string, number> = {}
  for (const [k, v] of Object.entries(skillsIn)) {
    if (!SKILLS.includes(k)) fail(`skills.${k} is not a skill (allowed: ${SKILLS.join(', ')})`)
    skills[k] = int(v, `skills.${k}`, character.skillRank.min, maxRank)
  }

  const attrNames = core.attributes
  const wounds = list(b.wounds, 'wounds').map((w, i) => oneOf(w, `wounds[${i}]`, attrNames, ''))
  if (wounds.length > character.woundSlots.max) fail(`wounds can have at most ${character.woundSlots.max} entries`)

  return {
    rulesVersion: text(b.rulesVersion, 'rulesVersion', { min: 1, max: 10, def: core.version }),
    name: text(b.name, 'name', { min: 1, max: 80 }),
    player: text(b.player, 'player', { max: 80 }),
    level,
    ancestry: text(b.ancestry, 'ancestry', { max: 40 }),
    calling: text(b.calling, 'calling', { max: 40 }),
    background: text(b.background, 'background', { max: 80 }),
    oath: text(b.oath, 'oath', { max: 500 }),
    attributes,
    grit: int(b.grit, 'grit', 0, 999, 0),
    ember: int(b.ember, 'ember', 0, 999, 0),
    deathFails: int(b.deathFails, 'deathFails', 0, character.deathRollFailures, 0),
    wounds,
    skills,
    attacks: list(b.attacks, 'attacks').map((a, i) => {
      const o = obj(a, `attacks[${i}]`)
      return {
        name: text(o.name, `attacks[${i}].name`, { min: 1, max: 80 }),
        toHit: text(o.toHit ?? legacyToHit(o.testBonus, `attacks[${i}].testBonus`), `attacks[${i}].toHit`, { max: 40 }),
        damage: text(o.damage, `attacks[${i}].damage`, { max: 40 }),
        properties: text(o.properties, `attacks[${i}].properties`, { max: 300 }),
        notes: text(o.notes, `attacks[${i}].notes`, { max: 300 }),
      }
    }),
    signature: text(b.signature, 'signature', { max: 500 }),
    talents: list(b.talents, 'talents').map((t, i) => text(t, `talents[${i}]`, { min: 1, max: 200 })),
    spells: list(b.spells, 'spells').map((s, i) => {
      const o = obj(s, `spells[${i}]`)
      return {
        name: text(o.name, `spells[${i}].name`, { min: 1, max: 80 }),
        ember: int(o.ember, `spells[${i}].ember`, 0, 99, 0),
        target: text(o.target, `spells[${i}].target`, { max: 80 }),
        effect: text(o.effect, `spells[${i}].effect`, { max: 300 }),
      }
    }),
    armor: oneOf(b.armor, 'armor', ARMOR, 'none'),
    shield: b.shield === undefined ? false : typeof b.shield === 'boolean' ? b.shield : fail('shield must be true or false'),
    silver: int(b.silver, 'silver', 0, 1_000_000, 0),
    supplyDie: oneOf(b.supplyDie, 'supplyDie', character.supplyDice, character.supplyDice[0]),
    gear: text(b.gear, 'gear'),
    contacts: text(b.contacts, 'contacts'),
    notes: text(b.notes, 'notes', { max: 10_000 }),
  }
}
