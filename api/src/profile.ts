// The signed-in user's profile: display name, Game Master flag, and a public player ID.
// The player ID is what people share to be found (friends, Games). It is NOT the Cognito `sub`, which stays private.
import { randomInt } from 'node:crypto'
import { fail, obj, text } from './sheet.ts'

export interface Profile {
  /** Empty until the user sets one; the app falls back to their sign-in name. */
  displayName: string
  gameMaster: boolean
  /** Public, shareable, never changes. For example EMBER-7K2Q9. */
  playerId: string
}

export interface ProfileRecord extends Profile {
  createdAt: string
  updatedAt: string
}

export interface ProfilePatch {
  displayName?: string
  gameMaster?: boolean
}

// No 0/O, 1/I/L, so an ID read aloud or typed from a screenshot isn't misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PLAYER_ID = /^EMBER-[A-HJKMNP-Z2-9]{5}$/

export function newPlayerId(pick: (max: number) => number = randomInt): string {
  let s = ''
  for (let i = 0; i < 5; i++) s += ALPHABET[pick(ALPHABET.length)]
  return `EMBER-${s}`
}

export function isPlayerId(v: string): boolean {
  return PLAYER_ID.test(v)
}

export function parseProfilePatch(body: unknown): ProfilePatch {
  const b = obj(body, 'body')
  const patch: ProfilePatch = {}
  if (b.displayName !== undefined) patch.displayName = text(b.displayName, 'displayName', { max: 40 })
  if (b.gameMaster !== undefined) {
    if (typeof b.gameMaster !== 'boolean') fail('gameMaster must be true or false')
    patch.gameMaster = b.gameMaster
  }
  if (Object.keys(patch).length === 0) fail('Send displayName or gameMaster')
  return patch
}
