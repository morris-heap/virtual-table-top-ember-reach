// Presence helpers (VTTER-73, docs/adr/0012-presence.md). The numbers live in data/game.json, so the API and
// the app agree on how long "online" lasts. The API decides who is online; these only shape what the screens show.
import gameData from '../../../data/game.json'
import type { Friend, GameMember } from '../api/types.ts'

/** How often an open Game page tells the API it is still here. Shorter than the online window on purpose. */
export const HEARTBEAT_MS = gameData.presence.heartbeatSeconds * 1000

/** Mark exactly the players in `online` as online, leaving everything else about the roster alone. */
export function withOnline(members: GameMember[], online: string[]): GameMember[] {
  const here = new Set(online)
  return members.map(m => (!!m.online === here.has(m.playerId) ? m : { ...m, online: here.has(m.playerId) }))
}

/** Online friends first, so a glance at the top of the list answers "who is here". Stable within each group. */
export function onlineFirst(friends: Friend[]): Friend[] {
  return [...friends.filter(f => f.online), ...friends.filter(f => !f.online)]
}

/** What to say next to a friend: where they are, as much as the viewer is allowed to know. */
export function presenceText(f: Pick<Friend, 'online' | 'game'>): string {
  if (!f.online) return 'Offline'
  // A Game is named only when you are at that table too, so a stranger's private Game stays private.
  return f.game ? `At the table in “${f.game.name}”` : 'In a Game'
}
