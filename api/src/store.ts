// DynamoDB implementation of CharacterStore. One item per hero (docs/adr/0003-backend-dynamodb-lambda.md):
// partition key ownerId, sort key id. Lists (skills, wounds, attacks, talents, spells) are native
// DynamoDB lists and maps on the item, not JSON strings. A save replaces the whole sheet in one write.
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { AdventureDraft, AdventureRecord, AdventureSummary } from './adventure.ts'
import { DatabaseUnavailable, type AdventureStore, type CharacterStore, type ProfileStore } from './handler.ts'
import { newPlayerId, type ProfilePatch, type ProfileRecord } from './profile.ts'
import type { CharacterRecord, CharacterSheet, CharacterSummary } from './sheet.ts'

const LIST_LIMIT = 200
const SUMMARY_FIELDS = ['id', 'name', 'level', 'ancestry', 'calling', 'updatedAt'] as const
const ADVENTURE_SUMMARY_FIELDS = ['id', 'title', 'summary', 'levelMin', 'levelMax', 'visibility', 'updatedAt'] as const

// Every kind in the owner's partition is keyed `<kind>#<id>` and carries a `kind` attribute
// (docs/adr/0005). Heroes were the last exception: a bare UUID, found by the absence of `kind`, which
// made the hero list read the whole partition and throw most of it away (VTTER-98).
const HERO_PREFIX = 'hero#'
const ADVENTURE_PREFIX = 'adv#'
const PROFILE_ID = 'profile'
export const PLAYER_LOOKUP_OWNER = '_player' // (ownerId '_player', id <playerId>) -> owner, so a player ID is unique
const CLAIM_ATTEMPTS = 5

export function isConditionFailure(err: unknown): boolean {
  return (err as { name?: string }).name === 'ConditionalCheckFailedException'
}

// Errors that mean "try again soon", not "your request is wrong".
const TRANSIENT = new Set([
  'ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded',
  'InternalServerError', 'ServiceUnavailable', 'TimeoutError',
])

export async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    const e = err as { name?: string; $retryable?: unknown }
    if ((e.name && TRANSIENT.has(e.name)) || e.$retryable) throw new DatabaseUnavailable()
    throw err
  }
}

/** `#a = :a` pairs for every field, so names that are DynamoDB reserved words (name, level…) are safe. */
export function setExpression(fields: Record<string, unknown>) {
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
      // A range read on the prefix: the profile, adventures, Games and member pointers sharing this
      // partition are never read, so a hero list costs the heroes and nothing else.
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': ownerId, ':p': HERO_PREFIX },
        ProjectionExpression: SUMMARY_FIELDS.map(f => `#${f}`).join(', '),
        ExpressionAttributeNames: Object.fromEntries(SUMMARY_FIELDS.map(f => [`#${f}`, f])),
        ExclusiveStartKey: start,
      })))
      for (const it of (page.Items ?? []) as CharacterSummary[]) items.push(toHero(it))
      start = page.LastEvaluatedKey
    } while (start)
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, LIST_LIMIT)
  }

  async get(ownerId: string, id: string) {
    // Strongly consistent, so a read right after a save sees it.
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId, id: HERO_PREFIX + id }, ConsistentRead: true,
    })))
    return res.Item ? toHero(res.Item as CharacterRecord) : null
  }

  async save(ownerId: string, id: string, sheet: CharacterSheet) {
    const now = new Date().toISOString()
    const { names, values, sets } = setExpression({ ...sheet, kind: 'hero', updatedAt: now })
    names['#createdAt'] = 'createdAt'
    values[':now'] = now
    sets.push('#createdAt = if_not_exists(#createdAt, :now)')
    const res = await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId, id: HERO_PREFIX + id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })))
    return toHero(res.Attributes as CharacterRecord)
  }

  async delete(ownerId: string, id: string) {
    const res = await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table, Key: { ownerId, id: HERO_PREFIX + id }, ReturnValues: 'ALL_OLD',
    })))
    return res.Attributes !== undefined
  }
}

export class DynamoProfileStore implements ProfileStore {
  constructor(private db: DynamoDBDocumentClient, private table: string, private makeId = newPlayerId) {}

