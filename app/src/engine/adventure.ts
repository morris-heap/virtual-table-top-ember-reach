// Pure helpers for writing an adventure: the empty draft, editing the scene list, and the checks the form
// shows before saving. The API repeats every check (api/src/adventure.ts). Numbers come from /data.
import adventureData from '../../../data/adventure.json'
import character from '../../../data/character.json'
import type { Adventure, AdventureDraft, Enemy, Npc, Scene, Visibility } from '../api/types.ts'

export const SCENE_TYPES: string[] = adventureData.sceneTypes
export const ENEMY_TIERS: string[] = adventureData.enemyTiers
export const NPC_ATTITUDES: string[] = adventureData.npcAttitudes
export const LIMITS = adventureData.limits
export const LEVELS = character.levels
/** The visibilities the API accepts right now (data/adventure.json `liveVisibilities`): private and friends. */
export const LIVE_VISIBILITIES = adventureData.liveVisibilities as Visibility[]

export function visibilityLabel(v: Visibility): string {
  return v === 'friends' ? 'Friends' : v === 'public' ? 'Public' : 'Private'
}

/** One line under the picker saying who can read the adventure. */
export function visibilityHelp(v: Visibility): string {
  return v === 'friends' ? 'You and your friends can read this adventure. Friends see it read-only.' : 'Only you can see this adventure.'
}

export function emptyAdventure(): AdventureDraft {
  return { title: '', summary: '', levelMin: LEVELS.min, levelMax: LEVELS.max, visibility: 'private', scenes: [], hooks: [], enemies: [], npcs: [] }
}

/** The editable part of a saved adventure, without the server's own fields. */
export function draftOf(a: Adventure): AdventureDraft {
  const { title, summary, levelMin, levelMax, visibility, scenes, hooks } = a
  return { title, summary, levelMin, levelMax, visibility, scenes, hooks, enemies: a.enemies, npcs: a.npcs }
}

/** A scene id that isn't in `existing`. Ids are lowercase letters, digits and dashes (the API checks). */
export function newSceneId(existing: string[], rand: () => number = Math.random): string {
  for (;;) {
    const id = `scene-${Math.floor(rand() * 36 ** 5).toString(36).padStart(5, '0')}`
    if (!existing.includes(id)) return id
  }
}

export function addScene(d: AdventureDraft, rand?: () => number): AdventureDraft {
  const scene: Scene = { id: newSceneId(d.scenes.map(s => s.id), rand), title: '', type: SCENE_TYPES[0], text: '', enemies: [], npcs: [] }
  return { ...d, scenes: [...d.scenes, scene] }
}

export function updateScene(d: AdventureDraft, id: string, patch: Partial<Omit<Scene, 'id'>>): AdventureDraft {
  return { ...d, scenes: d.scenes.map(s => (s.id === id ? { ...s, ...patch } : s)) }
}

export function removeScene(d: AdventureDraft, id: string): AdventureDraft {
  return { ...d, scenes: d.scenes.filter(s => s.id !== id) }
}

/** Move a scene one place earlier (-1) or later (+1). Does nothing at either end. */
export function moveScene(d: AdventureDraft, id: string, delta: -1 | 1): AdventureDraft {
  const from = d.scenes.findIndex(s => s.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= d.scenes.length) return d
  const scenes = [...d.scenes]
  ;[scenes[from], scenes[to]] = [scenes[to], scenes[from]]
  return { ...d, scenes }
}

/** An id for an enemy or NPC that isn't in `existing`. */
export function newEntryId(prefix: string, existing: string[], rand: () => number = Math.random): string {
  for (;;) {
    const id = `${prefix}-${Math.floor(rand() * 36 ** 5).toString(36).padStart(5, '0')}`
    if (!existing.includes(id)) return id
  }
}

/** A new enemy with level-1 numbers from gm-guide §2.2 as a starting point. */
export function emptyEnemy(existing: string[], rand?: () => number): Enemy {
  return { id: newEntryId('enemy', existing, rand), name: '', tier: 'standard', defense: 12, grit: 9, attackDc: 12, damage: '5', willDc: null, resolve: null, moves: '2', traits: [], dread: [] }
}

export function emptyNpc(existing: string[], rand?: () => number): Npc {
  return { id: newEntryId('npc', existing, rand), name: '', role: '', attitude: 'neutral', description: '', secret: '' }
}

export function updateEnemy(d: AdventureDraft, id: string, patch: Partial<Omit<Enemy, 'id'>>): AdventureDraft {
  return { ...d, enemies: d.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }
}

export function updateNpc(d: AdventureDraft, id: string, patch: Partial<Omit<Npc, 'id'>>): AdventureDraft {
  return { ...d, npcs: d.npcs.map(n => (n.id === id ? { ...n, ...patch } : n)) }
}

/** Remove an enemy and every scene's mention of it. */
export function removeEnemy(d: AdventureDraft, id: string): AdventureDraft {
  return { ...d, enemies: d.enemies.filter(e => e.id !== id), scenes: d.scenes.map(s => ({ ...s, enemies: s.enemies.filter(x => x.id !== id) })) }
}

