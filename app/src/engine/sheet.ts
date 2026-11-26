// What a character sheet means (rules/core-rules.md §3 Making a hero, §3.5 Derived numbers, §4 Callings, §6.6 Wounds).
// Pure functions over the sheet, used by the sheet view, the editor and the creation guide (VTTER-47).
// Every number comes from /data (core.json, character.json, creation.json), never hard-coded.
import type { CharacterSheet } from '../../../api/src/sheet.ts'
import character from '../../../data/character.json'
import core from '../../../data/core.json'
import creation from '../../../data/creation.json'

export type { CharacterSheet }
export type Attribute = (typeof core.attributes)[number]

export interface Talent { name: string; cost?: string; text: string }
export interface SpellInfo { name: string; ember: number; target: string; effect: string }
interface Casting { attribute: string; list: string; startingSpells: number; perLevel: number; always?: string[] }
interface Alchemy { startingMinerals: number; emberCost: number; extraMinerals: { talent: string; count: number } }
export interface Mineral { name: string; vein: string; temper: string; power: string }
export interface CallingInfo {
  grit: { base: number; perLevel: number }
  ember: { base: number; attribute: string }
  armor: string
  skills: Record<string, number>
  signature: string
  signatureText: string
  casting?: Casting
  alchemy?: Alchemy
  talents: Talent[]
  kit: string
  shield: boolean
}
export interface AncestryInfo {
  bonus: { any?: number; attributes?: string[] }
  extraSkillRanks?: number
  extraTalents?: number
  extraWoundSlots?: number
  trait: string
}
export interface Background { name: string; skills: string[]; contact: string }

export const ARRAY: readonly number[] = creation.attributeArray
export const BACKGROUNDS: readonly Background[] = creation.backgrounds
export const ATTRIBUTE_NAMES: readonly string[] = core.attributes
export const SKILLS: readonly string[] = [...character.skills, ...character.weaponSkills]

export const callingInfo = (calling: string): CallingInfo | undefined =>
  (creation.callings as Record<string, CallingInfo>)[calling]
export const ancestryInfo = (ancestry: string): AncestryInfo | undefined =>
  (creation.ancestries as Record<string, AncestryInfo>)[ancestry]
export const backgroundInfo = (name: string): Background | undefined => BACKGROUNDS.find(b => b.name === name)
export const spellList = (calling: string): readonly SpellInfo[] => {
  const list = callingInfo(calling)?.casting?.list
  return list ? (creation.spellLists as Record<string, SpellInfo[]>)[list] ?? [] : []
}

/** The common minerals a Kilnheart can learn (§4.7). Deep minerals are treasure, so they aren't here. */
export const MINERALS: readonly Mineral[] = creation.minerals.common
export const mineralList = (calling: string): readonly Mineral[] => (callingInfo(calling)?.alchemy ? MINERALS : [])

/** "+2", "−1", "0": the sign shown on the sheet. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

const key = (attribute: string) => attribute.toLowerCase() as keyof CharacterSheet['attributes']
export const attributeValue = (sheet: CharacterSheet, attribute: string) => sheet.attributes[key(attribute)] ?? 0

/** Grit, Ember, Dodge, Will, Speed and Wound slots (§3.5). Callings we don't know give null for Grit and Ember. */
export function derive(sheet: CharacterSheet) {
  const calling = callingInfo(sheet.calling)
  const ancestry = ancestryInfo(sheet.ancestry)
  const armor = character.armor.find(a => a.id === sheet.armor)?.dodge ?? 0
  return {
    maxGrit: calling ? calling.grit.base + attributeValue(sheet, 'Might') + sheet.level * calling.grit.perLevel : null,
    maxEmber: calling ? calling.ember.base + attributeValue(sheet, calling.ember.attribute) : null,
    dodge: attributeValue(sheet, 'Grace') + armor + (sheet.shield ? character.shieldDodge : 0),
    will: attributeValue(sheet, 'Spirit'),
    speed: creation.speed,
    woundSlots: character.woundSlots.base + (ancestry?.extraWoundSlots ?? 0),
  }
}

