// Turn the text of an adventure .json file into a draft for the editor. Pure: no DOM, no network.
// Limits come from /data through problems() in adventure.ts.
import type { AdventureDraft, Enemy, Npc, Scene, SceneEnemy } from '../api/types.ts'
import { emptyAdventure, emptyEnemy, emptyNpc, ENEMY_TIERS, LEVELS, newEntryId, newSceneId, NPC_ATTITUDES, problems, SCENE_TYPES } from './adventure.ts'

export type ImportResult = { ok: true; draft: AdventureDraft } | { ok: false; errors: string[] }

/** Pull the JSON out of a reply: drops a code fence, and any chatter before the first { and after the last }. */
function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const level = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) ? Math.min(LEVELS.max, Math.max(LEVELS.min, v)) : fallback

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) ? v : fallback)
const optNum = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const cleanId = (v: unknown, prefix: string, ids: string[], rand?: () => number): string => {
  let id = str(v).trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || ids.includes(id)) id = newEntryId(prefix, ids, rand)
  ids.push(id)
  return id
}

function readSceneEnemies(v: unknown): SceneEnemy[] {
  return (Array.isArray(v) ? v : []).map(raw => {
    const o = rec(raw)
    return { id: str(o.id).trim(), count: num(o.count, 1) }
  }).filter(x => x.id)
}

function readEnemies(v: unknown, rand?: () => number): Enemy[] {
  const ids: string[] = []
  return (Array.isArray(v) ? v : []).map(raw => {
    const o = rec(raw)
    const blank = emptyEnemy(ids, rand)
    const tier = str(o.tier).toLowerCase()
    return {
      id: cleanId(o.id, 'enemy', ids, rand),
      name: str(o.name).trim(),
      tier: ENEMY_TIERS.includes(tier) ? tier : blank.tier,
      defense: num(o.defense, blank.defense),
      grit: num(o.grit, blank.grit),
      attackDc: num(o.attackDc, blank.attackDc),
      damage: str(o.damage).trim() || (typeof o.damage === 'number' ? String(o.damage) : ''),
      willDc: optNum(o.willDc),
      resolve: optNum(o.resolve),
      moves: str(o.moves).trim() || (typeof o.moves === 'number' ? String(o.moves) : ''),
      traits: strings(o.traits).map(t => t.trim()).filter(Boolean),
      dread: strings(o.dread).map(t => t.trim()).filter(Boolean),
    }
  })
}

function readNpcs(v: unknown, rand?: () => number): Npc[] {
  const ids: string[] = []
  return (Array.isArray(v) ? v : []).map(raw => {
    const o = rec(raw)
    const attitude = str(o.attitude).toLowerCase()
    return {
      id: cleanId(o.id, 'npc', ids, rand),
      name: str(o.name).trim(),
      role: str(o.role).trim(),
      attitude: NPC_ATTITUDES.includes(attitude) ? attitude : emptyNpc([], rand).attitude,
      description: str(o.description).trim(),
      secret: str(o.secret).trim(),
    }
  })
}

/** Turn pasted text into a draft the editor can load, or list what is wrong. Never saves anything. */
export function parseImport(raw: string, rand?: () => number): ImportResult {
  if (!raw.trim()) return { ok: false, errors: ['Paste the adventure JSON first.'] }
  let data: unknown
  try {
    data = JSON.parse(extractJson(raw))
  } catch {
    return { ok: false, errors: ["That isn't valid JSON. Ask the AI to reply with the JSON only."] }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Expected one JSON object.'] }
  const o = data as Record<string, unknown>
  for (const key of ['scenes', 'enemies', 'npcs']) {
    if (o[key] !== undefined && !Array.isArray(o[key])) return { ok: false, errors: [`"${key}" must be a list.`] }
  }

  const errors: string[] = []
  const base = emptyAdventure()
  const ids: string[] = []
  const scenes: Scene[] = (Array.isArray(o.scenes) ? o.scenes : []).map((raw, i) => {
    const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    if (!raw || typeof raw !== 'object') errors.push(`Scene ${i + 1} must be an object.`)
    const type = str(s.type)
    if (!SCENE_TYPES.includes(type)) errors.push(`Scene ${i + 1}: "type" must be one of ${SCENE_TYPES.join(', ')}.`)
    let id = str(s.id).trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || ids.includes(id)) id = newSceneId(ids, rand)
    ids.push(id)
    return { id, title: str(s.title).trim(), type: SCENE_TYPES.includes(type) ? type : SCENE_TYPES[0], text: str(s.text).trim(), enemies: readSceneEnemies(s.enemies), npcs: strings(s.npcs).map(n => n.trim()).filter(Boolean) }
  })

  const draft: AdventureDraft = {
    ...base,
    title: str(o.title).trim(),
    summary: str(o.summary).trim(),
    levelMin: level(o.levelMin, LEVELS.min),
    levelMax: level(o.levelMax, LEVELS.max),
    scenes,
    enemies: readEnemies(o.enemies, rand),
    npcs: readNpcs(o.npcs, rand),
    hooks: strings(o.hooks).map(h => h.trim()).filter(Boolean),
  }
  errors.push(...problems(draft))
  return errors.length ? { ok: false, errors } : { ok: true, draft }
}
