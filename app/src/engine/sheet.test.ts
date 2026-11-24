import { describe, expect, it } from 'vitest'
import { parseSheet } from '../../../api/src/sheet.ts'
import {
  allowances, attributeArray, creationSteps, derive, signed, skillBudget, spellList,
  withBackground, withCalling, withFullVitals, withKit, woundBanes,
} from './sheet.ts'

// Kestrel Ashvane, the mockup hero (docs/mockups): Emberkin Hexer, level 1.
const kestrel = () => parseSheet({
  name: 'Kestrel Ashvane', ancestry: 'Emberkin', calling: 'Hexer', background: 'Hedge scholar',
  attributes: { might: -1, grace: 1, wits: 2, lore: 3, spirit: 2, presence: 0 },
  skills: { Spellcraft: 2, Arcana: 2, History: 1, Insight: 1, Notice: 1 },
})

describe('derived numbers (§3.5)', () => {
  it('matches the mockup: Grit 10, Ember 7, Dodge +1, Will +2, Speed 2', () => {
    expect(derive(kestrel())).toEqual({ maxGrit: 10, maxEmber: 7, dodge: 1, will: 2, speed: 2, woundSlots: 3 })
  })
  it('adds armor and shield to Dodge and the level to Grit', () => {
    const d = derive({ ...kestrel(), level: 3, armor: 'heavy', shield: true })
    expect(d.dodge).toBe(1 + 3 + 1)
    expect(d.maxGrit).toBe(8 - 1 + 3 * 3)
  })
  it('gives Stoneborn a fourth Wound slot', () => {
    expect(derive({ ...kestrel(), ancestry: 'Stoneborn' }).woundSlots).toBe(4)
  })
  it('has no Grit or Ember without a known Calling', () => {
    expect(derive({ ...kestrel(), calling: '' })).toMatchObject({ maxGrit: null, maxEmber: null })
  })
  it('uses each Calling casting attribute for Ember', () => {
    const warden = { ...kestrel(), calling: 'Warden' }
    expect(derive(warden).maxEmber).toBe(2 + 2)
    expect(derive({ ...warden, calling: 'Blade' }).maxEmber).toBe(2 + 1)
  })
})

describe('Wound Banes (§6.6)', () => {
  it('steps d4, d6, d8 for repeats on one Attribute', () => {
    expect(woundBanes({ ...kestrel(), wounds: ['Grace'] })).toEqual({ Grace: 'd4' })
    expect(woundBanes({ ...kestrel(), wounds: ['Grace', 'Might', 'Grace'] })).toEqual({ Grace: 'd6', Might: 'd4' })
    expect(woundBanes({ ...kestrel(), wounds: ['Grace', 'Grace', 'Grace', 'Grace'] })).toEqual({ Grace: 'd8' })
  })
})

describe('the starting array', () => {
  it('accepts the array plus the Ancestry bonus', () => {
    expect(attributeArray(kestrel())).toMatchObject({ complete: true, left: [], bonus: 'Spirit', tooHigh: false })
  })
  it('lets a Human put the bonus anywhere', () => {
    const human = { ...kestrel(), ancestry: 'Human', attributes: { might: 0, grace: 1, wits: 2, lore: 4, spirit: 1, presence: -1 } }
    expect(attributeArray(human)).toMatchObject({ complete: true, bonus: 'Lore' })
  })
  it('shows what is left to place on a blank hero', () => {
    const blank = parseSheet({ name: 'A', ancestry: 'Emberkin' })
    expect(attributeArray(blank)).toMatchObject({ complete: false, left: [3, 2, 1, 1] })
  })
  it('warns when an Attribute is above +4 at level 1', () => {
    expect(attributeArray({ ...kestrel(), attributes: { ...kestrel().attributes, lore: 5 } }).tooHigh).toBe(true)
  })
})

