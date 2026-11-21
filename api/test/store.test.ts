import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DatabaseUnavailable } from '../src/handler.ts'
import { parseSheet } from '../src/sheet.ts'
import { DynamoCharacterStore } from '../src/store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const store = new DynamoCharacterStore(doc, 'heroes')
const A = '11111111-1111-4111-8111-111111111111'
const HERO = '33333333-3333-4333-8333-333333333333'

beforeEach(() => ddb.reset())

describe('DynamoCharacterStore', () => {
  it('saves the whole sheet as one item keyed by owner and id, keeping createdAt', async () => {
    const sheet = parseSheet({ name: 'Kestrel', skills: { Arcana: 2 }, wounds: ['Grace'] })
    ddb.on(UpdateCommand).resolves({ Attributes: { ...sheet, ownerId: A, id: HERO } })
    const saved = await store.save(A, HERO, sheet)
    expect(saved).toMatchObject({ name: 'Kestrel', ownerId: A, id: HERO })

    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(input.TableName).toBe('heroes')
    expect(input.Key).toEqual({ ownerId: A, id: HERO })
    expect(input.ReturnValues).toBe('ALL_NEW')
    expect(input.UpdateExpression).toContain('#createdAt = if_not_exists(#createdAt, :now)')
    // Lists and maps go in as native values, not JSON strings.
    expect(input.ExpressionAttributeValues?.[':skills']).toEqual({ Arcana: 2 })
    expect(input.ExpressionAttributeValues?.[':wounds']).toEqual(['Grace'])
    // Reserved words like "name" and "level" are aliased.
    expect(input.ExpressionAttributeNames?.['#name']).toBe('name')
    expect(input.ExpressionAttributeNames?.['#level']).toBe('level')
  })

  it('reads with a consistent read and returns null when missing', async () => {
    ddb.on(GetCommand).resolves({})
    expect(await store.get(A, HERO)).toBeNull()
    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({ Key: { ownerId: A, id: HERO }, ConsistentRead: true })
  })

  it('lists every page for the owner, newest first, as summaries', async () => {
    ddb.on(QueryCommand)
      .resolvesOnce({ Items: [{ id: '1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' }], LastEvaluatedKey: { ownerId: A, id: '1' } })
      .resolvesOnce({ Items: [{ id: '2', name: 'New', updatedAt: '2026-06-01T00:00:00Z' }] })
    const list = await store.list(A)
    expect(list.map(c => c.name)).toEqual(['New', 'Old'])
    const calls = ddb.commandCalls(QueryCommand)
    expect(calls).toHaveLength(2)
    expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({ ':o': A })
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual({ ownerId: A, id: '1' })
  })

  it('reports whether a delete removed anything', async () => {
    ddb.on(DeleteCommand).resolvesOnce({ Attributes: { id: HERO } }).resolvesOnce({})
    expect(await store.delete(A, HERO)).toBe(true)
    expect(await store.delete(A, HERO)).toBe(false)
  })

  it('turns throttling into DatabaseUnavailable and rethrows other errors', async () => {
    ddb.on(GetCommand)
      .rejectsOnce(Object.assign(new Error('slow down'), { name: 'ThrottlingException' }))
      .rejectsOnce(Object.assign(new Error('no'), { name: 'AccessDeniedException' }))
    await expect(store.ping()).rejects.toBeInstanceOf(DatabaseUnavailable)
    await expect(store.ping()).rejects.toThrow('no')
  })
})
