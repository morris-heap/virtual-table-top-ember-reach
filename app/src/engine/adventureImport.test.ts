import { describe, expect, it } from 'vitest'
import adventureData from '../../../data/adventure.json'
import { parseImport } from './adventureImport.ts'

const good = {
  title: 'The Drowned Bell',
  summary: 'A flooded chapel.',
  levelMin: 1,
  levelMax: 3,
  scenes: [{ id: 'a', title: 'Causeway', type: 'exploration', text: 'Tide.', enemies: [{ id: 'keeper', count: 3 }], npcs: [] }, { title: 'Belfry', type: 'boss', text: '', enemies: [], npcs: [] }],
  enemies: [{ id: 'keeper', name: 'Drowned Keeper' }],
  hooks: ['Who paid them?'],
}

describe('parseImport', () => {
  it('reads plain JSON and fills a missing scene id', () => {
    const r = parseImport(JSON.stringify(good))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.draft.scenes[0].id).toBe('a')
      expect(r.draft.scenes[1].id).toMatch(/^scene-/)
      expect(r.draft.visibility).toBe('private')
    }
  })
  it('strips a code fence and chatter around it', () => {
    expect(parseImport('Here you go:\n```json\n' + JSON.stringify(good) + '\n```\nEnjoy!').ok).toBe(true)
  })
  it('replaces a duplicate scene id', () => {
    const r = parseImport(JSON.stringify({ ...good, scenes: [good.scenes[0], good.scenes[0]] }))
    expect(r.ok && r.draft.scenes[0].id !== r.draft.scenes[1].id).toBe(true)
  })
  it('rejects bad input in plain words', () => {
    expect(parseImport('').ok).toBe(false)
    expect(parseImport('not json').ok).toBe(false)
    expect(parseImport('[1]').ok).toBe(false)
    const r = parseImport(JSON.stringify({ ...good, title: '', scenes: [{ ...good.scenes[0], type: 'dance' }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/title/i)
  })
  it('reads enemies and NPCs, filling ids and defaults', () => {
    const r = parseImport(JSON.stringify({
      ...good,
      scenes: [],
      enemies: [{ name: 'Ash Rat', tier: 'MINION', defense: 10, grit: 1, attackDc: 11, damage: 3, traits: ['Swarm'] }, { name: 'Wolf', tier: 'nonsense' }],
      npcs: [{ name: 'Maren', attitude: 'Friendly' }, { name: 'Oswin' }],
    }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.draft.enemies[0]).toMatchObject({ tier: 'minion', damage: '3', willDc: null })
      expect(r.draft.enemies[1].tier).toBe('standard')
      expect(r.draft.enemies[0].id).not.toBe(r.draft.enemies[1].id)
      expect(r.draft.npcs.map(n => n.attitude)).toEqual(['friendly', 'neutral'])
    }
  })
  it('reports a scene that uses an enemy or NPC that is not in the adventure', () => {
    const r = parseImport(JSON.stringify({ ...good, scenes: [{ ...good.scenes[0], enemies: [{ id: 'ghost', count: 1 }], npcs: ['nobody'] }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/enemy that is not in the adventure[\s\S]*NPC that is not in the adventure/)
  })
  it('reports an enemy with no name and a bad stat', () => {
    const r = parseImport(JSON.stringify({ ...good, enemies: [{ defense: 0 }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Enemy 1 needs a name/)
  })
  it('imports an adventure without enemies or NPCs', () => {
    const r = parseImport(JSON.stringify({ ...good, scenes: [], enemies: [] }))
    expect(r.ok && r.draft.enemies.length === 0 && r.draft.npcs.length === 0).toBe(true)
  })
  it('rejects enemies that are not a list', () => {
    expect(parseImport(JSON.stringify({ ...good, enemies: 'rat' })).ok).toBe(false)
  })
  it('rejects too many scenes', () => {
    const scenes = Array.from({ length: adventureData.limits.maxScenes + 1 }, (_, i) => ({ id: `s${i}`, title: 't', type: 'social', text: '', enemies: [], npcs: [] }))
    expect(parseImport(JSON.stringify({ ...good, scenes })).ok).toBe(false)
  })
})
