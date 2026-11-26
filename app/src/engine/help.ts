// The circled "?" help on the character sheet (docs/mockups/character-sheet-edit.html).
// Text is tailored to the hero's Ancestry and Calling, and links to the matching rules section:
// the rules docs are the help docs. Numbers come from /data through engine/sheet.ts.
import creation from '../../../data/creation.json'
import character from '../../../data/character.json'
import {
  allowances, ancestryInfo, attributeArray, callingInfo, derive, signed, skillBudget,
  type CharacterSheet,
} from './sheet.ts'

export const RULES_URL = 'https://github.com/morris-heap/game-table-top/blob/main/rules/core-rules.md'

export interface Help {
  title: string
  /** "For your Emberkin Hexer", when the hero has chosen enough to tailor the text. */
  forLine?: string
  paragraphs: string[]
  /** An optional line of math, shown in monospace. */
  math?: string
  rule: { label: string; href: string }
}

const rule = (label: string, anchor: string) => ({ label, href: `${RULES_URL}#${anchor}` })
const CALLING_ANCHOR: Record<string, string> = {
  Warden: '41-warden-the-shield-bearer', Blade: '42-blade-the-duelist', Hexer: '43-hexer-the-arcanist',
  Mender: '44-mender-the-flamekeeper', Pathfinder: '45-pathfinder-the-hunter-scout', Silvertongue: '46-silvertongue-the-rogue-bard',
  Kilnheart: '47-kilnheart-the-mineral-alchemist',
}
const ATTRIBUTE_COVERS: Record<string, string> = {
  Might: 'Strength, endurance, heavy weapons, grappling.',
  Grace: 'Agility, reflexes, stealth, finesse and ranged weapons, dodging.',
  Wits: 'Perception, instinct, reaction speed, initiative.',
  Lore: 'Learning, memory, reasoning, arcane magic.',
  Spirit: 'Willpower, faith, inner fire, divine magic, resisting fear.',
  Presence: 'Charm, intimidation, leadership, deception.',
}

function forLine(sheet: CharacterSheet) {
  const parts = [sheet.ancestry, sheet.calling].filter(Boolean)
  return parts.length ? `For your ${parts.join(' ')}` : undefined
}

