import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { MapLimitReached } from '../src/handler.ts'
import { parseMap } from '../src/map.ts'
import { DynamoMapStore } from '../src/map-store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const maps = new DynamoMapStore(doc, 'vtter-game', 3)
const A = '11111111-1111-4111-8111-111111111111'
const MAP = '55555555-5555-4555-8555-555555555555'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })
const draft = parseMap({
  name: 'Forge corridor', size: 'small', width: 30, height: 30,
  objects: [{ id: 'o1', kind: 'enclosure', type: 'cavern', at: [0, 900] }, { id: 'o2', kind: 'space', type: 'mud', on: 'o1', at: [5, 3] }],
})
const stored = { ...draft, kind: 'map', ownerId: A, id: `map#${MAP}`, createdAt: 'c', updatedAt: 'u' }

/** The UpdateCommands sent, by the item they touched. */
const updates = () => ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
const isCounter = (i: { Key?: Record<string, unknown> }) => i.Key?.id === 'count#map'

beforeEach(() => ddb.reset())

describe('DynamoMapStore', () => {
  it('replaces an existing map in one conditional write, without touching the counter', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: stored })
    const saved = await maps.save(A, MAP, draft)
    expect(saved).toMatchObject({ id: MAP, name: 'Forge corridor', schemaVersion: 1 })
    expect(saved).not.toHaveProperty('ownerId')
    expect(saved).not.toHaveProperty('kind')
    const [input] = updates()
    expect(updates()).toHaveLength(1)
    expect(input.Key).toEqual({ ownerId: A, id: `map#${MAP}` })
    expect(input.ConditionExpression).toBe('attribute_exists(#id)')
    expect(input.ExpressionAttributeValues?.[':kind']).toBe('map')
    expect(input.ExpressionAttributeValues?.[':objects']).toEqual(draft.objects) // a native list, not JSON text
  })

  it('creates a new map by claiming a slot below the cap first', async () => {
    ddb.on(UpdateCommand)
      .rejectsOnce(conditionFailed()) // not there yet
      .resolvesOnce({}) // counter bump
      .resolvesOnce({ Attributes: stored }) // create
    await maps.save(A, MAP, draft)
    const [, bump, create] = updates()
    expect(isCounter(bump)).toBe(true)
    expect(bump.ConditionExpression).toBe('attribute_not_exists(#n) OR #n < :cap')
    expect(bump.ExpressionAttributeValues).toMatchObject({ ':cap': 3, ':one': 1, ':k': 'count' })
    expect(create.ConditionExpression).toBe('attribute_not_exists(#id)')
  })

  it('refuses a new map at the cap when the real count agrees', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed())
    ddb.on(QueryCommand).resolves({ Count: 3 })
    await expect(maps.save(A, MAP, draft)).rejects.toThrow(MapLimitReached)
    const q = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(q).toMatchObject({ Select: 'COUNT', ConsistentRead: true, ExpressionAttributeValues: { ':o': A, ':p': 'map#' } })
  })

  it('repairs a counter left too high, then creates the map', async () => {
    ddb.on(UpdateCommand)
      .rejectsOnce(conditionFailed()) // not there yet
      .rejectsOnce(conditionFailed()) // counter says full
      .resolvesOnce({}) // counter reset to the real count
      .resolvesOnce({}) // bump
      .resolvesOnce({ Attributes: stored }) // create
    ddb.on(QueryCommand).resolves({ Count: 1 })
    await maps.save(A, MAP, draft)
    const reset = updates()[2]
    expect(isCounter(reset)).toBe(true)
    expect(reset.ExpressionAttributeValues).toMatchObject({ ':n': 1 })
  })

  it('gives the slot back if the create fails', async () => {
    ddb.on(UpdateCommand)
      .rejectsOnce(conditionFailed())
      .resolvesOnce({})
      .rejectsOnce(Object.assign(new Error('no'), { name: 'AccessDeniedException' }))
      .resolvesOnce({})
    await expect(maps.save(A, MAP, draft)).rejects.toThrow('no')
    const release = updates()[3]
    expect(isCounter(release)).toBe(true)
    expect(release.ExpressionAttributeValues).toMatchObject({ ':minus': -1 })
  })

  it('reads with a consistent read and hides the prefix, kind and owner', async () => {
    ddb.on(GetCommand).resolvesOnce({}).resolvesOnce({ Item: stored })
    expect(await maps.get(A, MAP)).toBeNull()
    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({ Key: { ownerId: A, id: `map#${MAP}` }, ConsistentRead: true })
    const got = await maps.get(A, MAP)
    expect(got).toMatchObject({ id: MAP, objects: draft.objects })
    expect(JSON.stringify(got)).not.toContain(A)
  })

  it('lists only map# items, newest first, with bare ids and no objects', async () => {
    ddb.on(QueryCommand).resolves({ Items: [
      { id: 'map#1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'map#2', name: 'New', updatedAt: '2026-06-01T00:00:00Z' },
    ] })
    expect((await maps.list(A)).map(m => [m.id, m.name])).toEqual([['2', 'New'], ['1', 'Old']])
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toBe('ownerId = :o AND begins_with(id, :p)')
    expect(input.ProjectionExpression).not.toContain('objects')
  })

  it('frees a slot only when a delete removed a map', async () => {
    ddb.on(DeleteCommand).resolvesOnce({ Attributes: { id: `map#${MAP}` } }).resolvesOnce({})
    ddb.on(UpdateCommand).resolves({})
    expect(await maps.delete(A, MAP)).toBe(true)
    expect(await maps.delete(A, MAP)).toBe(false)
    expect(updates()).toHaveLength(1)
    expect(updates()[0]).toMatchObject({ ConditionExpression: '#n > :zero', ExpressionAttributeValues: { ':minus': -1, ':zero': 0 } })
  })
})
