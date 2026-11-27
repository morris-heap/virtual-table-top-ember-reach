import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DynamoFriendStore } from '../src/friend-store.ts'
import { DynamoPresenceStore, PRESENCE_ID } from '../src/presence-store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const presence = new DynamoPresenceStore(doc, 'vtter-game')
const friends = new DynamoFriendStore(doc, 'vtter-game')
const ANA = 'ana-1'
const BEN = 'ben-1'
const CAL = 'cal-1'
const G1 = '11111111-1111-4111-8111-111111111111'

beforeEach(() => ddb.reset())

describe('DynamoPresenceStore', () => {
  it("overwrites the caller's one presence item, with a kind, and nothing else", async () => {
    ddb.on(UpdateCommand).resolves({})
    await presence.beat(ANA, G1, 1_700_000_000_000)
    const calls = ddb.commandCalls(UpdateCommand)
    expect(calls).toHaveLength(1)
    const input = calls[0].args[0].input
    expect(input.Key).toEqual({ ownerId: ANA, id: PRESENCE_ID })
    expect(PRESENCE_ID).toBe('presence#current')
    expect(input.ExpressionAttributeValues).toEqual({ ':k': 'presence', ':g': G1, ':t': 1_700_000_000_000 })
  })

  it('stores an empty gameId when the player is not on a Game page', async () => {
    ddb.on(UpdateCommand).resolves({})
    await presence.beat(ANA, null, 1_700_000_000_000)
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({ ':k': 'presence', ':g': '', ':t': 1_700_000_000_000 })
  })

  it('reads many players in one BatchGetItem, strongly consistent, never a GetItem each', async () => {
    ddb.on(BatchGetCommand).resolves({
      Responses: { 'vtter-game': [{ ownerId: BEN, gameId: G1, seenAt: 1_700_000_000_000 }] },
    })
    const seen = await presence.presenceOf([BEN, CAL])
    expect(seen).toEqual({ [BEN]: { gameId: G1, seenAt: 1_700_000_000_000 } }) // CAL never sent a beat: absent
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(1)
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
    const req = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems?.['vtter-game']
    expect(req?.Keys).toEqual([{ ownerId: BEN, id: PRESENCE_ID }, { ownerId: CAL, id: PRESENCE_ID }])
    expect(req?.ConsistentRead).toBe(true)
  })

  it('splits more than 100 players into more than one request', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { 'vtter-game': [] } })
    await presence.presenceOf(Array.from({ length: 101 }, (_, i) => `u${i}`))
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(2)
  })
})

describe('DynamoFriendStore.mutualWith', () => {
  it("returns only the friends who have the caller accepted on THEIR side, in one BatchGetItem", async () => {
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        'vtter-game': [
          { ownerId: BEN, status: 'accepted' },
          { ownerId: CAL, status: 'incoming' }, // not a friend any more on their side
        ],
      },
    })
    expect(await friends.mutualWith(ANA, [BEN, CAL, 'gone-1'])).toEqual([BEN])
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(1)
    const keys = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems?.['vtter-game'].Keys
    expect(keys).toEqual([
      { ownerId: BEN, id: `friend#${ANA}` }, { ownerId: CAL, id: `friend#${ANA}` }, { ownerId: 'gone-1', id: `friend#${ANA}` },
    ])
  })
})
