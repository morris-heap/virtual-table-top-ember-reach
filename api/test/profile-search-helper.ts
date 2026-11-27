// A test double for ProfileStore's name search (VTTER-108). Mirrors the DynamoDB store: only players who are
// findable, matched on the whole folded name, never the caller, capped, and public fields only.
import { foldedName, type FoundPlayer, type ProfileRecord } from '../src/profile.ts'

export function findInMemory(rows: Map<string, ProfileRecord>, name: string, except: string, limit: number): FoundPlayer[] {
  const folded = foldedName(name)
  if (!folded) return []
  return [...rows]
    .filter(([owner, r]) => owner !== except && r.findable === true && foldedName(r.displayName) === folded)
    .slice(0, limit)
    .map(([, r]) => ({ playerId: r.playerId, displayName: r.displayName }))
}

/** Allows `max` searches per owner, then refuses, like the per-minute counter in the real store. */
export function searchAllowance(max: number) {
  const used = new Map<string, number>()
  return async (ownerId: string) => {
    const n = (used.get(ownerId) ?? 0) + 1
    used.set(ownerId, n)
    return n <= max
  }
}
