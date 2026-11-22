// A user-written adventure (data/adventure.json) and its validation. Adventures are private to their
// owner for now: only visibilities listed in `liveVisibilities` are accepted (sharing comes with VTTER-72/73).
import adventureData from '../../data/adventure.json'
import character from '../../data/character.json'
import { fail, int, list, obj, oneOf, text } from './sheet.ts'

const { limits } = adventureData

export interface Scene {
  /** Stable id chosen by the client, unique within the adventure. */
  id: string
  title: string
  type: string
  text: string
  foes: string[]
}

export interface AdventureDraft {
  title: string
  summary: string
  levelMin: number
  levelMax: number
  visibility: string
  scenes: Scene[]
  hooks: string[]
}

export interface AdventureRecord extends AdventureDraft {
  id: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type AdventureSummary = Pick<AdventureRecord, 'id' | 'title' | 'summary' | 'levelMin' | 'levelMax' | 'visibility' | 'updatedAt'>

const SCENE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export function parseAdventure(body: unknown): AdventureDraft {
  const b = obj(body, 'body')
  const { min, max } = character.levels
  const levelMin = int(b.levelMin, 'levelMin', min, max, min)
  const levelMax = int(b.levelMax, 'levelMax', min, max, max)
  if (levelMin > levelMax) fail('levelMin cannot be higher than levelMax')

  const visibility = oneOf(b.visibility, 'visibility', adventureData.visibilities, 'private')
  if (!adventureData.liveVisibilities.includes(visibility)) fail(`visibility "${visibility}" is not available yet`)

  const seen = new Set<string>()
  const scenes = list(b.scenes, 'scenes', limits.maxScenes).map((s, i) => {
    const o = obj(s, `scenes[${i}]`)
    const id = text(o.id, `scenes[${i}].id`, { min: 1, max: 40 })
    if (!SCENE_ID.test(id)) fail(`scenes[${i}].id must be lowercase letters, digits and dashes`)
    if (seen.has(id)) fail(`scenes[${i}].id "${id}" is used twice`)
    seen.add(id)
    return {
      id,
      title: text(o.title, `scenes[${i}].title`, { min: 1, max: limits.titleMax }),
      type: oneOf(o.type, `scenes[${i}].type`, adventureData.sceneTypes, adventureData.sceneTypes[0]),
      text: text(o.text, `scenes[${i}].text`, { max: limits.textMax }),
      foes: list(o.foes, `scenes[${i}].foes`, limits.maxFoes).map((f, j) => text(f, `scenes[${i}].foes[${j}]`, { min: 1, max: 80 })),
    }
  })

  return {
    title: text(b.title, 'title', { min: 1, max: limits.titleMax }),
    summary: text(b.summary, 'summary', { max: limits.summaryMax }),
    levelMin,
    levelMax,
    visibility,
    scenes,
    hooks: list(b.hooks, 'hooks', limits.maxHooks).map((h, i) => text(h, `hooks[${i}]`, { min: 1, max: limits.textMax })),
  }
}
