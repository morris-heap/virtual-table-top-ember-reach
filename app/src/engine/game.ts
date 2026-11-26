// Pure helpers for Games (VTTER-72). The rules live in the API (api/src/game.ts); these shape the screens.
import core from '../../../data/core.json'
import gameData from '../../../data/game.json'
import type { AdventureRef, GameDraft, GameMember } from '../api/types.ts'

export const GAME_LIMITS = gameData.limits
export const RECOMMENDED_PARTY = core.party.recommendedMax

// 6 characters for new IDs, 5 for the ones handed out before. Must match api/src/profile.ts.
const PLAYER_ID = /^EMBER-[A-HJKMNP-Z2-9]{5,6}$/

/** Accepts what people paste: any case, stray spaces. Returns the clean ID, or null. */
export function cleanPlayerId(input: string): string | null {
  const id = input.trim().toUpperCase()
  return PLAYER_ID.test(id) ? id : null
}

export function newGame(name: string, adventure: AdventureRef, solo: boolean): GameDraft {
  // Private and unlisted to start with: listing a Game is always the GM's own choice (VTTER-76).
  return { name: name.trim().slice(0, GAME_LIMITS.nameMax) || 'New Game', adventure, visibility: 'private', solo, listed: false }
}

/**
 * Why a listed Game cannot be joined right now, or null when it can be (VTTER-76).
 * Being past the recommended party size is not a reason: that is advice, never a block.
 */
export function joinBlocker(game: { full: boolean; joined: boolean }): string | null {
  if (game.joined) return null
  return game.full ? `This table is full (${GAME_LIMITS.maxMembers} people).` : null
}

/** The same advice as partyWarning, for a browse row where only the hero count is known. */
export function heroCountWarning(heroes: number): string | null {
  return heroes > RECOMMENDED_PARTY
    ? `${heroes} heroes already, past the recommended ${RECOMMENDED_PARTY}.`
    : null
}

/** The link a GM shares so people can join a public Game. */
export function gameLink(origin: string, id: string): string {
  return `${origin}/games/${id}`
}

/** Players besides the GM. */
export function playerCount(members: GameMember[]): number {
  return members.filter(m => m.role === 'player').length
}

/** Heroes at the table. Each hero takes a turn, so this is what the party-size advice counts (VTTER-77). */
export function heroCount(members: GameMember[]): number {
  return members.filter(m => m.hero !== null).length
}

/**
 * Turns slow down past the recommended party, because every hero adds a turn to the Heroes' Phase.
 * Advice only: there is no hard cap (data/core.json party.recommendedMax). Null while the table is comfortable.
 */
export function partyWarning(members: GameMember[]): string | null {
  const n = heroCount(members)
  return n > RECOMMENDED_PARTY
    ? `${n} heroes. Each one adds a turn to the Heroes' Phase, so consider splitting the table.`
    : null
}

export function memberName(m: GameMember): string {
  return m.displayName || m.playerId || 'A player'
}
