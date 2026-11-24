// Starting a new hero from Home: a name, an Ancestry and a Calling (rules/core-rules.md §3.2, §4).
// The rest of creation (attributes, skills, gear) is the guided sheet editor, VTTER-47. Names come from /data/character.json.
import character from '../../../data/character.json'
import core from '../../../data/core.json'

export const ANCESTRIES: readonly string[] = character.ancestries
export const CALLINGS: readonly string[] = character.callings
export const NAME_MAX = 80

export interface NewHero {
  name: string
  ancestry: string
  calling: string
}

export const emptyHero = (): NewHero => ({ name: '', ancestry: '', calling: '' })

/** What's missing or wrong, as messages for the player. Empty means it can be saved. */
export function heroProblems(h: NewHero): string[] {
  const out: string[] = []
  const name = h.name.trim()
  if (!name) out.push('Give your hero a name.')
  else if (name.length > NAME_MAX) out.push(`Keep the name to ${NAME_MAX} characters.`)
  if (!ANCESTRIES.includes(h.ancestry)) out.push('Pick an Ancestry.')
  if (!CALLINGS.includes(h.calling)) out.push('Pick a Calling.')
  return out
}

/** The sheet the API saves for a new hero: level 1, everything else at its default. */
export function newHeroSheet(h: NewHero) {
  return {
    rulesVersion: core.version,
    name: h.name.trim(),
    level: character.levels.min,
    ancestry: h.ancestry,
    calling: h.calling,
  }
}
