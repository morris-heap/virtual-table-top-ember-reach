import { describe, expect, it } from 'vitest'
import { parseSheet } from '../../../api/src/sheet.ts'
import character from '../../../data/character.json'
import creation from '../../../data/creation.json'
import { helpFor, RULES_URL } from './help.ts'
import { derive, type CharacterSheet } from './sheet.ts'

const TOPICS = [
  'name', 'player', 'level', 'ancestry', 'calling', 'background', 'oath', 'attributes', 'attribute:Might', 'attribute:Lore',
  'maxGrit', 'maxEmber', 'dodge', 'will', 'speed', 'skills', 'gear', 'armor', 'shield', 'silver', 'supplyDie',
  'talents', 'spells', 'attacks', 'attackName', 'toHit', 'damage', 'properties', 'attackNotes', 'gearList', 'notes', 'wounds', 'contacts',
]
const hero = (ancestry: string, calling: string, level = 1): CharacterSheet => parseSheet({
  name: 'Test', ancestry, calling, level, attributes: { might: 1, grace: 2, wits: 0, lore: 3, spirit: 1, presence: -1 },
})
const pairs = character.ancestries.flatMap(a => character.callings.map(c => [a, c] as const))

describe('help for every Ancestry and Calling', () => {
  it.each(pairs)('%s %s: every topic has text and a rules link', (ancestry, calling) => {
    const sheet = hero(ancestry, calling)
    for (const topic of TOPICS) {
      const help = helpFor(topic, sheet)
      expect(help.paragraphs.length, topic).toBeGreaterThan(0)
      expect(help.rule.href.startsWith(`${RULES_URL}#`), topic).toBe(true)
    }
    expect(helpFor('calling', sheet).forLine).toBe(`For your ${ancestry} ${calling}`)
  })

  it.each(pairs)('%s %s: the Grit and Ember math is this hero\'s own numbers', (ancestry, calling) => {
    const sheet = hero(ancestry, calling)
    const d = derive(sheet)
    expect(helpFor('maxGrit', sheet).math).toMatch(new RegExp(`= ${d.maxGrit}$`))
    expect(helpFor('maxEmber', sheet).math).toMatch(new RegExp(`= ${d.maxEmber}$`))
  })

  it('names the Ancestry bonus and the Calling casting Attribute in the Attributes help', () => {
    const text = helpFor('attributes', hero('Emberkin', 'Hexer')).paragraphs.join(' ')
    expect(text).toContain('Emberkin: +1 Spirit')
    expect(text).toContain('Hexer casts and fuels Ember with Lore')
  })

  it('gives general help before an Ancestry and Calling are chosen', () => {
    const blank = parseSheet({ name: 'A' })
    expect(helpFor('attributes', blank).forLine).toBeUndefined()
    expect(helpFor('maxGrit', blank).math).toBe('Calling base + Might + (level × Calling growth)')
  })

  it('links every Calling to its own rules section', () => {
    const anchors = character.callings.map(c => helpFor('calling', hero('Human', c)).rule.href)
    expect(new Set(anchors).size).toBe(character.callings.length)
  })
})

describe('derived numbers at levels 1 and 10 for every Calling (§3.5)', () => {
  it.each(character.callings.flatMap(c => [1, 10].map(level => [c, level] as const)))('%s at level %i', (calling, level) => {
    const info = creation.callings[calling as keyof typeof creation.callings]
    const sheet = hero('Human', calling, level)
    const castingAttribute = sheet.attributes[info.ember.attribute.toLowerCase() as keyof CharacterSheet['attributes']]
    const d = derive(sheet)
    expect(d.maxGrit).toBe(info.grit.base + sheet.attributes.might + level * info.grit.perLevel)
    expect(d.maxEmber).toBe(info.ember.base + castingAttribute)
  })

  it('matches the rules table by hand for level 1 and 10 Hexers (Might +1, Lore +3)', () => {
    expect(derive(hero('Human', 'Hexer', 1))).toMatchObject({ maxGrit: 8 + 1 + 3, maxEmber: 4 + 3 })
    expect(derive(hero('Human', 'Hexer', 10))).toMatchObject({ maxGrit: 8 + 1 + 30, maxEmber: 4 + 3 })
    expect(derive(hero('Human', 'Warden', 10))).toMatchObject({ maxGrit: 12 + 1 + 50, maxEmber: 2 + 1 })
  })
})
