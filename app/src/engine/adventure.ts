// Pure helpers for writing an adventure: the empty draft, editing the scene list, and the checks the form
// shows before saving. The API repeats every check (api/src/adventure.ts). Numbers come from /data.
import adventureData from '../../../data/adventure.json'
import character from '../../../data/character.json'
import type { Adventure, AdventureDraft, Scene, Visibility } from '../api/types.ts'

export const SCENE_TYPES: string[] = adventureData.sceneTypes
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
  return { title: '', summary: '', levelMin: LEVELS.min, levelMax: LEVELS.max, visibility: 'private', scenes: [], hooks: [] }
}

/** The editable part of a saved adventure, without the server's own fields. */
export function draftOf(a: Adventure): AdventureDraft {
  const { title, summary, levelMin, levelMax, visibility, scenes, hooks } = a
  return { title, summary, levelMin, levelMax, visibility, scenes, hooks }
}

/** A scene id that isn't in `existing`. Ids are lowercase letters, digits and dashes (the API checks). */
export function newSceneId(existing: string[], rand: () => number = Math.random): string {
  for (;;) {
    const id = `scene-${Math.floor(rand() * 36 ** 5).toString(36).padStart(5, '0')}`
    if (!existing.includes(id)) return id
  }
}

export function addScene(d: AdventureDraft, rand?: () => number): AdventureDraft {
  const scene: Scene = { id: newSceneId(d.scenes.map(s => s.id), rand), title: '', type: SCENE_TYPES[0], text: '', foes: [] }
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
    if (s.foes.length > LIMITS.maxFoes) out.push(`Scene ${i + 1} can have at most ${LIMITS.maxFoes} foes.`)
  })
  if (d.hooks.length > LIMITS.maxHooks) out.push(`An adventure can have at most ${LIMITS.maxHooks} hooks.`)
  if (d.hooks.some(h => !h.trim())) out.push('Remove the empty hook.')
  return out
}

export function levelRange(a: { levelMin: number; levelMax: number }): string {
  return a.levelMin === a.levelMax ? `Level ${a.levelMin}` : `Levels ${a.levelMin}–${a.levelMax}`
}

export function sceneLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}
