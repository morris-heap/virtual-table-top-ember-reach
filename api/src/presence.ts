// Presence (VTTER-73, docs/adr/0012-presence.md): who has the app open right now, and on which Game page if any. Pure helpers:
// the store does the I/O. Ids here are Cognito ids and never leave the API.
import gameData from '../../data/game.json'

export const PRESENCE = gameData.presence

/** The last heartbeat a player sent: which Game page they had open ('' for any other page), and when (epoch ms). */
export interface PresenceRecord {
  gameId: string
  seenAt: number
}

/**
 * Who counts as online: a beat newer than the window, and, when `gameId` is given, sent from that Game's page.
 * A player with a Game open elsewhere is online but not "at this table".
 */
export function onlineIds(seen: Record<string, PresenceRecord>, nowMs: number, gameId?: string): string[] {
  const cutoff = nowMs - PRESENCE.onlineSeconds * 1000
  return Object.entries(seen)
    .filter(([, p]) => p.seenAt >= cutoff && (gameId === undefined || p.gameId === gameId))
    .map(([id]) => id)
}
