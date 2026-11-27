// Adventures that ship with the app, from /data/adventures. Anyone can play them, solo or with a GM (VTTER-72).
// Add a file there and list it here.
import sootKingsHearth from '../../../data/adventures/soot-kings-hearth.json'
import type { Enemy, Npc, Scene } from '../api/types.ts'

export interface BuiltInAdventure {
  id: string
  title: string
  summary: string
  levelMin: number
  levelMax: number
  hours: string
  soloPlayable: boolean
  scenes: Scene[]
  hooks: string[]
  enemies: Enemy[]
  npcs: Npc[]
}

export const BUILT_IN: BuiltInAdventure[] = [sootKingsHearth]

export function findBuiltIn(slug: string): BuiltInAdventure | undefined {
  return BUILT_IN.find(a => a.id === slug)
}
