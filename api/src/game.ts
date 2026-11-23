// A Game: the table people play an adventure from (data/game.json, docs/adr/0006-games.md).
// The GM owns it. Members join by player ID (invite) or, for a public Game, by its link. Every read checks membership.
import gameData from '../../data/game.json'
import sootKingsHearth from '../../data/adventures/soot-kings-hearth.json'
import { fail, obj, oneOf, text } from './sheet.ts'

const { limits } = gameData

/** Ids of the adventures that ship with the app (data/adventures). Add new files here and in app/src/adventures/builtIn.ts. */
export const BUILT_IN_IDS: string[] = [sootKingsHearth.id]

export interface AdventureRef {
  source: 'builtin' | 'own'
  /** A built-in slug, or the UUID of one of the GM's own adventures. */
  id: string
}

export interface GameDraft {
  name: string
  adventure: AdventureRef
  visibility: 'private' | 'public'
  /** One player on a built-in adventure, no GM and no invites. */
  solo: boolean
}

/** What the store keeps. `ownerId` is the GM. `memberIds` are Cognito ids and never leave the API. */
export interface GameRecord extends GameDraft {
  id: string
  ownerId: string
  memberIds: string[]
  createdAt: string
  updatedAt: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseGame(body: unknown): GameDraft {
  const b = obj(body, 'body')
  const a = obj(b.adventure, 'adventure')
  const source = oneOf(a.source, 'adventure.source', gameData.adventureSources, 'builtin') as AdventureRef['source']
  const id = text(a.id, 'adventure.id', { min: 1, max: 60 }).toLowerCase()
  if (source === 'builtin' && !BUILT_IN_IDS.includes(id)) fail(`adventure.id "${id}" is not a built-in adventure`)
  if (source === 'own' && !UUID.test(id)) fail('adventure.id must be a UUID')

  if (b.solo !== undefined && typeof b.solo !== 'boolean') fail('solo must be true or false')
  const solo = b.solo === true
  const visibility = oneOf(b.visibility, 'visibility', gameData.visibilities, 'private') as GameDraft['visibility']
  if (solo && source !== 'builtin') fail('A solo Game needs a built-in adventure')
  if (solo && visibility !== 'private') fail('A solo Game is always private')

  return { name: text(b.name, 'name', { min: 1, max: limits.nameMax }), adventure: { source, id }, visibility, solo }
}
