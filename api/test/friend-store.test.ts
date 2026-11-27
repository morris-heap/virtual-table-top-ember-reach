import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DynamoFriendStore } from '../src/friend-store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const friends = new DynamoFriendStore(doc, 'vtter-game')
const ANA = 'ana-1'
const BEN = 'ben-1'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })

beforeEach(() => ddb.reset())

describe('DynamoFriendStore', () => {
  it('lists my side with a prefix range read (no filter) and strips the prefix', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ id: `friend#${BEN}`, status: 'accepted' }] })
    expect(await friends.list(ANA)).toEqual([{ userId: BEN, status: 'accepted' }])
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toBe('ownerId = :o AND begins_with(id, :p)')
    expect(input.ExpressionAttributeValues).toEqual({ ':o': ANA, ':p': 'friend#' })
    expect(input.FilterExpression).toBeUndefined()
  })

  it('writes both sides of a request: outgoing for me first, incoming for them', async () => {
    ddb.on(UpdateCommand).resolves({})
    await friends.request(ANA, BEN)
    const [mine, theirs] = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
    expect(mine.Key).toEqual({ ownerId: ANA, id: `friend#${BEN}` })
    expect(mine.ExpressionAttributeValues).toMatchObject({ ':k': 'friend', ':s': 'outgoing' })
    expect(theirs.Key).toEqual({ ownerId: BEN, id: `friend#${ANA}` })
    expect(theirs.ExpressionAttributeValues).toMatchObject({ ':k': 'friend', ':s': 'incoming' })
  })

  it('never downgrades an accepted side, and treats that condition failure as a no-op', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed())
    await expect(friends.request(ANA, BEN)).resolves.toBeUndefined()
    const { ConditionExpression } = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(ConditionExpression).toContain('attribute_not_exists')
  })

  it('accepts by marking both sides accepted, unconditionally', async () => {
    ddb.on(UpdateCommand).resolves({})
    await friends.accept(ANA, BEN)
    const calls = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
    expect(calls.map(c => c.Key)).toEqual([
      { ownerId: ANA, id: `friend#${BEN}` }, { ownerId: BEN, id: `friend#${ANA}` },
    ])
    for (const c of calls) {
      expect(c.ExpressionAttributeValues?.[':s']).toBe('accepted')
      expect(c.ConditionExpression).toBeUndefined()
    }
  })

  it('removes both sides', async () => {
    ddb.on(DeleteCommand).resolves({})
    await friends.remove(ANA, BEN)
    expect(ddb.commandCalls(DeleteCommand).map(c => c.args[0].input.Key)).toEqual([
      { ownerId: ANA, id: `friend#${BEN}` }, { ownerId: BEN, id: `friend#${ANA}` },
    ])
  })

  it('counts two people as friends only when BOTH sides are accepted, read consistently', async () => {
    ddb.on(GetCommand)
      .resolvesOnce({ Item: { id: `friend#${BEN}`, status: 'accepted' } })
      .resolvesOnce({ Item: { id: `friend#${ANA}`, status: 'accepted' } })
    expect(await friends.areFriends(ANA, BEN)).toBe(true)
    for (const c of ddb.commandCalls(GetCommand)) expect(c.args[0].input.ConsistentRead).toBe(true)

    ddb.reset()
    ddb.on(GetCommand)
      .resolvesOnce({ Item: { id: `friend#${BEN}`, status: 'accepted' } })
      .resolvesOnce({}) // the other side is gone
    expect(await friends.areFriends(ANA, BEN)).toBe(false)

    ddb.reset()
    ddb.on(GetCommand)
      .resolvesOnce({ Item: { id: `friend#${BEN}`, status: 'incoming' } })
      .resolvesOnce({ Item: { id: `friend#${ANA}`, status: 'outgoing' } })
    expect(await friends.areFriends(ANA, BEN)).toBe(false)
  })

  it('reads many profiles in one BatchGetItem and returns only the public fields', async () => {
    ddb.on(BatchGetCommand).resolves({
      Responses: { 'vtter-game': [{ ownerId: BEN, playerId: 'EMBER-AAAAB', displayName: 'Ben' }] },
    })
    const who = await friends.identities([BEN, 'gone-1'])
    expect(who).toEqual({ [BEN]: { playerId: 'EMBER-AAAAB', displayName: 'Ben' } })
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(1)
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
    const keys = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems?.['vtter-game'].Keys
    expect(keys).toEqual([{ ownerId: BEN, id: 'profile' }, { ownerId: 'gone-1', id: 'profile' }])
  })
})
