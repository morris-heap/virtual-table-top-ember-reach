// DynamoDB implementation of CharacterStore. One item per hero (docs/adr/0003-backend-dynamodb-lambda.md):
// partition key ownerId, sort key id. Lists (skills, wounds, attacks, talents, spells, minerals) are native
// DynamoDB lists and maps on the item, not JSON strings. A save replaces the whole sheet in one write.
import { BatchGetCommand, DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { AdventureDraft, AdventureRecord, AdventureSummary } from './adventure.ts'
import { DatabaseUnavailable, type AdventureStore, type CharacterStore, type ProfileStore } from './handler.ts'
import { FIND_PK, findKey, foldedName, NAME_SEARCH, newPlayerId, type FoundPlayer, type ProfilePatch, type ProfileRecord } from './profile.ts'
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
/** The table's one shared sparse index (ADR 0008). Must match GSI1 in infra/lib/data-stack.ts and api/src/game-store.ts. */
const GSI1 = 'gsi1'

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

/** BatchGetItem takes at most 100 keys per request. */
const BATCH_MAX = 100

/**
 * Read many items by key in one request instead of one `GetItem` each. Strongly consistent, because
 * callers must see a write that just happened.
 *
 * DynamoDB may return fewer items than asked for when a response grows large or a partition throttles,
 * naming the rest in `UnprocessedKeys`; those are retried with a short backoff rather than dropped,
 * since a dropped key reads as "that item is gone".
 */
export async function batchGetConsistent(
  db: DynamoDBDocumentClient, table: string, keys: Record<string, unknown>[],
  projection?: { expression: string; names: Record<string, string> },
) {
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < keys.length; i += BATCH_MAX) {
    let pending = keys.slice(i, i + BATCH_MAX)
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      const res = await guard(() => db.send(new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: pending,
            ConsistentRead: true,
            ...(projection ? { ProjectionExpression: projection.expression, ExpressionAttributeNames: projection.names } : {}),
          },
        },
      })))
      out.push(...(res.Responses?.[table] ?? []))
      pending = (res.UnprocessedKeys?.[table]?.Keys ?? []) as Record<string, unknown>[]
      if (pending.length) await new Promise(r => setTimeout(r, 2 ** attempt * 50))
    }
    if (pending.length) throw new DatabaseUnavailable()
  }
  return out
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
          UpdateExpression: 'SET #kind = :k, #p = :p, #d = :d, #g = :g, #f = :f, #c = :now, #u = :now',
          ConditionExpression: 'attribute_not_exists(#p)',
          ExpressionAttributeNames: { '#kind': 'kind', '#p': 'playerId', '#d': 'displayName', '#g': 'gameMaster', '#f': 'findable', '#c': 'createdAt', '#u': 'updatedAt' },
          ExpressionAttributeValues: { ':k': 'profile', ':p': playerId, ':d': '', ':g': false, ':f': false, ':now': now },
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
    // The search key joins the name and the player ID, which DynamoDB can't do inside an update, so a
    // change to the name or to being findable reads the profile first and is written only if nobody
    // changed it in between. A gameMaster-only change doesn't touch the index and needs no read.
    const touchesIndex = patch.displayName !== undefined || patch.findable !== undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = touchesIndex ? await this.read(ownerId) : null
      const { names, values, sets } = setExpression({ ...patch, updatedAt: new Date().toISOString() })
      const removes: string[] = []
      let condition = 'attribute_exists(playerId)'
      if (current) {
        const displayName = patch.displayName ?? current.displayName
        const findable = patch.findable ?? current.findable === true
        names['#gsi1pk'] = 'gsi1pk'
        names['#gsi1sk'] = 'gsi1sk'
        // Findable needs a name to be found by. Anyone else carries no index attributes, so is not in the index.
        if (findable && foldedName(displayName) !== '') {
          values[':gsi1pk'] = FIND_PK
          values[':gsi1sk'] = findKey(displayName, current.playerId)
          sets.push('#gsi1pk = :gsi1pk', '#gsi1sk = :gsi1sk')
        } else {
          removes.push('#gsi1pk', '#gsi1sk')
        }
        condition += ' AND #seen = :seen'
        names['#seen'] = 'updatedAt'
        values[':seen'] = current.updatedAt
      }
      try {
        const res = await guard(() => this.db.send(new UpdateCommand({
          TableName: this.table,
          Key: { ownerId, id: PROFILE_ID },
          UpdateExpression: `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`,
          ConditionExpression: condition,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })))
        return toProfile(res.Attributes as ProfileRecord)
      } catch (err) {
        if (!(current && isConditionFailure(err))) throw err // lost a race: read again and retry once
      }
    }
    throw new DatabaseUnavailable()
  }

  /**
   * Players who opted in to being found and whose display name is exactly `name` once case and spacing
   * are folded (VTTER-108). Reads the sparse index for keys only, then the profiles in one BatchGetItem for
   * the display name, so the index projection stays as ADR 0008 left it. The caller is left out.
   * Only a player ID and a display name come back: the owner id in an index row is a Cognito `sub`.
   */
  async findByName(name: string, exceptOwnerId: string, limit: number): Promise<FoundPlayer[]> {
    const folded = foldedName(name)
    if (!folded) return []
    const page = await guard(() => this.db.send(new QueryCommand({
      TableName: this.table,
      IndexName: GSI1,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'gsi1pk', '#sk': 'gsi1sk' },
      ExpressionAttributeValues: { ':pk': FIND_PK, ':prefix': `${folded}#` },
      Limit: limit + 1, // one spare, because the caller's own row may be among them
    })))
    const owners = (page.Items ?? []).map(it => it.ownerId as string).filter(o => o !== exceptOwnerId).slice(0, limit)
    if (owners.length === 0) return []
    return (await this.profilesOf(owners))
      // The profile has the last word: a stale index row for someone who has since renamed or opted out is dropped.
      .filter(p => p.findable === true && foldedName(p.displayName) === folded)
      .map(p => ({ playerId: p.playerId, displayName: p.displayName }))
  }

  /**
   * One search against the caller's allowance for this minute (VTTER-108). Same shape as the chat limiter:
   * (ratelimit#<owner>, search#<minute>) holds the count and expires through the table's `ttl`.
   * The condition refuses the increment once the cap is reached.
   */
  async allowSearch(ownerId: string): Promise<boolean> {
    const nowMs = Date.now()
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: `ratelimit#${ownerId}`, id: `search#${Math.floor(nowMs / 60000)}` },
        UpdateExpression: 'SET #kind = :k, #ttl = :ttl ADD #n :one',
        ConditionExpression: 'attribute_not_exists(#n) OR #n < :max',
        ExpressionAttributeNames: { '#kind': 'kind', '#ttl': 'ttl', '#n': 'count' },
        ExpressionAttributeValues: { ':k': 'ratelimit', ':ttl': Math.floor(nowMs / 1000) + 24 * 60 * 60, ':one': 1, ':max': NAME_SEARCH.perMinute },
      })))
      return true
    } catch (err) {
      if (isConditionFailure(err)) return false
      throw err
    }
  }

  /** One BatchGetItem for a few profiles (at most the search cap), retrying the keys DynamoDB hands back. */
  private async profilesOf(ownerIds: string[]): Promise<ProfileRecord[]> {
    const out: ProfileRecord[] = []
    let pending: Record<string, unknown>[] = ownerIds.map(ownerId => ({ ownerId, id: PROFILE_ID }))
    for (let attempt = 0; pending.length && attempt < 5; attempt++) {
      const res = await guard(() => this.db.send(new BatchGetCommand({
        RequestItems: { [this.table]: { Keys: pending, ConsistentRead: true } },
      })))
      out.push(...((res.Responses?.[this.table] ?? []) as ProfileRecord[]))
      pending = (res.UnprocessedKeys?.[this.table]?.Keys ?? []) as Record<string, unknown>[]
      if (pending.length) await new Promise(r => setTimeout(r, 2 ** attempt * 50))
    }
    if (pending.length) throw new DatabaseUnavailable()
    return out
  }
}

/** Only the public fields: no `kind` marker, no key attributes (`gsi1pk` / `gsi1sk` included). */
function toProfile(item: ProfileRecord): ProfileRecord {
  const { displayName, gameMaster, playerId, createdAt, updatedAt } = item
  return { displayName, gameMaster, findable: item.findable === true, playerId, createdAt, updatedAt }
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