/** Help for one field. `topic` is a field name, or `attribute:Might` for one Attribute. */
export function helpFor(topic: string, sheet: CharacterSheet): Help {
  const calling = callingInfo(sheet.calling)
  const ancestry = ancestryInfo(sheet.ancestry)
  const d = derive(sheet)
  const base = { forLine: forLine(sheet) }

  if (topic.startsWith('attribute:')) {
    const name = topic.slice('attribute:'.length)
    const extra: string[] = []
    if (calling?.ember.attribute === name) extra.push(`Your ${sheet.calling} fuels Ember with ${name}.`)
    if (name === 'Might') extra.push(`Might adds to your Grit${d.maxGrit === null ? '' : ` (now ${d.maxGrit})`}.`)
    if (name === 'Grace') extra.push('Grace adds to your Dodge.')
    if (name === 'Spirit') extra.push('Spirit is your Will.')
    return {
      title: name, ...base, paragraphs: [ATTRIBUTE_COVERS[name] ?? '', ...extra].filter(Boolean),
      rule: rule('Core rules §3.1 Attributes', '31-attributes'),
    }
  }

  switch (topic) {
    case 'name': return { title: 'Name', paragraphs: ['What the table calls your hero.'], rule: rule('Core rules §3 Making a hero', '3-making-a-hero') }
    case 'player': return { title: 'Player', paragraphs: ['Your name, so the table knows whose hero this is.'], rule: rule('Core rules §3 Making a hero', '3-making-a-hero') }
    case 'level': return {
      title: 'Level', paragraphs: [`Heroes run from level ${character.levels.min} to ${character.levels.max}. New heroes start at level ${character.levels.min}.`,
        'Each level adds Grit, 1 talent and, for casters, 1 spell.'],
      rule: rule('Core rules §9 Advancement', '9-advancement'),
    }
    case 'ancestry': return {
      title: 'Ancestry', ...base,
      paragraphs: ancestry
        ? [`${sheet.ancestry}: ${ancestry.trait}.`, ancestry.bonus.any ? '+1 to any Attribute.' : `+1 ${ancestry.bonus.attributes!.join(' or ')}.`]
        : ['Your people. It gives +1 to an Attribute and a trait.'],
      rule: rule('Core rules §3.2 Ancestries', '32-ancestries'),
    }
    case 'calling': return {
      title: 'Calling', ...base,
      paragraphs: calling
        ? [`${sheet.calling}: Grit ${calling.grit.base} + ${calling.grit.perLevel}/level, Ember ${calling.ember.base} + ${calling.ember.attribute}.`,
          `Signature: ${calling.signature}. ${calling.signatureText}`]
        : ['Your class. It sets your Grit, Ember, starting skills, signature feature and talents.'],
      rule: rule(calling ? `Core rules §4 ${sheet.calling}` : 'Core rules §4 Callings', calling ? CALLING_ANCHOR[sheet.calling] : '4-callings'),
    }
    case 'background': return {
      title: 'Background', ...base,
      paragraphs: [`Gives ${creation.backgroundSkillRanks} skill ranks and a starting contact. Pick one, or write your own with the GM.`],
      rule: rule('Core rules §3.4 Backgrounds', '34-backgrounds-pick-one-or-write-your-own-with-the-gm'),
    }
    case 'oath': return {
      title: 'Oath', paragraphs: ['One thing your hero has sworn to do. Living by it earns rewards at the table.'],
      rule: rule('Core rules §8.3 Oaths', '83-oaths'),
    }
    case 'attributes': {
      const array = attributeArray(sheet)
      const lines = [`Assign ${creation.attributeArray.map(signed).join(', ')} however you like, then add your Ancestry bonus. Max ${signed(creation.ancestryCapAtLevel1)} at level 1.`]
      if (ancestry) lines.push(ancestry.bonus.any ? `${sheet.ancestry}: +1 to any Attribute, your choice.` : `${sheet.ancestry}: +1 ${ancestry.bonus.attributes!.join(' or ')}.`)
      if (calling) lines.push(`${sheet.calling} casts and fuels Ember with ${calling.ember.attribute}, so it's worth a high number.`)
      lines.push(array.complete ? 'Every number in the array is placed.' : `Still to place: ${array.left.map(signed).join(', ') || 'none'}.`)
      return { title: 'Attributes', ...base, paragraphs: lines, rule: rule('Core rules §3.1 Attributes', '31-attributes') }
    }
    case 'maxGrit': return {
      title: 'Max Grit', ...base, paragraphs: ['Your stamina. Damage comes off Grit first; at 0 Grit hits become Wounds.'],
      math: calling ? `${calling.grit.base} + Might (${signed(sheet.attributes.might)}) + ${calling.grit.perLevel} × level ${sheet.level} = ${d.maxGrit}` : 'Calling base + Might + (level × Calling growth)',
      rule: rule('Core rules §6.6 Grit and Wounds', '66-grit-wounds-and-going-down'),
    }
    case 'maxEmber': return {
      title: 'Max Ember', ...base, paragraphs: ['Fuel for spells and talents. Short rest: half back. Long rest: all of it.'],
      math: calling ? `${calling.ember.base} + ${calling.ember.attribute} (${signed(sheet.attributes[calling.ember.attribute.toLowerCase() as keyof CharacterSheet['attributes']])}) = ${d.maxEmber}` : 'Calling base + your casting Attribute',
      rule: rule('Core rules §3.5 Derived numbers', '35-derived-numbers'),
    }
    case 'dodge': return {
      title: 'Dodge', ...base, paragraphs: ['Added to your dodge rolls: the GM never rolls, so you do.'],
      math: `Grace (${signed(sheet.attributes.grace)}) + armor + shield = ${signed(d.dodge)}`,
      rule: rule('Core rules §6.5 Dodging', '65-dodging-heroes-roll-here-too'),
    }
    case 'will': return {
      title: 'Will', ...base, paragraphs: ['Added to your rolls against mental attacks.'],
      math: `Spirit = ${signed(d.will)}`, rule: rule('Core rules §3.5 Derived numbers', '35-derived-numbers'),
    }
    case 'speed': return {
      title: 'Speed', paragraphs: [`${d.speed} zones (10 m) per Move.`], rule: rule('Core rules §6.3 Zones, not squares', '63-zones-not-squares'),
    }
    case 'skills': {
      const budget = skillBudget(sheet)
      return {
        title: 'Skills', ...base,
        paragraphs: [`Ranks run ${character.skillRank.min}–${character.skillRank.max} (rank ${character.skillRank.maxAtLevel7} at level 7+). Rank 0 is fine: you just get no bonus.`,
          calling ? `${sheet.calling} gives ${Object.entries(calling.skills).map(([s, r]) => `${s} ${r}`).join(', ')}.` : 'Your Calling gives starting ranks.',
          `Spend ${creation.freeSkillRanks} more anywhere, plus ${creation.backgroundSkillRanks} from your Background${ancestry?.extraSkillRanks ? ` and ${ancestry.extraSkillRanks} for ${sheet.ancestry}` : ''}.`],
        math: `${budget.used} of ${budget.total} ranks spent`, rule: rule('Core rules §3.3 Skills', '33-skills'),
      }
    }
    case 'gear': return {
      title: 'Gear', ...base,
      paragraphs: [calling ? `${sheet.calling} kit: ${calling.kit}. Plus backpack, bedroll, rope, torches, ${creation.startingSupply} Supply and ${creation.startingSilver} silver.` : 'Pick a Calling to see its kit.',
        'Heavy armor needs Might +1. Medium and heavy armor give a Bane on some Tests.'],
      rule: rule('Core rules §7.3 Calling kits', '73-calling-kits'),
    }
    case 'armor': return {
      title: 'Armor', paragraphs: ['Adds to Dodge. Medium armor: Bane on Stealth. Heavy: Bane on Stealth and Athletics, and needs Might +1.'],
      rule: rule('Core rules §7.2 Armor', '72-armor'),
    }
    case 'shield': return { title: 'Shield', paragraphs: [`+${character.shieldDodge} Dodge. Uses a hand.`], rule: rule('Core rules §7.2 Armor', '72-armor') }
    case 'silver': return { title: 'Silver', paragraphs: ['Your money.'], rule: rule('Core rules §7.3 Calling kits', '73-calling-kits') }
    case 'supplyDie': return {
      title: 'Supply', paragraphs: ['Your party\'s rations and torches. The die shrinks as you use them, from d8 to d4 to out.'],
      rule: rule('Core rules §8.1 Supply', '81-supply'),
    }
    case 'talents': {
      const a = allowances(sheet)
      return {
        title: 'Talents', ...base,
        paragraphs: [`You pick ${creation.talentsAtLevel1} talents at level 1, then ${creation.talentsPerLevel} more each level${ancestry?.extraTalents ? `, and ${ancestry.extraTalents} extra for ${sheet.ancestry}` : ''}.`,
          calling ? `Signature: ${calling.signature}. ${calling.signatureText}` : 'Pick a Calling to see its talents.'],
        math: `${a.talents} talents at level ${sheet.level}`, rule: rule('Core rules §4 Callings', calling ? CALLING_ANCHOR[sheet.calling] : '4-callings'),
      }
    }
    case 'spells': {
      const casting = calling?.casting
      return {
        title: 'Spells', ...base,
        paragraphs: casting
          ? [`${sheet.calling}s start with ${casting.startingSpells} ${casting.list} spells and learn ${casting.perLevel} per level.`,
            `Cast with d20 + ${casting.attribute} + Spellcraft vs the spell's DC.`]
          : ['Only casters (Hexer, Mender) have spell lists. Add a spell by hand if the GM gave you one.'],
        rule: rule('Core rules §5 Magic', '5-magic'),
      }
    }
    case 'minerals': {
      const alchemy = calling?.alchemy
      return {
        title: 'Minerals', ...base,
        paragraphs: alchemy
          ? [`${sheet.calling}s know ${alchemy.startingMinerals} minerals at level 1. ${alchemy.extraMinerals.talent} teaches ${alchemy.extraMinerals.count} more.`,
            `Swallowing one costs ${alchemy.emberCost} Ember. You can't hold both minerals from one Vein.`,
            `Deep minerals (${creation.minerals.deep.map(m => m.name).join(', ')}) are treasure only a Kilnheart can swallow, without using an Action. Write your doses in your gear.`]
          : ['Only a Kilnheart learns minerals.'],
        math: alchemy ? `${allowances(sheet).minerals} minerals known` : undefined,
        rule: rule('Core rules §4.7 Kilnheart', CALLING_ANCHOR.Kilnheart),
      }
    }
    case 'attacks': return {
      title: 'Attacks', ...base,
      paragraphs: ["To hit is what you roll to hit, like 1d20 + 1. If the total meets the foe's Defense, the attack hits. The GM never rolls.",
        'It is the Attribute you attack with plus your Melee, Ranged or Spellcraft rank. Might for heavy weapons, Grace for finesse and ranged ones.',
        'Properties are what the attack does besides damage: range, fire, throwable. Use Notes for anything else.'],
      rule: rule('Core rules §6.4 Attacking', '64-attacking-heroes-roll'),
    }
    case 'attackName': return { title: 'Weapon / Spell', paragraphs: ['What you attack with, like Dagger or Fireball. Attack spells you know can be listed here too.'], rule: rule('Core rules §6.4 Attacking', '64-attacking-heroes-roll') }
    case 'toHit': return { title: 'To hit', ...base, paragraphs: ["What you roll to hit, like 1d20 + 1: a d20 plus the Attribute you attack with and your Melee, Ranged or Spellcraft rank. If the total meets the foe's Defense, you hit."], rule: rule('Core rules §6.4 Attacking', '64-attacking-heroes-roll') }
    case 'damage': return { title: 'Damage', paragraphs: ['What you roll on a hit, like 1d6 + 1. Weapon dice are in the gear tables: d6 light, d8 versatile, d12 heavy.'], rule: rule('Core rules §7.1 Weapons', '71-weapons') }
    case 'properties': return { title: 'Properties', paragraphs: ['What the attack does besides damage: range, fire, throwable, two-handed.'], rule: rule('Core rules §7.1 Weapons', '71-weapons') }
    case 'attackNotes': return { title: 'Notes', paragraphs: ['Anything else you want to remember about this attack.'], rule: rule('Core rules §6.4 Attacking', '64-attacking-heroes-roll') }
    case 'gearList': return { title: 'Gear list', ...base, paragraphs: [calling ? `Your ${sheet.calling} kit: ${calling.kit}.` : 'Everything your hero carries.'], rule: rule('Core rules §7.3 Calling kits', '73-calling-kits') }
    case 'notes': return { title: 'Notes', paragraphs: ["Anything you want to remember: clues, debts, the GM's rulings."], rule: rule('Core rules §3.4 Backgrounds', '34-backgrounds-pick-one-or-write-your-own-with-the-gm') }
    case 'wounds': return {
      title: 'Wounds', paragraphs: [`You have ${d.woundSlots} slots. For each Wound, roll a d6 to pick the Attribute: 1 Might, 2 Grace, 3 Wits, 4 Lore, 5 Spirit, 6 Presence. Every Test with it takes a Bane, and repeats stack (d4, d6, d8).`,
        `Fill every slot and you go Down. ${character.deathRollFailures} failed death rolls and you die.`],
      rule: rule('Core rules §6.6 Grit and Wounds', '66-grit-wounds-and-going-down'),
    }
    case 'contacts': return {
      title: 'Contacts & notes', ...base, paragraphs: ['Your Background gives a starting contact. Write down people, debts and anything the GM tells you.'],
      rule: rule('Core rules §3.4 Backgrounds', '34-backgrounds-pick-one-or-write-your-own-with-the-gm'),
    }
    default: return { title: topic, paragraphs: [], rule: rule('Core rules', '') }
  }
}
