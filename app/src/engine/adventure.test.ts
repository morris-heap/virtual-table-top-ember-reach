import { describe, expect, it } from 'vitest'
import { BUILT_IN, findBuiltIn } from '../adventures/builtIn.ts'
import {
  addScene, draftOf, emptyAdventure, LIMITS, levelRange, moveScene, newSceneId, problems, removeScene, SCENE_TYPES, updateScene,
} from './adventure.ts'

const titled = () => ({ ...emptyAdventure(), title: 'The Cold Hearth' })

describe('editing the scene list', () => {
  it('adds scenes at the end with unique ids and the first scene type', () => {
    let d = titled()
    d = addScene(d)
    d = addScene(d)
    expect(d.scenes).toHaveLength(2)
    expect(d.scenes[0].id).not.toBe(d.scenes[1].id)
    expect(d.scenes[0]).toMatchObject({ title: '', type: SCENE_TYPES[0], text: '', enemies: [], npcs: [] })
  })

  it('generates ids the API accepts, and never reuses one', () => {
    expect(newSceneId([], () => 0)).toBe('scene-00000')
    expect(newSceneId(['scene-00000'], (() => { const r = [0, 0.5]; return () => r.shift() ?? 0.9 })())).toMatch(/^scene-[a-z0-9]{5}$/)
    expect(newSceneId([], () => 0.999999)).toMatch(/^scene-[a-z0-9]{5}$/)
  })

  it('updates only the scene asked for, without changing the original', () => {
    const d = addScene(addScene(titled()))
    const [a, b] = d.scenes
    const next = updateScene(d, b.id, { title: 'The vent', type: 'exploration' })
    expect(next.scenes[0]).toEqual(a)
    expect(next.scenes[1]).toMatchObject({ id: b.id, title: 'The vent', type: 'exploration' })
    expect(d.scenes[1].title).toBe('')
  })

  it('removes a scene', () => {
    const d = addScene(addScene(titled()))
    expect(removeScene(d, d.scenes[0].id).scenes.map(s => s.id)).toEqual([d.scenes[1].id])
  })

  it('moves a scene up or down, and stops at either end', () => {
    const d = addScene(addScene(addScene(titled())))
    const [a, b, c] = d.scenes.map(s => s.id)
    expect(moveScene(d, c, -1).scenes.map(s => s.id)).toEqual([a, c, b])
    expect(moveScene(d, a, 1).scenes.map(s => s.id)).toEqual([b, a, c])
    expect(moveScene(d, a, -1)).toBe(d)
    expect(moveScene(d, c, 1)).toBe(d)
    expect(moveScene(d, 'missing', 1)).toBe(d)
  })
})

describe('problems', () => {
  const withScene = () => updateScene(addScene(titled()), 'x', {})

  it('accepts a titled adventure with no scenes yet', () => {
    expect(problems(titled())).toEqual([])
  })

  it('asks for a title', () => {
    expect(problems(emptyAdventure())).toEqual(['Give the adventure a title.'])
    expect(problems({ ...emptyAdventure(), title: '   ' })).toHaveLength(1)
  })

  it('checks the level range', () => {
    expect(problems({ ...titled(), levelMin: 5, levelMax: 2 })).toEqual(['The lowest level cannot be higher than the highest level.'])
  })

  it('names the scene that is missing a title', () => {
    const d = addScene(addScene(titled()))
    const fixed = updateScene(d, d.scenes[0].id, { title: 'The village' })
    expect(problems(fixed)).toEqual(['Scene 2 needs a title.'])
    expect(problems(withScene())).toHaveLength(1)
  })

  it('enforces the limits from /data', () => {
    expect(problems({ ...titled(), title: 'x'.repeat(LIMITS.titleMax + 1) })).toHaveLength(1)
    expect(problems({ ...titled(), hooks: Array.from({ length: LIMITS.maxHooks + 1 }, () => 'x') })).toHaveLength(1)
    expect(problems({ ...titled(), hooks: ['a', ' '] })).toEqual(['Remove the empty hook.'])
    let many = titled()
    for (let i = 0; i <= LIMITS.maxScenes; i++) many = addScene(many)
    expect(problems({ ...many, scenes: many.scenes.map(s => ({ ...s, title: 't' })) })).toEqual([
      `An adventure can have at most ${LIMITS.maxScenes} scenes.`,
    ])
  })
})

describe('helpers', () => {
  it('draftOf keeps only the editable fields', () => {
    const saved = { ...titled(), id: 'abc', updatedAt: '2026-11-22T00:00:00Z' }
    expect(draftOf(saved)).toEqual(titled())
  })
  it('levelRange', () => {
    expect(levelRange({ levelMin: 1, levelMax: 1 })).toBe('Level 1')
    expect(levelRange({ levelMin: 1, levelMax: 3 })).toBe('Levels 1–3')
  })
})

describe('built-in adventures (data/adventures)', () => {
  it('has The Soot King\'s Hearth, playable solo', () => {
    const a = findBuiltIn('soot-kings-hearth')
    expect(a).toMatchObject({ title: "The Soot King's Hearth", soloPlayable: true, levelMin: 1, levelMax: 1 })
    expect(a?.scenes.map(s => s.type)).toEqual(['social', 'exploration', 'puzzle', 'choice', 'boss'])
  })

  it.each(BUILT_IN.map(a => [a.id, a] as const))('%s passes the same checks as an adventure a user writes', (_id, a) => {
    expect(problems({ ...a, visibility: 'private' })).toEqual([])
    expect(new Set(a.scenes.map(s => s.id)).size).toBe(a.scenes.length)
    for (const s of a.scenes) {
      expect(SCENE_TYPES).toContain(s.type)
      expect(s.id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/)
    }
    expect(a.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })
})