  private async read(ownerId: string) {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId, id: PROFILE_ID }, ConsistentRead: true,
    })))
    return (res.Item as ProfileRecord | undefined) ?? null
  }

  async getOrCreate(ownerId: string): Promise<ProfileRecord> {
    const existing = await this.read(ownerId)
    if (existing) return toProfile(existing)

    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
      const playerId = this.makeId()
      // 1. Claim the player ID. Fails if someone else already has it, and then we pick another.
      try {
        await guard(() => this.db.send(new UpdateCommand({
          TableName: this.table,
          Key: { ownerId: PLAYER_LOOKUP_OWNER, id: playerId },
          UpdateExpression: 'SET #owner = :o, #kind = :k',
          ConditionExpression: 'attribute_not_exists(#id)',
          ExpressionAttributeNames: { '#owner': 'owner', '#kind': 'kind', '#id': 'id' },
          ExpressionAttributeValues: { ':o': ownerId, ':k': 'player-lookup' },
        })))
      } catch (err) {
        if (isConditionFailure(err)) continue
        throw err
      }
      // 2. Create the profile with that ID, unless a parallel first request got there first.
      const now = new Date().toISOString()
      try {
        const res = await guard(() => this.db.send(new UpdateCommand({
          TableName: this.table,
          Key: { ownerId, id: PROFILE_ID },
          UpdateExpression: 'SET #kind = :k, #p = :p, #d = :d, #g = :g, #c = :now, #u = :now',
          ConditionExpression: 'attribute_not_exists(#p)',
          ExpressionAttributeNames: { '#kind': 'kind', '#p': 'playerId', '#d': 'displayName', '#g': 'gameMaster', '#c': 'createdAt', '#u': 'updatedAt' },
          ExpressionAttributeValues: { ':k': 'profile', ':p': playerId, ':d': '', ':g': false, ':now': now },
          ReturnValues: 'ALL_NEW',
        })))
        return toProfile(res.Attributes as ProfileRecord)
      } catch (err) {
        if (!isConditionFailure(err)) throw err
        // Lost the race: release the ID we claimed and use the winner's profile.
        await guard(() => this.db.send(new DeleteCommand({
          TableName: this.table, Key: { ownerId: PLAYER_LOOKUP_OWNER, id: playerId },
        })))
        const winner = await this.read(ownerId)
        if (winner) return toProfile(winner)
      }
    }
    throw new DatabaseUnavailable()
  }

  async peek(ownerId: string): Promise<ProfileRecord | null> {
    const found = await this.read(ownerId)
    return found ? toProfile(found) : null
  }

  async ownerOfPlayer(playerId: string): Promise<string | null> {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId: PLAYER_LOOKUP_OWNER, id: playerId }, ConsistentRead: true,
    })))
    return (res.Item?.owner as string | undefined) ?? null
  }

  async update(ownerId: string, patch: ProfilePatch): Promise<ProfileRecord> {
    const { names, values, sets } = setExpression({ ...patch, updatedAt: new Date().toISOString() })
    const res = await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId, id: PROFILE_ID },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: 'attribute_exists(playerId)',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })))
    return toProfile(res.Attributes as ProfileRecord)
  }
}

/** Only the public fields: no `kind` marker, no key attributes. */
function toProfile(item: ProfileRecord): ProfileRecord {
  const { displayName, gameMaster, playerId, createdAt, updatedAt } = item
  return { displayName, gameMaster, playerId, createdAt, updatedAt }
}

export class DynamoAdventureStore implements AdventureStore {
  constructor(private db: DynamoDBDocumentClient, private table: string) {}

  async list(ownerId: string): Promise<AdventureSummary[]> {
    const items: AdventureSummary[] = []
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': ownerId, ':p': ADVENTURE_PREFIX },
        ProjectionExpression: ADVENTURE_SUMMARY_FIELDS.map(f => `#${f}`).join(', '),
        ExpressionAttributeNames: Object.fromEntries(ADVENTURE_SUMMARY_FIELDS.map(f => [`#${f}`, f])),
        ExclusiveStartKey: start,
      })))
      for (const it of (page.Items ?? []) as AdventureSummary[]) items.push({ ...it, id: it.id.slice(ADVENTURE_PREFIX.length) })
      start = page.LastEvaluatedKey
    } while (start)
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, LIST_LIMIT)
  }

  async get(ownerId: string, id: string) {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId, id: ADVENTURE_PREFIX + id }, ConsistentRead: true,
    })))
    return res.Item ? toAdventure(res.Item as AdventureRecord) : null
  }

  async save(ownerId: string, id: string, draft: AdventureDraft) {
    const now = new Date().toISOString()
    const { names, values, sets } = setExpression({ ...draft, kind: 'adventure', updatedAt: now })
    names['#createdAt'] = 'createdAt'
    values[':now'] = now
    sets.push('#createdAt = if_not_exists(#createdAt, :now)')
    const res = await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId, id: ADVENTURE_PREFIX + id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })))
    return toAdventure(res.Attributes as AdventureRecord)
  }

  async delete(ownerId: string, id: string) {
    const res = await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table, Key: { ownerId, id: ADVENTURE_PREFIX + id }, ReturnValues: 'ALL_OLD',
    })))
    return res.Attributes !== undefined
  }
}

/** Strip the storage prefix and the internal `kind` marker. */
/**
 * Strip the storage prefix and `kind` so what leaves the API is what it always was: a hero whose `id`
 * is the bare UUID. The prefix is a storage detail, and the bare UUID is what the app puts in a URL,
 * what a member pointer stores as `heroId`, and what keys the S3 portrait object.
 */
function toHero<T extends { id: string }>(item: T & { kind?: string }): T {
  const { kind: _kind, ...rest } = item
  return { ...rest, id: item.id.startsWith(HERO_PREFIX) ? item.id.slice(HERO_PREFIX.length) : item.id } as T
}

function toAdventure(item: AdventureRecord & { kind?: string }): AdventureRecord {
  const { kind: _kind, ...rest } = item
  return { ...rest, id: item.id.slice(ADVENTURE_PREFIX.length) }
}
