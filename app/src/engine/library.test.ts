import { describe, expect, it } from 'vitest'
import adventureData from '../../../data/adventure.json'
import { addScene, emptyAdventure, problems, removeEnemy, removeNpc, setSceneEnemyCount, toggleSceneEnemy, toggleSceneNpc, updateScene } from './adventure.ts'
import { BESTIARY, enemyFromLibrary, NPC_LIBRARY, npcFromLibrary, searchEnemies, searchNpcs } from './library.ts'

const any = { text: '', tier: '', level: null }

describe('the libraries', () => {
  it('have unique ids and original content', () => {
    expect(new Set(BESTIARY.map(e => e.id)).size).toBe(BESTIARY.length)
    expect(new Set(NPC_LIBRARY.map(n => n.id)).size).toBe(NPC_LIBRARY.length)
    const text = JSON.stringify([BESTIARY, NPC_LIBRARY]).toLowerCase()
    for (const banned of ['beholder', 'dungeons', 'd&d', 'mind flayer', 'owlbear', 'goblin king']) expect(text).not.toContain(banned)
  })
  it('fit the adventure limits and tiers', () => {
    expect(BESTIARY.length).toBeLessThanOrEqual(80)
    for (const e of BESTIARY) {
      expect(adventureData.enemyTiers).toContain(e.tier)
      expect(e.levelMin).toBeLessThanOrEqual(e.levelMax)
      expect(e.traits.length).toBeLessThanOrEqual(adventureData.limits.maxTraits)
      expect(e.name.length).toBeLessThanOrEqual(adventureData.limits.nameMax)
    }
    for (const n of NPC_LIBRARY) expect(adventureData.npcAttitudes).toContain(n.attitude)
  })
  it('give a minion 1 Grit and a boss 60 or more', () => {
    for (const e of BESTIARY.filter(x => x.tier === 'minion')) expect(e.grit).toBe(1)
    for (const e of BESTIARY.filter(x => x.tier === 'boss')) expect(e.grit).toBeGreaterThanOrEqual(60)
  })
  it('cover every level band and tier', () => {
    for (let l = 1; l <= 10; l++) expect(searchEnemies({ ...any, level: l }).length).toBeGreaterThan(0)
    for (const t of adventureData.enemyTiers) expect(searchEnemies({ ...any, tier: t }).length).toBeGreaterThan(0)
  })
})

describe('search', () => {
  it('finds by name, tag and ability, ignoring case, needing every word', () => {
    expect(searchEnemies({ ...any, text: 'WOLF' }).map(e => e.id)).toContain('reach-wolf')
    expect(searchEnemies({ ...any, text: 'undead fear' }).length).toBeGreaterThan(0)
    expect(searchEnemies({ ...any, text: 'wolf zzzz' })).toEqual([])
  })
  it('filters by tier and by level', () => {
    expect(searchEnemies({ ...any, tier: 'boss' }).every(e => e.tier === 'boss')).toBe(true)
    expect(searchEnemies({ ...any, level: 10 }).every(e => e.levelMin <= 10 && e.levelMax >= 10)).toBe(true)
  })
  it('finds NPCs by role and attitude', () => {
    expect(searchNpcs({ text: 'innkeeper', attitude: '' }).length).toBe(1)
    expect(searchNpcs({ text: '', attitude: 'hostile' }).every(n => n.attitude === 'hostile')).toBe(true)
  })
})

describe('adding to an adventure', () => {
  it('copies an enemy without the search fields', () => {
    const copy = enemyFromLibrary(BESTIARY[0])
    expect(copy).not.toHaveProperty('tags')
    expect(copy).not.toHaveProperty('levelMin')
    copy.traits.push('edited')
    expect(BESTIARY[0].traits).not.toContain('edited')
    expect(npcFromLibrary(NPC_LIBRARY[0])).not.toHaveProperty('tags')
  })
  it('puts enemies and NPCs in a scene, with a count between 1 and the limit', () => {
    let d = addScene({ ...emptyAdventure(), title: 'T', enemies: [enemyFromLibrary(BESTIARY[0])], npcs: [npcFromLibrary(NPC_LIBRARY[0])] })
    const [scene] = d.scenes
    d = toggleSceneEnemy(d, scene.id, BESTIARY[0].id)
    d = toggleSceneNpc(d, scene.id, NPC_LIBRARY[0].id)
    expect(d.scenes[0].enemies).toEqual([{ id: BESTIARY[0].id, count: 1 }])
    d = setSceneEnemyCount(d, scene.id, BESTIARY[0].id, 999)
    expect(d.scenes[0].enemies[0].count).toBe(adventureData.limits.maxCount)
    d = setSceneEnemyCount(d, scene.id, BESTIARY[0].id, 0)
    expect(d.scenes[0].enemies[0].count).toBe(1)
    d = toggleSceneEnemy(d, scene.id, BESTIARY[0].id)
    expect(d.scenes[0].enemies).toEqual([])
  })
  it('removing an enemy or NPC removes it from every scene', () => {
    let d = addScene({ ...emptyAdventure(), title: 'T', enemies: [enemyFromLibrary(BESTIARY[0])], npcs: [npcFromLibrary(NPC_LIBRARY[0])] })
    d = updateScene(d, d.scenes[0].id, { title: 'S', enemies: [{ id: BESTIARY[0].id, count: 2 }], npcs: [NPC_LIBRARY[0].id] })
    expect(problems(d)).toEqual([])
    d = removeNpc(removeEnemy(d, BESTIARY[0].id), NPC_LIBRARY[0].id)
    expect(d.scenes[0]).toMatchObject({ enemies: [], npcs: [] })
    expect(problems(d)).toEqual([])
  })
  it('flags a scene that points at something missing', () => {
    const d = updateScene(addScene({ ...emptyAdventure(), title: 'T' }), 'x', {})
    const bad = { ...d, scenes: [{ ...d.scenes[0], title: 'S', enemies: [{ id: 'ghost', count: 1 }] }] }
    expect(problems(bad).join(' ')).toMatch(/not in the adventure/)
  })
})
