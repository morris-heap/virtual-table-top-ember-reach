// DynamoDB implementation of GameStore (docs/adr/0006-games.md). Same table as heroes, profiles and adventures.
//   (gmId,     game#<id>)  the Game: settings plus `memberIds`, a string set that includes the GM
//   (memberId, gm#<id>)    a pointer from each member (the GM too) to the Game, so a member can find and read it.
//                          It also holds that member's `heroId`: the hero they brought (VTTER-77).
//   ('_game',  <id>)       a pointer from the Game id to its GM, so a public Game can be joined from its link
// Only Get, Query, Update and Delete are used, so the Lambda role needs no new action.
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import gameData from '../../data/game.json'
import { nameKey, type GameDraft, type GameRecord } from './game.ts'
import type { GameStore } from './handler.ts'
import { guard, isConditionFailure, setExpression } from './store.ts'

export const GAME_PREFIX = 'game#'
export const MEMBER_PREFIX = 'gm#'
export const GAME_LOOKUP_OWNER = '_game'
/** (gmId, name#<normalized>) reserves a Game name within one GM's Games (ADR 0008). */
export const NAME_PREFIX = 'name#'
/** The sparse index that lists public Games a GM opted to show (ADR 0008). */
export const PUBLIC_INDEX = 'PublicGames'
const { limits } = gameData

/** Thrown when a GM already has a Game with this name. The route turns it into a 409. */
export class NameTaken extends Error {}

/**
 * Pagination cursor. A GSI's LastEvaluatedKey carries the **base table** keys, and `ownerId` there is the
 * GM's Cognito `sub`, which must never leave the API (ADR 0006). So the cursor keeps only `updatedAt`,
 * the index sort key, and the next page resumes from it. That is enough to page, and leaks nothing.
 */
function encodeCursor(key: Record<string, unknown>): string | null {
  const after = key.updatedAt
  return typeof after === 'string' ? Buffer.from(after).toString('base64url') : null
}

function decodeCursor(cursor: string): string | undefined {
  const after = Buffer.from(cursor, 'base64url').toString('utf8')
  // A hand-made cursor must not crash the query; an unusable one just starts from the top.
  return after && after.length <= 40 ? after : undefined
}

export class DynamoGameStore implements GameStore {
  constructor(private db: DynamoDBDocumentClient, private table: string) {}

