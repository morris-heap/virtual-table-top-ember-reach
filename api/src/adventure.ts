// A user-written adventure (data/adventure.json) and its validation. Adventures are private to their
// owner for now: only visibilities listed in `liveVisibilities` are accepted (sharing comes with VTTER-72/73).
import adventureData from '../../data/adventure.json'
import character from '../../data/character.json'
import { fail, int, list, obj, oneOf, text } from './sheet.ts'

const { statMax, lineMax, nameMax, maxTraits } = adventureData.limits

const { limits } = adventureData

export interface Scene {
  /** Stable id chosen by the client, unique within the adventure. */
  id: string
  title: string
  type: string
  text: string
  /** Enemies in this scene: an id from the adventure's `enemies`, and how many. */
  enemies: SceneEnemy[]
  /** Ids from the adventure's `npcs`. */
  npcs: string[]
}

export interface SceneEnemy { id: string; count: number }

/** A foe stat block (rules/gm-guide.md §2). Numbers are DCs the heroes roll against: foes have no dice. */
export interface Enemy {
  id: string
  name: string
  tier: string
  defense: number
  grit: number
  attackDc: number
  /** Free text, like "5" or "7 x2" or "8 bite + 4 burning". */
  damage: string
  /** Only for foes with mental attacks. */
  willDc: number | null
  /** Only when it differs from Defense. */
  resolve: number | null
  moves: string
  traits: string[]
  dread: string[]
}

export interface Npc {
  id: string
  name: string
  role: string
  attitude: string
  description: string
  /** What only the GM knows. */
  secret: string
}

export interface AdventureDraft {
  title: string
  summary: string
  levelMin: number
  levelMax: number
  visibility: string
  scenes: Scene[]
  hooks: string[]
  enemies: Enemy[]
  npcs: Npc[]
}

export interface AdventureRecord extends AdventureDraft {
  id: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type AdventureSummary = Pick<AdventureRecord, 'id' | 'title' | 'summary' | 'levelMin' | 'levelMax' | 'visibility' | 'updatedAt'>

const SCENE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

function ids(prefix: string, items: { id: string }[]) {
  const seen = new Set<string>()
  items.forEach((x, i) => {
    if (seen.has(x.id)) fail(`${prefix}[${i}].id "${x.id}" is used twice`)
    seen.add(x.id)
  })
}
function parseId(v: unknown, field: string): string {
  const id = text(v, field, { min: 1, max: 40 })
  if (!SCENE_ID.test(id)) fail(`${field} must be lowercase letters, digits and dashes`)
  return id
}
function optInt(v: unknown, field: string): number | null {
  return v === undefined || v === null ? null : int(v, field, 1, statMax)
}
const lines = (v: unknown, field: string) => list(v, field, maxTraits).map((t, i) => text(t, `${field}[${i}]`, { min: 1, max: lineMax }))

function parseEnemies(v: unknown): Enemy[] {
  const out = list(v, 'enemies', limits.maxEnemies).map((e, i): Enemy => {
    const f = `enemies[${i}]`
    const o = obj(e, f)
    return {
      id: parseId(o.id, `${f}.id`),
      name: text(o.name, `${f}.name`, { min: 1, max: nameMax }),
      tier: oneOf(o.tier, `${f}.tier`, adventureData.enemyTiers, 'standard'),
      defense: int(o.defense, `${f}.defense`, 1, statMax),
      grit: int(o.grit, `${f}.grit`, 1, statMax * 5),
      attackDc: int(o.attackDc, `${f}.attackDc`, 1, statMax),
      damage: text(o.damage, `${f}.damage`, { max: lineMax }),
      willDc: optInt(o.willDc, `${f}.willDc`),
      resolve: optInt(o.resolve, `${f}.resolve`),
      moves: text(o.moves, `${f}.moves`, { max: lineMax }),
      traits: lines(o.traits, `${f}.traits`),
      dread: lines(o.dread, `${f}.dread`),
    }
  })
  ids('enemies', out)
  return out
}

function parseNpcs(v: unknown): Npc[] {
  const out = list(v, 'npcs', limits.maxNpcs).map((n, i): Npc => {
    const f = `npcs[${i}]`
    const o = obj(n, f)
    return {
      id: parseId(o.id, `${f}.id`),
      name: text(o.name, `${f}.name`, { min: 1, max: nameMax }),
      role: text(o.role, `${f}.role`, { max: lineMax }),
      attitude: oneOf(o.attitude, `${f}.attitude`, adventureData.npcAttitudes, 'neutral'),
      description: text(o.description, `${f}.description`, { max: limits.textMax }),
      secret: text(o.secret, `${f}.secret`, { max: limits.textMax }),
    }
  })
  ids('npcs', out)
  return out
}

function sceneEnemies(v: unknown, field: string, known: Set<string>): SceneEnemy[] {
  const seen = new Set<string>()
  return list(v, field, limits.maxSceneEnemies).map((x, i) => {
    const o = obj(x, `${field}[${i}]`)
    const id = text(o.id, `${field}[${i}].id`, { min: 1, max: 40 })
    if (!known.has(id)) fail(`${field}[${i}].id "${id}" is not one of the adventure's enemies`)
    if (seen.has(id)) fail(`${field}[${i}].id "${id}" is listed twice in one scene`)
    seen.add(id)
    return { id, count: int(o.count, `${field}[${i}].count`, 1, limits.maxCount, 1) }
  })
}

function sceneNpcs(v: unknown, field: string, known: Set<string>): string[] {
  const out = list(v, field, limits.maxSceneNpcs).map((x, i) => {
    const id = text(x, `${field}[${i}]`, { min: 1, max: 40 })
    if (!known.has(id)) fail(`${field}[${i}] "${id}" is not one of the adventure's NPCs`)
    return id
  })
  if (new Set(out).size !== out.length) fail(`${field} lists an NPC twice`)
  return out
}

export function parseAdventure(body: unknown): AdventureDraft {
  const b = obj(body, 'body')
  const { min, max } = character.levels
  const levelMin = int(b.levelMin, 'levelMin', min, max, min)
  const levelMax = int(b.levelMax, 'levelMax', min, max, max)
  if (levelMin > levelMax) fail('levelMin cannot be higher than levelMax')

  const visibility = oneOf(b.visibility, 'visibility', adventureData.visibilities, 'private')
  if (!adventureData.liveVisibilities.includes(visibility)) fail(`visibility "${visibility}" is not available yet`)

  const enemies = parseEnemies(b.enemies)
  const npcs = parseNpcs(b.npcs)
  const enemyIds = new Set(enemies.map(e => e.id))
  const npcIds = new Set(npcs.map(n => n.id))

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
      enemies: sceneEnemies(o.enemies, `scenes[${i}].enemies`, enemyIds),
      npcs: sceneNpcs(o.npcs, `scenes[${i}].npcs`, npcIds),
    }
  })

  return {
    title: text(b.title, 'title', { min: 1, max: limits.titleMax }),
    summary: text(b.summary, 'summary', { max: limits.summaryMax }),
    levelMin,
    levelMax,
    visibility,
    scenes,
    enemies,
    npcs,
    hooks: list(b.hooks, 'hooks', limits.maxHooks).map((h, i) => text(h, `hooks[${i}]`, { min: 1, max: limits.textMax })),
  }
}
