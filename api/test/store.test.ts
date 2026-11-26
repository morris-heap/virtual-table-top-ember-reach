import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DatabaseUnavailable } from '../src/handler.ts'
import { parseAdventure } from '../src/adventure.ts'
import { parseSheet } from '../src/sheet.ts'
import { DynamoAdventureStore, DynamoCharacterStore, DynamoProfileStore } from '../src/store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const store = new DynamoCharacterStore(doc, 'heroes')
const A = '11111111-1111-4111-8111-111111111111'
const HERO = '33333333-3333-4333-8333-333333333333'
const ADV = '44444444-4444-4444-8444-444444444444'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })

beforeEach(() => ddb.reset())

describe('DynamoCharacterStore', () => {
  it('saves the whole sheet as one item keyed by owner and id, keeping createdAt', async () => {
    const sheet = parseSheet({ name: 'Kestrel', skills: { Arcana: 2 }, wounds: ['Grace'] })
    ddb.on(UpdateCommand).resolves({ Attributes: { ...sheet, kind: 'hero', ownerId: A, id: `hero#${HERO}` } })
    const saved = await store.save(A, HERO, sheet)
    // Stored under `hero#<uuid>` with a `kind`, but what comes back out is the bare UUID and no `kind`:
    // the prefix is storage, and the app, member pointers and portrait keys all use the bare id.
    expect(saved).toMatchObject({ name: 'Kestrel', ownerId: A, id: HERO })
    expect(saved).not.toHaveProperty('kind')

    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(input.TableName).toBe('heroes')
    expect(input.Key).toEqual({ ownerId: A, id: `hero#${HERO}` })
    expect(input.ExpressionAttributeValues?.[':kind']).toBe('hero')
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
    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({ Key: { ownerId: A, id: `hero#${HERO}` }, ConsistentRead: true })
  })

  it('lists every page for the owner, newest first, as summaries', async () => {
    ddb.on(QueryCommand)
      .resolvesOnce({ Items: [{ id: 'hero#1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' }], LastEvaluatedKey: { ownerId: A, id: 'hero#1' } })
      .resolvesOnce({ Items: [{ id: 'hero#2', name: 'New', updatedAt: '2026-06-01T00:00:00Z' }] })
    const list = await store.list(A)
    expect(list.map(c => c.name)).toEqual(['New', 'Old'])
    // Summaries carry the bare id, so a list row links straight to /heroes/<uuid>.
    expect(list.map(c => c.id)).toEqual(['2', '1'])
    const calls = ddb.commandCalls(QueryCommand)
    expect(calls).toHaveLength(2)
    expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({ ':o': A, ':p': 'hero#' })
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual({ ownerId: A, id: 'hero#1' })
  })

  it('lists heroes with a range read on the prefix, never a filter over the whole partition', async () => {
    // The profile, adventures, Games and member pointers share this partition. Before VTTER-98 the list
    // read them all and filtered on the absence of `kind`, paying for every item it discarded.
    ddb.on(QueryCommand).resolves({ Items: [] })
    await store.list(A)
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toBe('ownerId = :o AND begins_with(id, :p)')
    expect(input.FilterExpression).toBeUndefined()
  })

  it('reports whether a delete removed anything', async () => {
    ddb.on(DeleteCommand).resolvesOnce({ Attributes: { id: `hero#${HERO}` } }).resolvesOnce({})
    expect(await store.delete(A, HERO)).toBe(true)
    expect(await store.delete(A, HERO)).toBe(false)
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ ownerId: A, id: `hero#${HERO}` })
  })

  it('turns throttling into DatabaseUnavailable and rethrows other errors', async () => {
    ddb.on(GetCommand)
      .rejectsOnce(Object.assign(new Error('slow down'), { name: 'ThrottlingException' }))
      .rejectsOnce(Object.assign(new Error('no'), { name: 'AccessDeniedException' }))
    await expect(store.ping()).rejects.toBeInstanceOf(DatabaseUnavailable)
    await expect(store.ping()).rejects.toThrow('no')
  })
})