/** The Bane die each Attribute carries from Wounds: the first Wound is d4, repeats step up (§6.6). */
export function woundBanes(sheet: CharacterSheet): Partial<Record<string, string>> {
  const count: Record<string, number> = {}
  for (const attribute of sheet.wounds) if (attribute) count[attribute] = (count[attribute] ?? 0) + 1
  const dice = core.boonDice
  return Object.fromEntries(Object.entries(count).map(([attribute, n]) => [attribute, `d${dice[Math.min(n, dice.length) - 1]}`]))
}

/** How the starting array (+3, +2, +1, +1, 0, −1) and the Ancestry bonus explain the Attributes now on the sheet. */
export function attributeArray(sheet: CharacterSheet) {
  const info = ancestryInfo(sheet.ancestry)
  const options: (string | null)[] = info?.bonus.any ? [...ATTRIBUTE_NAMES] : info?.bonus.attributes ?? [null]
  let best: { bonus: string | null; left: number[]; mismatches: number } | undefined
  for (const bonus of options) {
    const pool = [...ARRAY]
    let mismatches = 0
    for (const attribute of ATTRIBUTE_NAMES) {
      const base = attributeValue(sheet, attribute) - (attribute === bonus ? 1 : 0)
      const at = pool.indexOf(base)
      if (at >= 0) pool.splice(at, 1)
      else mismatches++
    }
    if (!best || mismatches < best.mismatches) best = { bonus, left: pool, mismatches }
  }
  const { bonus, left, mismatches } = best!
  const tooHigh = sheet.level === 1 && ATTRIBUTE_NAMES.some(a => attributeValue(sheet, a) > creation.ancestryCapAtLevel1)
  return { bonus, left, complete: mismatches === 0, tooHigh }
}

/** Skill ranks to spend at level 1 (§3): Calling ranks, Background ranks and the free ranks. */
export function skillBudget(sheet: CharacterSheet) {
  const calling = callingInfo(sheet.calling)
  const background = backgroundInfo(sheet.background)
  const total = Object.values(calling?.skills ?? {}).reduce((a, b) => a + b, 0)
    + creation.backgroundSkillRanks + creation.freeSkillRanks + (ancestryInfo(sheet.ancestry)?.extraSkillRanks ?? 0)
  const used = Object.values(sheet.skills).reduce((a, b) => a + b, 0)
  const source = (skill: string) =>
    (calling?.skills[skill] ? 'C' : '') + (background?.skills.includes(skill) ? 'B' : '')
  return { used, total, left: total - used, source }
}

/** How many talents, spells and minerals this hero should have at this level. */
export function allowances(sheet: CharacterSheet) {
  const { casting, alchemy } = callingInfo(sheet.calling) ?? {}
  return {
    talents: creation.talentsAtLevel1 + (sheet.level - 1) * creation.talentsPerLevel + (ancestryInfo(sheet.ancestry)?.extraTalents ?? 0),
    spells: casting ? casting.startingSpells + (sheet.level - 1) * casting.perLevel : 0,
    minerals: alchemy
      ? alchemy.startingMinerals + (sheet.talents.includes(alchemy.extraMinerals.talent) ? alchemy.extraMinerals.count : 0)
      : 0,
  }
}