  private async readGame(gmId: string, id: string): Promise<GameRecord | null> {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId: gmId, id: GAME_PREFIX + id }, ConsistentRead: true,
    })))
    return res.Item ? toGame(res.Item) : null
  }

  private async pointer(userId: string, id: string): Promise<string | null> {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId: userId, id: MEMBER_PREFIX + id }, ConsistentRead: true,
    })))
    return (res.Item?.gmId as string | undefined) ?? null
  }

  private async writePointer(userId: string, id: string, gmId: string) {
    await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId: userId, id: MEMBER_PREFIX + id },
      UpdateExpression: 'SET #kind = :k, #gm = :gm, #g = :g',
      ExpressionAttributeNames: { '#kind': 'kind', '#gm': 'gmId', '#g': 'gameId' },
      ExpressionAttributeValues: { ':k': 'membership', ':gm': gmId, ':g': id },
    })))
  }

  getByGm(gmId: string, id: string) {
    return this.readGame(gmId, id)
  }

  async getForMember(userId: string, id: string) {
    const gmId = await this.pointer(userId, id)
    return gmId ? this.readGame(gmId, id) : null
  }

  async listFor(userId: string) {
    const rows: { id: string; gmId: string }[] = []
    let start: Record<string, unknown> | undefined
    do {
      const page = await guard(() => this.db.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
        ExpressionAttributeValues: { ':o': userId, ':p': MEMBER_PREFIX },
        ExpressionAttributeNames: { '#g': 'gameId', '#gm': 'gmId' },
        ProjectionExpression: '#g, #gm',
        ExclusiveStartKey: start,
      })))
      for (const it of page.Items ?? []) rows.push({ id: it.gameId as string, gmId: it.gmId as string })
      start = page.LastEvaluatedKey
    } while (start && rows.length < limits.maxGamesPerPlayer)
    const games = await Promise.all(rows.slice(0, limits.maxGamesPerPlayer).map(r => this.readGame(r.gmId, r.id)))
    return games.filter((g): g is GameRecord => g !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private async count(ownerId: string, prefix: string) {
    const res = await guard(() => this.db.send(new QueryCommand({
      TableName: this.table,
      KeyConditionExpression: 'ownerId = :o AND begins_with(id, :p)',
      ExpressionAttributeValues: { ':o': ownerId, ':p': prefix },
      Select: 'COUNT',
    })))
    return res.Count ?? 0
  }

  countOwned(gmId: string) {
    return this.count(gmId, GAME_PREFIX)
  }

  countJoined(userId: string) {
    return this.count(userId, MEMBER_PREFIX)
  }

  /** Reserve a name for this GM. Throws NameTaken if one of their other Games already holds it. */
  private async claimName(gmId: string, id: string, name: string) {
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: gmId, id: NAME_PREFIX + nameKey(name) },
        UpdateExpression: 'SET #kind = :k, #g = :g',
        // Free, or already this Game's own reservation (so re-saving an unchanged name is fine).
        ConditionExpression: 'attribute_not_exists(#id) OR #g = :g',
        ExpressionAttributeNames: { '#kind': 'kind', '#g': 'gameId', '#id': 'id' },
        ExpressionAttributeValues: { ':k': 'game-name', ':g': id },
      })))
    } catch (err) {
      if (isConditionFailure(err)) throw new NameTaken(name)
      throw err
    }
  }

  private async releaseName(gmId: string, name: string, id: string) {
    await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table,
      Key: { ownerId: gmId, id: NAME_PREFIX + nameKey(name) },
      // Never drop a reservation another Game has taken over.
      ConditionExpression: 'attribute_not_exists(#id) OR #g = :g',
      ExpressionAttributeNames: { '#g': 'gameId', '#id': 'id' },
      ExpressionAttributeValues: { ':g': id },
    }))).catch((err: unknown) => { if (!isConditionFailure(err)) throw err })
  }

  async save(gmId: string, id: string, draft: GameDraft) {
    // Claim the name first: a crash after this leaves a harmless spare reservation, where the reverse
    // order could hand the name to someone else mid-rename (ADR 0008).
    const previous = await this.readGame(gmId, id)
    await this.claimName(gmId, id, draft.name)

    const now = new Date().toISOString()
    // `listed` is handled separately below: on the item it is the index's string key, not the draft's boolean.
    const { listed, ...stored } = draft
    const { names, values, sets } = setExpression({ ...stored, kind: 'game', updatedAt: now })
    names['#createdAt'] = 'createdAt'
    names['#members'] = 'memberIds'
    values[':now'] = now
    values[':gm'] = new Set([gmId])
    sets.push('#createdAt = if_not_exists(#createdAt, :now)')
    // The sparse index key: present only while listed, so an unlisted Game is absent from the index.
    names['#listed'] = 'listed'
    const removes: string[] = []
    if (listed) {
      values[':listed'] = gameData.listedKey
      sets.push('#listed = :listed')
    } else {
      removes.push('#listed')
    }
    const res = await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId: gmId, id: GAME_PREFIX + id },
      UpdateExpression: `SET ${sets.join(', ')} ADD #members :gm${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })))
    // Renamed: let the old name go, now that the Game itself carries the new one.
    if (previous && nameKey(previous.name) !== nameKey(draft.name)) {
      await this.releaseName(gmId, previous.name, id)
    }
    await this.writePointer(gmId, id, gmId)
    await guard(() => this.db.send(new UpdateCommand({
      TableName: this.table,
      Key: { ownerId: GAME_LOOKUP_OWNER, id },
      UpdateExpression: 'SET #kind = :k, #gm = :gm',
      ExpressionAttributeNames: { '#kind': 'kind', '#gm': 'gmId' },
      ExpressionAttributeValues: { ':k': 'game-lookup', ':gm': gmId },
    })))
    return toGame(res.Attributes as Record<string, unknown>)
  }

  async delete(gmId: string, id: string) {
    const res = await guard(() => this.db.send(new DeleteCommand({
      TableName: this.table, Key: { ownerId: gmId, id: GAME_PREFIX + id }, ReturnValues: 'ALL_OLD',
    })))
    if (!res.Attributes) return false
    const gone = toGame(res.Attributes)
    // The Game is gone, so no one can read it. Now tidy the members' pointers and the lookup.
    for (const memberId of gone.memberIds) {
      await guard(() => this.db.send(new DeleteCommand({ TableName: this.table, Key: { ownerId: memberId, id: MEMBER_PREFIX + id } })))
    }
    await guard(() => this.db.send(new DeleteCommand({ TableName: this.table, Key: { ownerId: GAME_LOOKUP_OWNER, id } })))
    // Free the name so the GM can reuse it.
    await this.releaseName(gmId, gone.name, id)
    return true
  }

  /**
   * One page of listed public Games, newest activity first (VTTER-76). Reads the sparse index, so an
   * unlisted or private Game is not merely filtered out: it is not in the index at all.
   */
  async listPublic(cursor?: string, limit = limits.browsePageMax) {
    const after = cursor ? decodeCursor(cursor) : undefined
    const size = Math.min(Math.max(limit, 1), limits.browsePageMax)
    const page = await guard(() => this.db.send(new QueryCommand({
      TableName: this.table,
      IndexName: PUBLIC_INDEX,
      // Descending, so "the next page" is everything that sorts before the last row we showed.
      KeyConditionExpression: after ? '#l = :l AND #u < :after' : '#l = :l',
      ExpressionAttributeNames: { '#l': 'listed', ...(after ? { '#u': 'updatedAt' } : {}) },
      ExpressionAttributeValues: { ':l': gameData.listedKey, ...(after ? { ':after': after } : {}) },
      ScanIndexForward: false, // newest updatedAt first
      Limit: size,
    })))
    const games = (page.Items ?? []).map(it => toGame(it as Record<string, unknown>))
    // Only offer a cursor when the page was full: a short page is the end of the list.
    const last = games.length === size ? games[games.length - 1] : undefined
    return { games, cursor: last ? encodeCursor({ updatedAt: last.updatedAt }) : null }
  }

  async gmOf(gameId: string) {
    const res = await guard(() => this.db.send(new GetCommand({
      TableName: this.table, Key: { ownerId: GAME_LOOKUP_OWNER, id: gameId }, ConsistentRead: true,
    })))
    return (res.Item?.gmId as string | undefined) ?? null
  }

  async addMember(gmId: string, id: string, userId: string) {
    let updated
    try {
      updated = await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: gmId, id: GAME_PREFIX + id },
        UpdateExpression: 'ADD #members :u',
        // The Game must exist, and have room unless this user is already in it.
        ConditionExpression: 'attribute_exists(#id) AND (contains(#members, :one) OR size(#members) < :max)',
        ExpressionAttributeNames: { '#members': 'memberIds', '#id': 'id' },
        ExpressionAttributeValues: { ':u': new Set([userId]), ':one': userId, ':max': limits.maxMembers },
        ReturnValues: 'ALL_NEW',
      })))
    } catch (err) {
      if (isConditionFailure(err)) return null
      throw err
    }
    await this.writePointer(userId, id, gmId)
    return toGame(updated.Attributes as Record<string, unknown>)
  }

  async heroesOf(gameId: string, memberIds: string[]) {
    const pairs = await Promise.all(memberIds.map(async memberId => {
      const res = await guard(() => this.db.send(new GetCommand({
        TableName: this.table,
        Key: { ownerId: memberId, id: MEMBER_PREFIX + gameId },
        ProjectionExpression: '#h',
        ExpressionAttributeNames: { '#h': 'heroId' },
        ConsistentRead: true,
      })))
      return [memberId, res.Item?.heroId as string | undefined] as const
    }))
    return Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p[1]))
  }

  async setHero(userId: string, gameId: string, heroId: string | null) {
    // Writes only the caller's own pointer, and only if they are still a member.
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: userId, id: MEMBER_PREFIX + gameId },
        UpdateExpression: heroId ? 'SET #h = :h' : 'REMOVE #h',
        ConditionExpression: 'attribute_exists(#id)',
        ExpressionAttributeNames: { '#h': 'heroId', '#id': 'id' },
        ...(heroId ? { ExpressionAttributeValues: { ':h': heroId } } : {}),
      })))
    } catch (err) {
      // They were removed from the Game between the membership check and this write: nothing to set.
      if (!isConditionFailure(err)) throw err
    }
  }

  async removeMember(gmId: string, id: string, userId: string) {
    // Remove the pointer first: that is what revokes access. Then drop them from the roster.
    await guard(() => this.db.send(new DeleteCommand({ TableName: this.table, Key: { ownerId: userId, id: MEMBER_PREFIX + id } })))
    try {
      await guard(() => this.db.send(new UpdateCommand({
        TableName: this.table,
        Key: { ownerId: gmId, id: GAME_PREFIX + id },
        UpdateExpression: 'DELETE #members :u',
        ConditionExpression: 'attribute_exists(#id)',
        ExpressionAttributeNames: { '#members': 'memberIds', '#id': 'id' },
        ExpressionAttributeValues: { ':u': new Set([userId]) },
      })))
    } catch (err) {
      if (!isConditionFailure(err)) throw err
    }
  }
}

/** Strip the storage prefix and `kind`, and turn the DynamoDB string set into an array. */
function toGame(item: Record<string, unknown>): GameRecord {
  const { kind: _kind, memberIds, id, ...rest } = item as Record<string, unknown> & { id: string; memberIds?: Iterable<string> }
  return { ...(rest as Omit<GameRecord, 'id' | 'memberIds'>), id: id.slice(GAME_PREFIX.length), memberIds: [...(memberIds ?? [])] }
}
