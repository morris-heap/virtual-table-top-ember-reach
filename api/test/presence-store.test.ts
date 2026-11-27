import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DatabaseUnavailable } from '../src/handler.ts'
import { DynamoPresenceStore } from '../src/presence-store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const presence = new DynamoPresenceStore(doc, 'heroes')

beforeEach(() => ddb.reset())

describe('DynamoPresenceStore', () => {
  it("writes only the caller's own presence item, keyed <kind>#<id> with a kind", async () => {
    ddb.on(UpdateCommand).resolves({})
    await presence.beat('me', 'g1', 1234)
    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(input.Key).toEqual({ ownerId: 'me', id: 'presence#current' })
    expect(input.ExpressionAttributeValues).toMatchObject({ ':k': 'presence', ':g': 'g1', ':t': 1234 })
  })

  it('reads many players with one BatchGetItem and leaves out anyone never seen', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { heroes: [{ ownerId: 'a', gameId: 'g1', seenAt: 99 }] } })
    expect(await presence.presenceOf(['a', 'b'])).toEqual({ a: { gameId: 'g1', seenAt: 99 } })
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(1)
  })

  it('caps a batch at 100 keys', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { heroes: [] } })
    await presence.presenceOf(Array.from({ length: 101 }, (_, i) => `u${i}`))
    expect(ddb.commandCalls(BatchGetCommand).map(c => (c.args[0].input.RequestItems!.heroes.Keys ?? []).length)).toEqual([100, 1])
  })

  it('gives up with DatabaseUnavailable when keys stay unprocessed', async () => {
    ddb.on(BatchGetCommand).resolves({ UnprocessedKeys: { heroes: { Keys: [{ ownerId: 'a', id: 'presence#current' }] } } })
    await expect(presence.presenceOf(['a'])).rejects.toBeInstanceOf(DatabaseUnavailable)
  })
})
