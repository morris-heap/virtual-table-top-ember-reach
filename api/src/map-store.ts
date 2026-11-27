// DynamoDB storage for maps (VTTER-74, ADR 0011): one item per map under its author, key `ownerId` +
// `map#<uuid>`, `kind: "map"`, objects as a native list of maps. No gsi1 entry: maps are never listed
// across partitions.
//
// The 3-maps-per-user cap is a counter item (`count#map`, `kind: "count"`) that only increments while
// below the cap. Like the Game roster and pointer (ADR 0006), the counter and the map are two writes,
// not a transaction, so no new IAM action is needed. Each order fails safe: the counter is bumped before
// the map is written and dropped after it is deleted, so a crash can only leave it too high, and a
// save that hits the cap recounts the real maps and repairs it.
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { DatabaseUnavailable, MapLimitReached, type MapStore } from './handler.ts'
import { migrateMap, MAPS_PER_USER, type MapDraft, type MapRecord, type MapSummary } from './map.ts'
import { guard, isConditionFailure, setExpression } from './store.ts'

const MAP_PREFIX = 'map#'
const COUNTER_ID = 'count#map'
const SUMMARY_FIELDS = ['id', 'name', 'size', 'width', 'height', 'updatedAt'] as const

export class DynamoMapStore implements MapStore {
  constructor(private db: DynamoDBDocumentClient, private table: string, private cap = MAPS_PER_USER) {}

  async list(ownerId: string): Promise<MapSummary[]> {
    const items: MapSummary[] = []
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': ownerId, ':p': MAP_PREFIX },
        ProjectionExpression: SUMMARY_FIELDS.map(f => `#${f}`).join(', '),
        ExpressionAttributeNames: Object.fromEntries(SUMMARY_FIELDS.map(f => [`#${f}`, f])),
        ConsistentRead: true,
        ExclusiveStartKey: start,
      })))
      // Field by field, so widening the projection can never carry `ownerId` out.
      for (const it of (page.Items ?? []) as MapSummary[]) {
        items.push({ id: it.id.slice(MAP_PREFIX.length), name: it.name, size: it.size, width: it.width, height: it.height, updatedAt: it.updatedAt })
      }
      start = page.LastEvaluatedKey
    } while (start)
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(ownerId: string, id: string): Promise<MapRecord | null> {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId, id: MAP_PREFIX + id }, ConsistentRead: true,
    })))
    return res.Item ? toMap(res.Item) : null
  }

  /** Replace an existing map, or create it if the author is under the cap. */
  async save(ownerId: string, id: string, draft: MapDraft): Promise<MapRecord> {
    const existing = await this.write(ownerId, id, draft, 'attribute_exists(#id)')
    if (existing) return existing
    await this.claimSlot(ownerId)
    let created: MapRecord | null
    try {
      created = await this.write(ownerId, id, draft, 'attribute_not_exists(#id)')
    } catch (err) {
      await this.releaseSlot(ownerId).catch(() => {})
      throw err
    }
    if (created) return created
    // A parallel request created it first: this is an update after all, and the slot isn't needed.
    await this.releaseSlot(ownerId)
    const updated = await this.write(ownerId, id, draft, 'attribute_exists(#id)')
    if (updated) return updated
    // Created and deleted again between our two writes. Rare enough that "try again" is the answer.
    throw new DatabaseUnavailable()
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const res = await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table, Key: { ownerId, id: MAP_PREFIX + id }, ReturnValues: 'ALL_OLD',
    })))
    if (!res.Attributes) return false
    await this.releaseSlot(ownerId)
    return true
  }

  /** One conditional write of the whole map, or null when the condition fails. */
  private async write(ownerId: string, id: string, draft: MapDraft, condition: string): Promise<MapRecord | null> {
    const now = new Date().toISOString()
    const { names, values, sets } = setExpression({ ...draft, kind: 'map', updatedAt: now })
    names['#createdAt'] = 'createdAt'
    names['#id'] = 'id'
    values[':now'] = now
    sets.push('#createdAt = if_not_exists(#createdAt, :now)')
    try {
      const res = await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId, id: MAP_PREFIX + id },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: condition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })))
      return toMap(res.Attributes!)
    } catch (err) {
      if (isConditionFailure(err)) return null
      throw err
    }
  }

  /** Take one of the author's map slots, or throw MapLimitReached. */
  private async claimSlot(ownerId: string): Promise<void> {
    if (await this.bump(ownerId)) return
    // At the cap by the counter. Recount the real maps, in case a crash left the counter too high.
    const real = await this.countMaps(ownerId)
    if (real >= this.cap) throw new MapLimitReached()
    await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId, id: COUNTER_ID },
      UpdateExpression: 'SET #n = :n, #kind = :k',
      ExpressionAttributeNames: { '#n': 'n', '#kind': 'kind' },
      ExpressionAttributeValues: { ':n': real, ':k': 'count' },
    })))
    if (!(await this.bump(ownerId))) throw new MapLimitReached()
  }

  /** Add 1 to the counter only while it is below the cap. */
  private async bump(ownerId: string): Promise<boolean> {
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId, id: COUNTER_ID },
        UpdateExpression: 'SET #kind = :k ADD #n :one',
        ConditionExpression: 'attribute_not_exists(#n) OR #n < :cap',
        ExpressionAttributeNames: { '#n': 'n', '#kind': 'kind' },
        ExpressionAttributeValues: { ':one': 1, ':cap': this.cap, ':k': 'count' },
      })))
      return true
    } catch (err) {
      if (isConditionFailure(err)) return false
      throw err
    }
  }

  /** Give a slot back. Never below zero. */
  private async releaseSlot(ownerId: string): Promise<void> {
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId, id: COUNTER_ID },
        UpdateExpression: 'ADD #n :minus',
        ConditionExpression: '#n > :zero',
        ExpressionAttributeNames: { '#n': 'n' },
        ExpressionAttributeValues: { ':minus': -1, ':zero': 0 },
      })))
    } catch (err) {
      if (!isConditionFailure(err)) throw err
    }
  }

  private async countMaps(ownerId: string): Promise<number> {
    let n = 0
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': ownerId, ':p': MAP_PREFIX },
        Select: 'COUNT',
        ConsistentRead: true,
        ExclusiveStartKey: start,
      })))
      n += page.Count ?? 0
      start = page.LastEvaluatedKey
    } while (start)
    return n
  }
}

/**
 * Only the map's own fields: the bare UUID, no `ownerId` (a Cognito `sub`), no `kind` marker. Migrated on
 * read, so a map stored by an older schema always leaves the API in the current one.
 */
function toMap(item: Record<string, unknown>): MapRecord {
  const m = migrateMap(item as unknown as MapRecord)
  return {
    id: String(item.id).slice(MAP_PREFIX.length),
    schemaVersion: m.schemaVersion,
    name: m.name,
    size: m.size,
    width: m.width,
    height: m.height,
    objects: m.objects ?? [],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}