describe('DynamoAdventureStore', () => {
  const adventures = new DynamoAdventureStore(doc, 'heroes')

  it('saves under an adv# sort key with a kind marker, and returns the plain id', async () => {
    const draft = parseAdventure({ title: 'The Cold Hearth', scenes: [{ id: 'a', title: 'A', type: 'social' }] })
    ddb.on(UpdateCommand).resolves({ Attributes: { ...draft, kind: 'adventure', ownerId: A, id: `adv#${ADV}`, createdAt: 'c', updatedAt: 'u' } })
    const saved = await adventures.save(A, ADV, draft)
    expect(saved.id).toBe(ADV)
    expect(saved).not.toHaveProperty('kind')

    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(input.Key).toEqual({ ownerId: A, id: `adv#${ADV}` })
    expect(input.ExpressionAttributeValues?.[':kind']).toBe('adventure')
    expect(input.ExpressionAttributeValues?.[':scenes']).toEqual(draft.scenes) // native list, not JSON text
    expect(input.UpdateExpression).toContain('#createdAt = if_not_exists(#createdAt, :now)')
  })

  it('reads with a consistent read and hides the prefix and kind', async () => {
    ddb.on(GetCommand).resolvesOnce({}).resolvesOnce({ Item: { ownerId: A, id: `adv#${ADV}`, kind: 'adventure', title: 'T' } })
    expect(await adventures.get(A, ADV)).toBeNull()
    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({ Key: { ownerId: A, id: `adv#${ADV}` }, ConsistentRead: true })
    const got = await adventures.get(A, ADV)
    expect(got).toMatchObject({ id: ADV, title: 'T' })
    expect(got).not.toHaveProperty('kind')
  })

  it('lists only adv# items, newest first, with plain ids', async () => {
    ddb.on(QueryCommand).resolves({ Items: [
      { id: 'adv#1', title: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'adv#2', title: 'New', updatedAt: '2026-06-01T00:00:00Z' },
    ] })
    const list = await adventures.list(A)
    expect(list.map(a => [a.id, a.title])).toEqual([['2', 'New'], ['1', 'Old']])
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toBe('ownerId = :o AND begins_with(id, :p)')
    expect(input.ExpressionAttributeValues).toEqual({ ':o': A, ':p': 'adv#' })
  })

  it('reports whether a delete removed anything', async () => {
    ddb.on(DeleteCommand).resolvesOnce({ Attributes: { id: `adv#${ADV}` } }).resolvesOnce({})
    expect(await adventures.delete(A, ADV)).toBe(true)
    expect(await adventures.delete(A, ADV)).toBe(false)
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ ownerId: A, id: `adv#${ADV}` })
  })
})

describe('DynamoProfileStore', () => {
  const ids = ['EMBER-AAAAA', 'EMBER-BBBBB', 'EMBER-CCCCC']
  const profiles = () => { let i = 0; return new DynamoProfileStore(doc, 'heroes', () => ids[i++]) }
  const saved = { kind: 'profile', playerId: 'EMBER-AAAAA', displayName: '', gameMaster: false, createdAt: 'c', updatedAt: 'u' }

  it('returns an existing profile without claiming anything, and hides internal fields', async () => {
    ddb.on(GetCommand).resolves({ Item: { ownerId: A, id: 'profile', ...saved } })
    const p = await profiles().getOrCreate(A)
    expect(p).toEqual({ displayName: '', gameMaster: false, playerId: 'EMBER-AAAAA', createdAt: 'c', updatedAt: 'u' })
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(0)
    expect(ddb.commandCalls(GetCommand)[0].args[0].input.ConsistentRead).toBe(true)
  })

  it('claims a unique player ID first, then creates the profile with it', async () => {
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand).resolvesOnce({}).resolvesOnce({ Attributes: { ...saved } })
    const p = await profiles().getOrCreate(A)
    expect(p.playerId).toBe('EMBER-AAAAA')

    const [claim, create] = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input)
    expect(claim.Key).toEqual({ ownerId: '_player', id: 'EMBER-AAAAA' })
    expect(claim.ConditionExpression).toBe('attribute_not_exists(#id)')
    expect(claim.ExpressionAttributeValues?.[':o']).toBe(A)
    expect(create.Key).toEqual({ ownerId: A, id: 'profile' })
    expect(create.ConditionExpression).toBe('attribute_not_exists(#p)')
    expect(create.ExpressionAttributeValues).toMatchObject({ ':p': 'EMBER-AAAAA', ':g': false, ':d': '', ':k': 'profile' })
  })

  it('picks another player ID when one is taken', async () => {
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand)
      .rejectsOnce(conditionFailed())
      .resolvesOnce({})
      .resolvesOnce({ Attributes: { ...saved, playerId: 'EMBER-BBBBB' } })
    expect((await profiles().getOrCreate(A)).playerId).toBe('EMBER-BBBBB')
    expect(ddb.commandCalls(UpdateCommand).map(c => c.args[0].input.Key?.id)).toEqual(['EMBER-AAAAA', 'EMBER-BBBBB', 'profile'])
  })

  it('gives up with DatabaseUnavailable after repeated collisions', async () => {
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand).rejects(conditionFailed())
    const s = new DynamoProfileStore(doc, 'heroes', () => 'EMBER-AAAAA')
    await expect(s.getOrCreate(A)).rejects.toBeInstanceOf(DatabaseUnavailable)
  })

  it('on a lost race, releases its claimed ID and returns the winning profile', async () => {
    ddb.on(GetCommand).resolvesOnce({}).resolves({ Item: { ownerId: A, id: 'profile', ...saved, playerId: 'EMBER-WINNR' } })
    ddb.on(UpdateCommand).resolvesOnce({}).rejectsOnce(conditionFailed())
    ddb.on(DeleteCommand).resolves({})
    const p = await profiles().getOrCreate(A)
    expect(p.playerId).toBe('EMBER-WINNR')
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ ownerId: '_player', id: 'EMBER-AAAAA' })
  })

  it('updates only the given fields, and only when the profile exists', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { ...saved, gameMaster: true } })
    const p = await profiles().update(A, { gameMaster: true })
    expect(p.gameMaster).toBe(true)
    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(input.Key).toEqual({ ownerId: A, id: 'profile' })
    expect(input.ConditionExpression).toBe('attribute_exists(playerId)')
    expect(input.ExpressionAttributeValues).toMatchObject({ ':gameMaster': true })
    expect(input.ExpressionAttributeValues).not.toHaveProperty(':displayName')
    expect(input.ExpressionAttributeValues).not.toHaveProperty(':playerId')
  })
})
