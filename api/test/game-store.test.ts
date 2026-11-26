import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DynamoGameStore } from '../src/game-store.ts'
import { DynamoProfileStore } from '../src/store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const games = new DynamoGameStore(doc, 'heroes')
const GM = 'gm-1'
const ANA = 'ana-1'
const G = '11111111-1111-4111-8111-111111111111'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })
const draft = { name: 'Friday', adventure: { source: 'builtin' as const, id: 'soot-kings-hearth' }, visibility: 'private' as const, solo: false, listed: false }
const stored = (members: string[]) => ({
  ...draft, kind: 'game', ownerId: GM, id: `game#${G}`, memberIds: new Set(members), createdAt: 'c', updatedAt: 'u',
})

beforeEach(() => ddb.reset())

describe('DynamoGameStore', () => {
  it('saves under game#, always adds the GM, and writes the member pointer and the lookup', async () => {
    // save() reads the Game first to see whether the name changed (ADR 0008). No previous item here:
    // this is a brand-new Game, so nothing to release.
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand).resolves({ Attributes: stored([GM]) })
    const saved = await games.save(GM, G, draft)
    expect(saved).toMatchObject({ id: G, memberIds: [GM], name: 'Friday' })
    expect(saved).not.toHaveProperty('kind')

    // The name claim writes first (ADR 0008), so it leads the UpdateCommand calls.
    const [claim, game, pointer, lookup] = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
    expect(claim.Key).toEqual({ ownerId: GM, id: 'name#friday' })
    // Only takes the name if it is free, or already this Game's.
    expect(claim.ConditionExpression).toBeTruthy()
    expect(game.Key).toEqual({ ownerId: GM, id: `game#${G}` })
    expect(game.UpdateExpression).toContain('ADD #members :gm')
    expect(game.UpdateExpression).toContain('#createdAt = if_not_exists(#createdAt, :now)')
    expect(game.ExpressionAttributeValues?.[':gm']).toEqual(new Set([GM]))
    expect(pointer.Key).toEqual({ ownerId: GM, id: `gm#${G}` })
    expect(pointer.ExpressionAttributeValues?.[':gm']).toBe(GM)
    expect(lookup.Key).toEqual({ ownerId: '_game', id: G })
  })

  it('reads a Game through the member pointer, and not at all without one', async () => {
    ddb.on(GetCommand)
      .resolvesOnce({}) // no pointer
      .resolvesOnce({ Item: { gmId: GM } }) // pointer
      .resolvesOnce({ Item: stored([GM, ANA]) }) // the game
    expect(await games.getForMember(ANA, G)).toBeNull()
    expect(ddb.commandCalls(GetCommand)).toHaveLength(1) // never touched the Game
    const got = await games.getForMember(ANA, G)
    expect(got?.memberIds).toEqual([GM, ANA])
    const [, pointerRead, gameRead] = ddb.commandCalls(GetCommand).map(c => c.args[0].input)
    expect(pointerRead).toMatchObject({ Key: { ownerId: ANA, id: `gm#${G}` }, ConsistentRead: true })
    expect(gameRead).toMatchObject({ Key: { ownerId: GM, id: `game#${G}` }, ConsistentRead: true })
  })

  it('lists a member\'s Games via their pointers, newest first, skipping stale ones', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ gameId: 'a', gmId: GM }, { gameId: 'b', gmId: GM }, { gameId: 'gone', gmId: GM }] })
    // One BatchGetItem for all three pointers, not three GetItems. A pointer to a deleted Game is
    // simply absent from the response, which is how a stale pointer drops out of the list.
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        heroes: [
          { ...stored([GM]), id: 'game#a', updatedAt: '2026-01-01' },
          { ...stored([GM]), id: 'game#b', updatedAt: '2026-06-01' },
        ],
      },
    })
    expect((await games.listFor(ANA)).map(g => g.id)).toEqual(['b', 'a'])
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({ ':o': ANA, ':p': 'gm#' })
    const batch = ddb.commandCalls(BatchGetCommand)
    expect(batch).toHaveLength(1)
    expect(batch[0].args[0].input.RequestItems?.heroes).toMatchObject({
      Keys: [
        { ownerId: GM, id: 'game#a' },
        { ownerId: GM, id: 'game#b' },
        { ownerId: GM, id: 'game#gone' },
      ],
      // A Game you just created or renamed must be in your list straight away.
      ConsistentRead: true,
    })
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
  })

  it('retries the keys a batch leaves unprocessed rather than dropping those Games', async () => {
    // DynamoDB may return fewer items than asked for and name the rest in UnprocessedKeys. Dropping
    // one would read as "that Game is gone", so they are retried.
    ddb.on(QueryCommand).resolves({ Items: [{ gameId: 'a', gmId: GM }, { gameId: 'b', gmId: GM }] })
    ddb.on(BatchGetCommand)
      .resolvesOnce({
        Responses: { heroes: [{ ...stored([GM]), id: 'game#a', updatedAt: '2026-01-01' }] },
        UnprocessedKeys: { heroes: { Keys: [{ ownerId: GM, id: 'game#b' }] } },
      })
      .resolvesOnce({ Responses: { heroes: [{ ...stored([GM]), id: 'game#b', updatedAt: '2026-06-01' }] } })
    expect((await games.listFor(ANA)).map(g => g.id)).toEqual(['b', 'a'])
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(2)
  })

  it('counts with a COUNT query', async () => {
    ddb.on(QueryCommand).resolves({ Count: 3 })
    expect(await games.countOwned(GM)).toBe(3)
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({ Select: 'COUNT', ExpressionAttributeValues: { ':p': 'game#' } })
  })

  it('adds a member only if the Game exists and has room, and then writes their pointer', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: stored([GM, ANA]) })
    const joined = await games.addMember(GM, G, ANA)
    expect(joined?.memberIds).toEqual([GM, ANA])
    const [roster, pointer] = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
    expect(roster.ConditionExpression).toBe('attribute_exists(#id) AND (contains(#members, :one) OR size(#members) < :max)')
    expect(roster.ExpressionAttributeValues).toMatchObject({ ':u': new Set([ANA]), ':one': ANA, ':max': 20 })
    expect(pointer.Key).toEqual({ ownerId: ANA, id: `gm#${G}` })
  })

  it('returns null, and writes no pointer, when the Game is full or gone', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed())
    expect(await games.addMember(GM, G, ANA)).toBeNull()
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(1)
  })

  it('removes the pointer first, then the roster entry, and ignores a Game that is already gone', async () => {
    ddb.on(DeleteCommand).resolves({})
    ddb.on(UpdateCommand).rejects(conditionFailed())
    await games.removeMember(GM, G, ANA)
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ ownerId: ANA, id: `gm#${G}` })
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toBe('DELETE #members :u')
  })

  it('deletes the Game first, then every member pointer and the lookup', async () => {
    ddb.on(DeleteCommand).resolves({ Attributes: stored([GM, ANA]) })
    expect(await games.delete(GM, G)).toBe(true)
    const keys = ddb.commandCalls(DeleteCommand).map(c => c.args[0].input.Key)
    expect(keys).toEqual([
      { ownerId: GM, id: `game#${G}` },
      { ownerId: GM, id: `gm#${G}` },
      { ownerId: ANA, id: `gm#${G}` },
      { ownerId: '_game', id: G },
      // The name reservation goes last, so a crash mid-delete never frees a name whose Game still exists.
      { ownerId: GM, id: 'name#friday' },
    ])
  })

  it('reports false when there was no Game to delete', async () => {
    ddb.on(DeleteCommand).resolves({})
    expect(await games.delete(GM, G)).toBe(false)
    expect(ddb.commandCalls(DeleteCommand)).toHaveLength(1)
  })

  it('finds the GM from the Game id', async () => {
    ddb.on(GetCommand).resolvesOnce({ Item: { gmId: GM } }).resolvesOnce({})
    expect(await games.gmOf(G)).toBe(GM)
    expect(await games.gmOf(G)).toBeNull()
    expect(ddb.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({ ownerId: '_game', id: G })
  })

  // VTTER-77: the hero rides on the member's own pointer item.
  it('reads each member hero from their pointer, skipping members who brought none', async () => {
    // One request for the whole roster. ownerId is projected so each row maps back to its member:
    // a batch response is unordered, so position cannot be relied on.
    ddb.on(BatchGetCommand).resolves({
      Responses: { heroes: [{ ownerId: ANA }, { ownerId: GM, heroId: 'hero-gm' }] },
    })
    expect(await games.heroesOf(G, [GM, ANA])).toEqual({ [GM]: 'hero-gm' })
    const input = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems?.heroes
    expect(input).toMatchObject({
      Keys: [{ ownerId: GM, id: `gm#${G}` }, { ownerId: ANA, id: `gm#${G}` }],
      // A hero you just brought to the table must show on the next read.
      ConsistentRead: true,
    })
    expect(input?.ProjectionExpression).toBe('#o, #h')
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
  })

  it('reads no pointers at all for an empty roster', async () => {
    expect(await games.heroesOf(G, [])).toEqual({})
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(0)
  })

  it("sets and clears the caller's own hero, and only if they are still a member", async () => {
    ddb.on(UpdateCommand).resolves({})
    await games.setHero(ANA, G, 'hero-1')
    const set = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(set.Key).toEqual({ ownerId: ANA, id: `gm#${G}` })
    expect(set.UpdateExpression).toBe('SET #h = :h')
    expect(set.ConditionExpression).toBe('attribute_exists(#id)')
    expect(set.ExpressionAttributeValues?.[':h']).toBe('hero-1')

    ddb.reset()
    ddb.on(UpdateCommand).resolves({})
    await games.setHero(ANA, G, null)
    const cleared = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(cleared.UpdateExpression).toBe('REMOVE #h')
    expect(cleared.ExpressionAttributeValues).toBeUndefined()

    // Removed from the Game in the meantime: no throw, nothing written.
    ddb.reset()
    ddb.on(UpdateCommand).rejects(conditionFailed())
    await expect(games.setHero(ANA, G, 'hero-1')).resolves.toBeUndefined()
  })

  it('drops the hero when a member is removed, because the pointer goes', async () => {
    ddb.on(DeleteCommand).resolves({})
    ddb.on(UpdateCommand).resolves({})
    await games.removeMember(GM, G, ANA)
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ ownerId: ANA, id: `gm#${G}` })
  })
})

describe('DynamoProfileStore: player lookups for Games', () => {
  const profiles = new DynamoProfileStore(doc, 'heroes')

  it('resolves a player ID to its owner, or null', async () => {
    ddb.on(GetCommand).resolvesOnce({ Item: { owner: ANA } }).resolvesOnce({})
    expect(await profiles.ownerOfPlayer('EMBER-AAAAA')).toBe(ANA)
    expect(await profiles.ownerOfPlayer('EMBER-BBBBB')).toBeNull()
    expect(ddb.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({ ownerId: '_player', id: 'EMBER-AAAAA' })
  })

  it('peeks without creating a profile', async () => {
    ddb.on(GetCommand).resolves({})
    expect(await profiles.peek(ANA)).toBeNull()
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0)
  })
})
