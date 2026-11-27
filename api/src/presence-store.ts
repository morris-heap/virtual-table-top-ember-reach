// DynamoDB implementation of PresenceStore (docs/adr/0012-presence.md). Same table as everything else:
//   (me, presence#current)   where I am right now: kind 'presence', `gameId` and `seenAt` (epoch ms).
// One item per player, overwritten by every heartbeat. There is no TTL and no cleanup job: a stale `seenAt`
// simply reads as offline. UpdateItem and BatchGetItem are used, which the Lambda role already grants
// (infra/lib/api-stack.ts). Add an action there before calling anything new here.
import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { PresenceStore } from './handler.ts'
import type { PresenceRecord } from './presence.ts'
import { batchGetConsistent, guard } from './store.ts'

export const PRESENCE_ID = 'presence#current'

export class DynamoPresenceStore implements PresenceStore {
  constructor(private db: DynamoDBDocumentClient, private table: string) {}

  async beat(userId: string, gameId: string, nowMs: number) {
    await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId: userId, id: PRESENCE_ID },
      UpdateExpression: 'SET #kind = :k, #g = :g, #seen = :t',
      ExpressionAttributeNames: { '#kind': 'kind', '#g': 'gameId', '#seen': 'seenAt' },
      ExpressionAttributeValues: { ':k': 'presence', ':g': gameId, ':t': nowMs },
    })))
  }

  /** Many players in one BatchGetItem, never a GetItem each. A player who never sent a beat is absent. */
  async presenceOf(userIds: string[]) {
    const items = await batchGetConsistent(
      this.db, this.table, userIds.map(ownerId => ({ ownerId, id: PRESENCE_ID })),
      { expression: '#o, #g, #seen', names: { '#o': 'ownerId', '#g': 'gameId', '#seen': 'seenAt' } },
    )
    const out: Record<string, PresenceRecord> = {}
    for (const it of items) out[it.ownerId as string] = { gameId: it.gameId as string, seenAt: Number(it.seenAt) }
    return out
  }
}
