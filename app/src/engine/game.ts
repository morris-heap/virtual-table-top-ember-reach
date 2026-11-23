// Pure helpers for Games (VTTER-72). The rules live in the API (api/src/game.ts); these shape the screens.
import core from '../../../data/core.json'
import gameData from '../../../data/game.json'
import type { AdventureRef, GameDraft, GameMember } from '../api/types.ts'

export const GAME_LIMITS = gameData.limits
export const RECOMMENDED_PARTY = core.party.recommendedMax

const PLAYER_ID = /^EMBER-[A-HJKMNP-Z2-9]{5}$/

/** Accepts what people paste: any case, stray spaces. Returns the clean ID, or null. */
export function cleanPlayerId(input: string): string | null {
  const id = input.trim().toUpperCase()
  return PLAYER_ID.test(id) ? id : null
}

export function newGame(name: string, adventure: AdventureRef, solo: boolean): GameDraft {
  return { name: name.trim().slice(0, GAME_LIMITS.nameMax) || 'New Game', adventure, visibility: 'private', solo }
}

/** The link a GM shares so people can join a public Game. */
export function gameLink(origin: string, id: string): string {
  return `${origin}/games/${id}`
}

/** Players besides the GM. */
export function playerCount(members: GameMember[]): number {
  return members.filter(m => m.role === 'player').length
}

/** Turns slow down past the recommended party. There is no hard cap. Null while the table is comfortable. */
export function partyWarning(members: GameMember[]): string | null {
  const n = playerCount(members)
  return n > RECOMMENDED_PARTY
    ? `${n} players. Turns slow down with more than ${RECOMMENDED_PARTY}, so consider splitting the table.`
    : null
}

export function memberName(m: GameMember): string {
  return m.displayName || m.playerId || 'A player'
}