/** The creation guide: rules §3 steps 1–8, each with what the hero has so far. */
export interface Step { id: string; title: string; summary: string; done: boolean }
export function creationSteps(sheet: CharacterSheet): Step[] {
  const array = attributeArray(sheet)
  const skills = skillBudget(sheet)
  const d = derive(sheet)
  const hasAncestry = Boolean(ancestryInfo(sheet.ancestry))
  const hasCalling = Boolean(callingInfo(sheet.calling))
  return [
    { id: 'ancestry', title: 'Ancestry', summary: sheet.ancestry || 'pick one', done: hasAncestry },
    { id: 'calling', title: 'Calling', summary: sheet.calling || 'pick one', done: hasCalling },
    { id: 'attributes', title: 'Attributes', summary: array.complete ? 'placed' : `${array.left.length} to place`, done: array.complete },
    { id: 'background', title: 'Background', summary: sheet.background || 'pick one', done: Boolean(sheet.background) },
    { id: 'skills', title: 'Skills', summary: `${skills.used} of ${skills.total} ranks`, done: hasCalling && skills.left === 0 },
    { id: 'gear', title: 'Gear', summary: callingInfo(sheet.calling)?.kit.split(',')[0] ?? 'from your kit', done: Boolean(sheet.gear.trim()) },
    { id: 'numbers', title: 'Numbers', summary: 'fill Grit & Ember', done: hasCalling && d.maxGrit !== null && sheet.grit === d.maxGrit && sheet.ember === d.maxEmber },
    { id: 'oath', title: 'Oath', summary: sheet.oath ? 'written' : 'not yet', done: Boolean(sheet.oath.trim()) },
  ]
}

/** A hero with the Calling kit written in: gear, silver, Supply, armor and shield (§7.3). Doesn't touch skills or talents. */
export function withKit(sheet: CharacterSheet): CharacterSheet {
  const calling = callingInfo(sheet.calling)
  if (!calling) return sheet
  const extras = `Backpack, bedroll, rope, torches, ${creation.startingSupply} Supply`
  return {
    ...sheet,
    armor: calling.armor,
    shield: calling.shield,
    silver: creation.startingSilver,
    supplyDie: character.supplyDice[0],
    gear: `${calling.kit}. ${extras}.`,
  }
}

/** A hero at full Grit and Ember. */
export function withFullVitals(sheet: CharacterSheet): CharacterSheet {
  const d = derive(sheet)
  return { ...sheet, grit: d.maxGrit ?? sheet.grit, ember: d.maxEmber ?? sheet.ember }
}

/** Picking a Background adds its contact once, and never overwrites what the player wrote. */
export function withBackground(sheet: CharacterSheet, name: string): CharacterSheet {
  const background = backgroundInfo(name)
  const previous = backgroundInfo(sheet.background)
  let contacts = sheet.contacts
  if (previous && contacts.trim() === `${previous.contact} (from ${previous.name})`) contacts = ''
  if (background && !contacts.trim()) contacts = `${background.contact} (from ${background.name})`
  return { ...sheet, background: name, contacts }
}

/**
 * Picking a Calling: the signature feature follows it, talents, spells and minerals from the old Calling's lists are dropped
 * (anything the player wrote themselves stays), and the new Calling's always-known spells are added.
 */
export function withCalling(sheet: CharacterSheet, name: string): CharacterSheet {
  const previous = callingInfo(sheet.calling)
  const next = callingInfo(name)
  const oldSpells = new Set(spellList(sheet.calling).map(s => s.name))
  const oldTalents = new Set(previous?.talents.map(t => t.name))
  const spells = sheet.spells.filter(s => !oldSpells.has(s.name))
  for (const always of next?.casting?.always ?? []) {
    const spell = spellList(name).find(s => s.name === always)
    if (spell && !spells.some(s => s.name === always)) spells.push({ ...spell })
  }
  const oldMinerals = new Set(next?.alchemy ? [] : mineralList(sheet.calling).map(m => m.name))
  const ownSignature = sheet.signature && sheet.signature !== previous?.signature
  return {
    ...sheet,
    calling: name,
    signature: ownSignature ? sheet.signature : next?.signature ?? '',
    talents: sheet.talents.filter(t => !oldTalents.has(t)),
    spells,
    minerals: sheet.minerals.filter(m => !oldMinerals.has(m)),
  }
}
