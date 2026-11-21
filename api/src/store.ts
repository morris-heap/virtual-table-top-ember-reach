// DynamoDB implementation of CharacterStore. One item per hero (docs/adr/0003-backend-dynamodb-lambda.md):
// partition key ownerId, sort key id. Lists (skills, wounds, attacks, talents, spells) are native
// DynamoDB lists and maps on the item, not JSON strings. A save replaces the whole sheet in one write.
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DatabaseUnavailable, type CharacterStore } from './handler.ts'
import type { CharacterRecord, CharacterSheet, CharacterSummary } from './sheet.ts'

const LIST_LIMIT = 200
const SUMMARY_FIELDS = ['id', 'name', 'level', 'ancestry', 'calling', 'updatedAt'] as const

// Errors that mean "try again soon", not "your request is wrong".
const TRANSIENT = new Set([
  'ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded',
  'InternalServerError', 'ServiceUnavailable', 'TimeoutError',
])

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    const e = err as { name?: string; $retryable?: unknown }
    if ((e.name && TRANSIENT.has(e.name)) || e.$retryable) throw new DatabaseUnavailable()
    throw err
  }
}

/** `#a = :a` pairs for every field, so names that are DynamoDB reserved words (name, level…) are safe. */
function setExpression(fields: Record<string, unknown>) {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const sets: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    names[`#${k}`] = k
    values[`:${k}`] = v
    sets.push(`#${k} = :${k}`)
  }
  return { names, values, sets }
}

export class DynamoCharacterStore implements CharacterStore {
  constructor(private db: DynamoDBDocumentClient, private table: string) {}

  async ping() {
    // A read of a key that never exists: proves the table is reachable and the role can read it.
    await guard(() => this.db.send(new GetCommand({ TableName: this.table, Key: { ownerId: '_health', id: '_health' } })))
  }

  async list(ownerId: string): Promise<CharacterSummary[]> {
    const items: CharacterSummary[] = []
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o',
        ExpressionAttributeValues: { ':o': ownerId },
        ProjectionExpression: SUMMARY_FIELDS.map(f => `#${f}`).join(', '),
        ExpressionAttributeNames: Object.fromEntries(SUMMARY_FIELDS.map(f => [`#${f}`, f])),
        ExclusiveStartKey: start,
      })))
      items.push(...(page.Items ?? []) as CharacterSummary[])
      start = page.LastEvaluatedKey
    } while (start)
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, LIST_LIMIT)
  }

  async get(ownerId: string, id: string) {
    // Strongly consistent, so a read right after a save sees it.
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId, id }, ConsistentRead: true,
    })))
    return (res.Item as CharacterRecord | undefined) ?? null
  }

  async save(ownerId: string, id: string, sheet: CharacterSheet) {
    const now = new Date().toISOString()
    const { names, values, sets } = setExpression({ ...sheet, updatedAt: now })
    names['#createdAt'] = 'createdAt'
    values[':now'] = now
    sets.push('#createdAt = if_not_exists(#createdAt, :now)')
    const res = await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId, id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })))
    return res.Attributes as CharacterRecord
  }

  async delete(ownerId: string, id: string) {
    const res = await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table, Key: { ownerId, id }, ReturnValues: 'ALL_OLD',
    })))
    return res.Attributes !== undefined
  }
}
