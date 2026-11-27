// The signed-in user's profile: display name, Game Master flag, and a public player ID.
// The player ID is what people share to be found (friends, Games). It is NOT the Cognito `sub`, which stays private.
import { randomInt } from 'node:crypto'
import profileData from '../../data/profile.json'
import { nameKey } from './game.ts'
import { fail, obj, text } from './sheet.ts'

export const { displayNameMax: DISPLAY_NAME_MAX, search: NAME_SEARCH } = profileData

export interface Profile {
  /** Empty until the user sets one; the app falls back to their sign-in name. */
  displayName: string
  gameMaster: boolean
  /**
   * Whether other players can find this one by display name (VTTER-108). Off until they turn it on, so a
   * name is never published without being asked. Missing on an older profile, which reads as off.
   */
  findable?: boolean
  /** Public, shareable, never changes. For example EMBER-7K2Q9F. New IDs are 6 characters; older ones are 5. */
  playerId: string
}

export interface ProfileRecord extends Profile {
  createdAt: string
  updatedAt: string
}

/** What a name search returns: public fields only, never a Cognito id or an index key. */
export interface FoundPlayer {
  playerId: string
  displayName: string
}

export interface ProfilePatch {
  displayName?: string
  gameMaster?: boolean
  findable?: boolean
}

/** `gsi1pk` of a findable player. Namespaced like every other writer of the shared sparse index (ADR 0008). */
export const FIND_PK = `player#${NAME_SEARCH.indexKey}`

/**
 * The `gsi1` sort key that makes a player findable: their folded name, `#`, then their player ID.
 * `%` and `#` are escaped in the name, so the first `#` always ends it and a search for `ash` can never
 * match a player called `ash#smith`.
 */
export function findKey(displayName: string, playerId: string): string {
  return `${foldedName(displayName)}#${playerId}`
}

/** The folded name a search compares with. Case and runs of whitespace fold, punctuation does not (ADR 0008). */
export function foldedName(displayName: string): string {
  return nameKey(displayName).replace(/%/g, '%25').replace(/#/g, '%23')
}

// No 0/O, 1/I/L, so an ID read aloud or typed from a screenshot isn't misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
// New IDs are 6 characters (31^6 = 887 million). The 5-character IDs handed out before stay valid for ever:
// a player ID never changes, so both lengths are accepted.
const ID_LENGTH = 6
const PLAYER_ID = /^EMBER-[A-HJKMNP-Z2-9]{5,6}$/

export function newPlayerId(pick: (max: number) => number = randomInt): string {
  let s = ''
  for (let i = 0; i < ID_LENGTH; i++) s += ALPHABET[pick(ALPHABET.length)]
  return `EMBER-${s}`
}

export function isPlayerId(v: string): boolean {
  return PLAYER_ID.test(v)
}

export function parseProfilePatch(body: unknown): ProfilePatch {
  const b = obj(body, 'body')
  const patch: ProfilePatch = {}
  if (b.displayName !== undefined) patch.displayName = text(b.displayName, 'displayName', { max: DISPLAY_NAME_MAX })
  if (b.gameMaster !== undefined) {
    if (typeof b.gameMaster !== 'boolean') fail('gameMaster must be true or false')
    patch.gameMaster = b.gameMaster
  }
  if (b.findable !== undefined) {
    if (typeof b.findable !== 'boolean') fail('findable must be true or false')
    patch.findable = b.findable
  }
  if (Object.keys(patch).length === 0) fail('Send displayName, gameMaster or findable')
  return patch
}
