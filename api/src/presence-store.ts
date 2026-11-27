// DynamoDB implementation of PresenceStore (VTTER-73, docs/adr/0012-presence.md). Same table as everything else:
//   (me, presence#current)  where I am right now: `gameId` and `seenAt` (epoch ms), overwritten by each heartbeat.
// One Update to write and one BatchGet to read; the Lambda role needs both (infra/lib/api-stack.ts).
// Ids here are Cognito ids and never leave the API.
import { BatchGetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DatabaseUnavailable, type PresenceStore } from './handler.ts'
import { guard } from './store.ts'

export const PRESENCE_ID = 'presence#current'
const BATCH_MAX = 100

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

  async presenceOf(userIds: string[]) {
    const out: Record<string, { gameId: string; seenAt: number }> = {}
    for (let i = 0; i < userIds.length; i += BATCH_MAX) {
      let pending: Record<string, unknown>[] = userIds.slice(i, i + BATCH_MAX).map(ownerId => ({ ownerId, id: PRESENCE_ID }))
      for (let attempt = 0; pending.length && attempt < 5; attempt++) {
        const res = await guard(() => this.db.send(new BatchGetCommand({
          RequestItems: {
            [this.table]: {
              Keys: pending,
              ProjectionExpression: '#o, #g, #seen',
              ExpressionAttributeNames: { '#o': 'ownerId', '#g': 'gameId', '#seen': 'seenAt' },
            },
          },
        })))
        for (const it of res.Responses?.[this.table] ?? []) {
          out[it.ownerId as string] = { gameId: it.gameId as string, seenAt: Number(it.seenAt) }
        }
        pending = (res.UnprocessedKeys?.[this.table]?.Keys ?? []) as Record<string, unknown>[]
        if (pending.length) await new Promise(r => setTimeout(r, 2 ** attempt * 50))
      }
      if (pending.length) throw new DatabaseUnavailable()
    }
    return out
  }
}
