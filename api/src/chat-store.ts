// DynamoDB implementation of ChatStore (docs/adr/0010-friend-chat.md). Same table as everything else.
//   (chat#<lowId>#<highId>, msg#<ISO>#<hex>)   one message in a pair's thread: kind 'message'
//   (ratelimit#<sender>, min#<minute>)         messages a sender has sent this minute: kind 'ratelimit'
// Both items expire through the table's `ttl` attribute. The unread markers live on each player's own
// `friend#` item (ADR 0009). Only Query and UpdateItem are used, which the Lambda role already grants
// (infra/lib/api-stack.ts): UpdateItem also creates an item that doesn't exist, so no PutItem is needed.
import { QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { CHAT_LIMITS, newMessageId, type ChatMessageRecord } from './chat.ts'
import { FRIEND_PREFIX } from './friend-store.ts'
import type { ChatStore } from './handler.ts'
import { guard, isConditionFailure } from './store.ts'

export const MESSAGE_PREFIX = 'msg#'
const DAY_SECONDS = 24 * 60 * 60

/** One thread per pair, whichever of the two writes: the ids are sorted, so both sides share a partition. */
export function threadKey(a: string, b: string): string {
  return `chat#${[a, b].sort().join('#')}`
}

const expiry = (now: Date, days: number) => Math.floor(now.getTime() / 1000) + days * DAY_SECONDS

export class DynamoChatStore implements ChatStore {
  constructor(private db: DynamoDBDocumentClient, private table: string, private clock: () => Date = () => new Date()) {}

  async list(a: string, b: string, query: { before?: string; after?: string }) {
    const size = CHAT_LIMITS.pageSize
    const forward = query.after !== undefined
    const res = await guard(() => this.db.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: forward ? 'ownerId = :o AND #id > :c'
        : query.before !== undefined ? 'ownerId = :o AND #id < :c' : 'ownerId = :o AND begins_with(#id, :c)',
      ExpressionAttributeNames: { '#id': 'id', '#from': 'from', '#text': 'text' },
      ExpressionAttributeValues: {
        ':o': threadKey(a, b),
        ':c': forward ? MESSAGE_PREFIX + query.after : query.before !== undefined ? MESSAGE_PREFIX + query.before : MESSAGE_PREFIX,
      },
      ProjectionExpression: '#id, #from, #text, createdAt',
      // Forward (polling) reads the oldest unseen first. Otherwise newest first, flipped below.
      ScanIndexForward: forward,
      Limit: size + 1,
      // A poll right after a send must see it.
      ConsistentRead: true,
    })))
    const items = res.Items ?? []
    const hasMore = items.length > size
    const page = items.slice(0, size).map(toRecord)
    return { messages: forward ? page : page.reverse(), hasMore }
  }

  async send(from: string, to: string, text: string): Promise<ChatMessageRecord | null> {
    const now = this.clock()
    const at = now.toISOString()

    // A sender's messages this minute. The condition refuses the increment once the cap is reached.
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: `ratelimit#${from}`, id: `min#${Math.floor(now.getTime() / 60000)}` },
        UpdateExpression: 'SET #kind = :k, #ttl = :ttl ADD #n :one',
        ConditionExpression: 'attribute_not_exists(#n) OR #n < :max',
        ExpressionAttributeNames: { '#kind': 'kind', '#ttl': 'ttl', '#n': 'count' },
        ExpressionAttributeValues: { ':k': 'ratelimit', ':ttl': expiry(now, 1), ':one': 1, ':max': CHAT_LIMITS.maxPerMinute },
      })))
    } catch (err) {
      if (isConditionFailure(err)) return null
      throw err
    }

    const record: ChatMessageRecord = { id: newMessageId(now), from, text, createdAt: at }
    await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId: threadKey(from, to), id: MESSAGE_PREFIX + record.id },
      UpdateExpression: 'SET #kind = :k, #from = :f, #text = :t, #at = :at, #ttl = :ttl',
      ExpressionAttributeNames: { '#kind': 'kind', '#from': 'from', '#text': 'text', '#at': 'createdAt', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':k': 'message', ':f': from, ':t': text, ':at': at, ':ttl': expiry(now, CHAT_LIMITS.ttlDays) },
    })))

    // Unread markers: the receiver has something new, and the sender has by definition seen everything.
    await this.mark(to, from, 'lastMessageAt', at)
    await this.mark(from, to, 'lastReadAt', at)
    return record
  }

  async markRead(userId: string, otherId: string) {
    await this.mark(userId, otherId, 'lastReadAt', this.clock().toISOString())
  }

  /** Set a marker on `owner`'s side of the friendship. It never recreates a side that was removed. */
  private async mark(owner: string, other: string, field: 'lastMessageAt' | 'lastReadAt', at: string) {
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: owner, id: FRIEND_PREFIX + other },
        UpdateExpression: 'SET #f = :at',
        ConditionExpression: 'attribute_exists(#id)',
        ExpressionAttributeNames: { '#f': field, '#id': 'id' },
        ExpressionAttributeValues: { ':at': at },
      })))
    } catch (err) {
      if (!isConditionFailure(err)) throw err
    }
  }
}

function toRecord(item: Record<string, unknown>): ChatMessageRecord {
  return {
    id: (item.id as string).slice(MESSAGE_PREFIX.length),
    from: item.from as string,
    text: item.text as string,
    createdAt: item.createdAt as string,
  }
}
