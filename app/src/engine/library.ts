// The built-in libraries of ready-made enemies (data/bestiary.json) and NPCs (data/npc-library.json),
// with search. Adding one to an adventure copies it, so the author can then edit their copy.
import bestiary from '../../../data/bestiary.json'
import npcLibrary from '../../../data/npc-library.json'
import type { Enemy, Npc } from '../api/types.ts'

export interface LibraryEnemy extends Enemy { levelMin: number; levelMax: number; tags: string[] }
export interface LibraryNpc extends Npc { tags: string[] }

export const BESTIARY = bestiary.enemies as LibraryEnemy[]
export const NPC_LIBRARY = npcLibrary.npcs as LibraryNpc[]

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)
const matches = (haystack: string, q: string) => words(q).every(w => haystack.includes(w))

export interface EnemyQuery { text: string; tier: string; level: number | null }

/** Library enemies matching every search word in the name, tier, tags and abilities, then the tier and level filters. */
export function searchEnemies(q: EnemyQuery, all: LibraryEnemy[] = BESTIARY): LibraryEnemy[] {
  return all.filter(e =>
    (!q.tier || e.tier === q.tier) &&
    (q.level === null || (e.levelMin <= q.level && q.level <= e.levelMax)) &&
    matches([e.name, e.tier, ...e.tags, ...e.traits, ...e.dread].join(' ').toLowerCase(), q.text))
}

export interface NpcQuery { text: string; attitude: string }

export function searchNpcs(q: NpcQuery, all: LibraryNpc[] = NPC_LIBRARY): LibraryNpc[] {
  return all.filter(n =>
    (!q.attitude || n.attitude === q.attitude) &&
    matches([n.name, n.role, n.attitude, ...n.tags, n.description].join(' ').toLowerCase(), q.text))
}

/** The copy that goes into an adventure: the library's search fields dropped. */
export function enemyFromLibrary(e: LibraryEnemy): Enemy {
  const { levelMin: _a, levelMax: _b, tags: _c, ...enemy } = e
  return { ...enemy, traits: [...e.traits], dread: [...e.dread] }
}

export function npcFromLibrary(n: LibraryNpc): Npc {
  const { tags: _t, ...npc } = n
  return npc
}
