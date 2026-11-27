import type { PresenceStore } from '../src/handler.ts'

/** In-memory presence with the same semantics as DynamoPresenceStore. */
export class MemoryPresence implements PresenceStore {
  beats = new Map<string, { gameId: string; seenAt: number }>()
  async beat(user: string, gameId: string, seenAt: number) { this.beats.set(user, { gameId, seenAt }) }
  async presenceOf(ids: string[]) {
    const out: Record<string, { gameId: string; seenAt: number }> = {}
    for (const id of ids) { const b = this.beats.get(id); if (b) out[id] = b }
    return out
  }
}

/** For tests that never reach presence. */
export const noPresence: PresenceStore = { beat: async () => {}, presenceOf: async () => ({}) }