/** Remove an NPC and every scene's mention of them. */
export function removeNpc(d: AdventureDraft, id: string): AdventureDraft {
  return { ...d, npcs: d.npcs.filter(n => n.id !== id), scenes: d.scenes.map(s => ({ ...s, npcs: s.npcs.filter(x => x !== id) })) }
}

/** Put an enemy or NPC in a scene, or take it out. Adding twice does nothing; an enemy starts at one. */
export function toggleSceneEnemy(d: AdventureDraft, sceneId: string, enemyId: string): AdventureDraft {
  const cur = d.scenes.find(s => s.id === sceneId)?.enemies ?? []
  return updateScene(d, sceneId, { enemies: cur.some(x => x.id === enemyId) ? cur.filter(x => x.id !== enemyId) : [...cur, { id: enemyId, count: 1 }] })
}

export function setSceneEnemyCount(d: AdventureDraft, sceneId: string, enemyId: string, count: number): AdventureDraft {
  const n = Math.min(LIMITS.maxCount, Math.max(1, Math.round(count) || 1))
  return updateScene(d, sceneId, {
    enemies: (d.scenes.find(s => s.id === sceneId)?.enemies ?? []).map(x => (x.id === enemyId ? { ...x, count: n } : x)),
  })
}

export function toggleSceneNpc(d: AdventureDraft, sceneId: string, npcId: string): AdventureDraft {
  const cur = d.scenes.find(s => s.id === sceneId)?.npcs ?? []
  return updateScene(d, sceneId, { npcs: cur.includes(npcId) ? cur.filter(x => x !== npcId) : [...cur, npcId] })
}

/** What stops this draft from saving, in plain words. Empty means it can be saved. */
export function problems(d: AdventureDraft): string[] {
  const out: string[] = []
  if (!d.title.trim()) out.push('Give the adventure a title.')
  if (d.title.trim().length > LIMITS.titleMax) out.push(`The title can be at most ${LIMITS.titleMax} characters.`)
  if (d.summary.length > LIMITS.summaryMax) out.push(`The summary can be at most ${LIMITS.summaryMax} characters.`)
  if (d.levelMin > d.levelMax) out.push('The lowest level cannot be higher than the highest level.')
  if (d.scenes.length > LIMITS.maxScenes) out.push(`An adventure can have at most ${LIMITS.maxScenes} scenes.`)
  d.scenes.forEach((s, i) => {
    if (!s.title.trim()) out.push(`Scene ${i + 1} needs a title.`)
    if (s.text.length > LIMITS.textMax) out.push(`Scene ${i + 1}'s text can be at most ${LIMITS.textMax} characters.`)
    if (s.enemies.length > LIMITS.maxSceneEnemies) out.push(`Scene ${i + 1} can have at most ${LIMITS.maxSceneEnemies} enemies.`)
    if (s.npcs.length > LIMITS.maxSceneNpcs) out.push(`Scene ${i + 1} can have at most ${LIMITS.maxSceneNpcs} NPCs.`)
    if (s.enemies.some(x => !d.enemies.some(e => e.id === x.id))) out.push(`Scene ${i + 1} uses an enemy that is not in the adventure.`)
    if (s.npcs.some(x => !d.npcs.some(n => n.id === x))) out.push(`Scene ${i + 1} uses an NPC that is not in the adventure.`)
  })
  if (d.hooks.length > LIMITS.maxHooks) out.push(`An adventure can have at most ${LIMITS.maxHooks} hooks.`)
  if (d.hooks.some(h => !h.trim())) out.push('Remove the empty hook.')
  if (d.enemies.length > LIMITS.maxEnemies) out.push(`An adventure can have at most ${LIMITS.maxEnemies} enemies.`)
  d.enemies.forEach((e, i) => {
    if (!e.name.trim()) out.push(`Enemy ${i + 1} needs a name.`)
    for (const [label, n] of [['Defense', e.defense], ['Attack DC', e.attackDc], ['Will DC', e.willDc ?? 1], ['Resolve', e.resolve ?? 1]] as const) {
      if (!Number.isInteger(n) || n < 1 || n > LIMITS.statMax) out.push(`Enemy ${i + 1}'s ${label} must be a whole number from 1 to ${LIMITS.statMax}.`)
    }
    if (!Number.isInteger(e.grit) || e.grit < 1 || e.grit > LIMITS.statMax * 5) out.push(`Enemy ${i + 1}'s Grit must be a whole number from 1 to ${LIMITS.statMax * 5}.`)
    if (e.traits.length > LIMITS.maxTraits || e.dread.length > LIMITS.maxTraits) out.push(`Enemy ${i + 1} can have at most ${LIMITS.maxTraits} traits and ${LIMITS.maxTraits} Dread abilities.`)
  })
  if (d.npcs.length > LIMITS.maxNpcs) out.push(`An adventure can have at most ${LIMITS.maxNpcs} NPCs.`)
  d.npcs.forEach((n, i) => { if (!n.name.trim()) out.push(`NPC ${i + 1} needs a name.`) })
  return out
}

export function levelRange(a: { levelMin: number; levelMax: number }): string {
  return a.levelMin === a.levelMax ? `Level ${a.levelMin}` : `Levels ${a.levelMin}–${a.levelMax}`
}

export function sceneLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}
