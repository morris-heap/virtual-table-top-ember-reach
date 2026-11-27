// DynamoDB implementation of FriendStore (docs/adr/0009-friends.md). Same table as everything else.
//   (me, friend#<otherId>)  my side of a friendship: kind 'friend', status incoming | outgoing | accepted
// Each player holds their own item, so "my friends" is one Query on my partition with begins_with.
// Get, BatchGet, Query, Update and Delete are used; the Lambda role grants exactly those
// (infra/lib/api-stack.ts). Add an action there before calling anything new here.
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { FriendEdge, FriendIdentity, FriendStatus } from './friend.ts'
import type { FriendStore } from './handler.ts'
import { batchGetConsistent, guard, isConditionFailure } from './store.ts'

export const FRIEND_PREFIX = 'friend#'
const PROFILE_ID = 'profile'

export class DynamoFriendStore implements FriendStore {
  constructor(private db: DynamoDBDocumentClient, private table: string) {}

  async list(userId: string): Promise<FriendEdge[]> {
    const edges: FriendEdge[] = []
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': userId, ':p': FRIEND_PREFIX },
        ExpressionAttributeNames: { '#s': 'status' },
        ProjectionExpression: 'id, #s, lastMessageAt, lastReadAt',
        ExclusiveStartKey: start,
      })))
      for (const it of page.Items ?? []) edges.push(toEdge(it))
      start = page.LastEvaluatedKey
    } while (start)
    return edges
  }

  async get(userId: string, otherId: string): Promise<FriendEdge | null> {
    // Strongly consistent: a request just sent or accepted must be seen by the next call.
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId: userId, id: FRIEND_PREFIX + otherId }, ConsistentRead: true,
    })))
    return res.Item ? toEdge(res.Item) : null
  }

  /**
   * Write one side. Never downgrades an accepted friendship: a request that races an acceptance
   * is dropped by the condition instead of turning "accepted" back into "incoming".
   */
  private async put(userId: string, otherId: string, status: FriendStatus) {
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: userId, id: FRIEND_PREFIX + otherId },
        UpdateExpression: 'SET #kind = :k, #s = :s, #u = :now',
        ConditionExpression: status === 'accepted' ? undefined : 'attribute_not_exists(#s) OR #s <> :acc',
        ExpressionAttributeNames: { '#kind': 'kind', '#s': 'status', '#u': 'updatedAt' },
        ExpressionAttributeValues: {
          ':k': 'friend', ':s': status, ':now': new Date().toISOString(),
          ...(status === 'accepted' ? {} : { ':acc': 'accepted' }),
        },
      })))
    } catch (err) {
      if (!isConditionFailure(err)) throw err
    }
  }

  async request(fromId: string, toId: string) {
    // Mine first: if the second write is lost, I hold an `outgoing` they can't see, and sending again heals it.
    await this.put(fromId, toId, 'outgoing')
    await this.put(toId, fromId, 'incoming')
  }

  async accept(userId: string, otherId: string) {
    await this.put(userId, otherId, 'accepted')
    await this.put(otherId, userId, 'accepted')
  }

  async remove(userId: string, otherId: string) {
    // Both sides. Reading someone's `friends` adventure needs both sides accepted, so either delete alone
    // already revokes access; doing both keeps the lists tidy.
    for (const [owner, other] of [[userId, otherId], [otherId, userId]]) {
      await guard(() => this.db.send(new DeleteCommand({
        TableName: this.table, Key: { ownerId: owner, id: FRIEND_PREFIX + other },
      })))
    }
  }

  async areFriends(a: string, b: string) {
    const [mine, theirs] = await Promise.all([this.get(a, b), this.get(b, a)])
    return mine?.status === 'accepted' && theirs?.status === 'accepted'
  }

  async identities(userIds: string[]): Promise<Record<string, FriendIdentity>> {
    const items = await batchGetConsistent(
      this.db, this.table, userIds.map(id => ({ ownerId: id, id: PROFILE_ID })),
      { expression: '#o, playerId, displayName', names: { '#o': 'ownerId' } },
    )
    const out: Record<string, FriendIdentity> = {}
    for (const it of items) {
      out[it.ownerId as string] = { playerId: it.playerId as string, displayName: (it.displayName as string | undefined) ?? '' }
    }
    return out
  }
}

/** Strip the storage prefix, so what the handler sees is the other player's bare id. */
function toEdge(item: Record<string, unknown>): FriendEdge {
  return {
    userId: (item.id as string).slice(FRIEND_PREFIX.length),
    status: item.status as FriendStatus,
    lastMessageAt: item.lastMessageAt as string | undefined,
    lastReadAt: item.lastReadAt as string | undefined,
  }
}