describe('skill ranks', () => {
  it('budgets Calling + Background + 2 free ranks, plus 1 for a Human', () => {
    expect(skillBudget(kestrel())).toMatchObject({ used: 7, total: 3 + 2 + 2 })
    expect(skillBudget({ ...kestrel(), ancestry: 'Human' }).total).toBe(8)
  })
  it('tags where a rank can come from', () => {
    const { source } = skillBudget(kestrel())
    expect([source('Arcana'), source('Spellcraft'), source('History'), source('Melee')]).toEqual(['CB', 'C', 'B', ''])
  })
})

describe('talents and spells', () => {
  it('gives 2 talents at level 1 and 1 more per level, +1 for a Human', () => {
    expect(allowances(kestrel())).toEqual({ talents: 2, spells: 3 })
    expect(allowances({ ...kestrel(), level: 4, ancestry: 'Human' })).toEqual({ talents: 6, spells: 6 })
  })
  it('lists spells only for casters', () => {
    expect(spellList('Hexer').map(s => s.name)).toContain('Forge Lance')
    expect(spellList('Mender')[0].name).toBe('Mend Wounds')
    expect(spellList('Blade')).toEqual([])
    expect(allowances({ ...kestrel(), calling: 'Blade' }).spells).toBe(0)
  })
  it('keeps the Forge Lance at 3 Ember (decisions 2026-11-21)', () => {
    expect(spellList('Hexer').find(s => s.name === 'Forge Lance')?.ember).toBe(3)
  })
})

describe('helpers that fill the sheet in', () => {
  it('writes the Calling kit', () => {
    const kit = withKit({ ...kestrel(), calling: 'Mender' })
    expect(kit).toMatchObject({ armor: 'medium', shield: true, silver: 20, supplyDie: 'd8' })
    expect(kit.gear).toContain('holy symbol')
    expect(kit.gear).toContain('3 Supply')
  })
  it('fills Grit and Ember to full', () => {
    expect(withFullVitals(kestrel())).toMatchObject({ grit: 10, ember: 7 })
  })
  it('adds the Background contact without overwriting the player\'s own', () => {
    const picked = withBackground(kestrel(), 'Deserter')
    expect(picked.contacts).toBe('An old squad-mate, still enlisted (from Deserter)')
    expect(withBackground(picked, 'Hedge scholar').contacts).toBe('A rival academic (from Hedge scholar)')
    expect(withBackground({ ...kestrel(), contacts: 'My own' }, 'Deserter').contacts).toBe('My own')
  })
})

describe('picking a Calling', () => {
  it("follows with the signature feature and drops the old Calling's talents and spells", () => {
    const hexer = { ...kestrel(), signature: 'Arcane Casting', talents: ['Familiar', 'My own'], spells: [{ name: 'Blink', ember: 1, target: 'Self', effect: '' }] }
    const warden = withCalling(hexer, 'Warden')
    expect(warden).toMatchObject({ calling: 'Warden', signature: 'Bulwark', talents: ['My own'], spells: [] })
  })
  it('keeps a signature the player wrote and adds Mend Wounds for a Mender', () => {
    const mender = withCalling({ ...kestrel(), signature: 'Mine' }, 'Mender')
    expect(mender.signature).toBe('Mine')
    expect(mender.spells.map(s => s.name)).toEqual(['Mend Wounds'])
  })
})

describe('creation steps (§3)', () => {
  it('walks the eight steps', () => {
    const steps = creationSteps(kestrel())
    expect(steps.map(s => s.id)).toEqual(['ancestry', 'calling', 'attributes', 'background', 'skills', 'gear', 'numbers', 'oath'])
    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(['ancestry', 'calling', 'attributes', 'background', 'skills'])
  })
  it('is all done once gear, vitals and the Oath are in', () => {
    const full = withFullVitals(withKit({ ...kestrel(), oath: 'Learn what fell from the sky.' }))
    expect(creationSteps(full).every(s => s.done)).toBe(true)
  })
  it('starts empty', () => {
    expect(creationSteps(parseSheet({ name: 'A' })).filter(s => s.done)).toEqual([])
  })
})

describe('signed', () => {
  it('shows + and a real minus', () => {
    expect([signed(3), signed(0), signed(-1)]).toEqual(['+3', '0', '−1'])
  })
})
