import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { FIND_PK, findKey, NAME_SEARCH } from '../src/profile.ts'
import { DynamoProfileStore } from '../src/store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const profiles = new DynamoProfileStore(doc, 'heroes')
const ANA = 'ana-1'
const BEN = 'ben-2'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })
const stored = (over: Record<string, unknown> = {}) => ({
  kind: 'profile', ownerId: ANA, id: 'profile', playerId: 'EMBER-AAAAAA', displayName: 'Ana', gameMaster: false, findable: false,
  createdAt: 'c', updatedAt: 'u1', ...over,
})

beforeEach(() => ddb.reset())

describe('DynamoProfileStore: being found by name (VTTER-108)', () => {
  it('a new profile starts not findable', async () => {
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand).resolves({ Attributes: stored() })
    await profiles.getOrCreate(ANA)
    // The first write claims the player ID; the second creates the profile.
    const create = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input).find(i => i.Key?.id === 'profile')
    expect(create?.ExpressionAttributeValues?.[':f']).toBe(false)
  })

  it('writes the search key when a findable player has a name, from the name and player ID', async () => {
    ddb.on(GetCommand).resolves({ Item: stored() })
    ddb.on(UpdateCommand).resolves({ Attributes: stored({ findable: true }) })
    await profiles.update(ANA, { findable: true })
    const call = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(call.ExpressionAttributeValues).toMatchObject({ ':gsi1pk': FIND_PK, ':gsi1sk': findKey('Ana', 'EMBER-AAAAAA') })
    expect(call.UpdateExpression).not.toContain('REMOVE')
    // Written only if nobody changed the profile since we read it.
    expect(call.ConditionExpression).toContain('#seen = :seen')
    expect(call.ExpressionAttributeValues?.[':seen']).toBe('u1')
  })

  it('removes the search key when the player turns it off, or has no name', async () => {
    ddb.on(GetCommand).resolves({ Item: stored({ findable: true }) })
    ddb.on(UpdateCommand).resolves({ Attributes: stored() })
    await profiles.update(ANA, { findable: false })
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toContain('REMOVE #gsi1pk, #gsi1sk')

    ddb.reset()
    ddb.on(GetCommand).resolves({ Item: stored({ findable: true }) })
    ddb.on(UpdateCommand).resolves({ Attributes: stored() })
    await profiles.update(ANA, { displayName: '   ' })
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toContain('REMOVE #gsi1pk, #gsi1sk')
  })

  it('moves the search key when a findable player renames', async () => {
    ddb.on(GetCommand).resolves({ Item: stored({ findable: true }) })
    ddb.on(UpdateCommand).resolves({ Attributes: stored({ findable: true, displayName: 'Ash' }) })
    await profiles.update(ANA, { displayName: 'Ash' })
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues?.[':gsi1sk']).toBe(findKey('Ash', 'EMBER-AAAAAA'))
  })

  it('retries once if the profile changed between the read and the write', async () => {
    ddb.on(GetCommand).resolves({ Item: stored() })
    ddb.on(UpdateCommand).rejectsOnce(conditionFailed()).resolves({ Attributes: stored({ findable: true }) })
    await expect(profiles.update(ANA, { findable: true })).resolves.toMatchObject({ findable: true })
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(2)
  })

  it('does not read first for a change that cannot touch the index', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: stored({ gameMaster: true }) })
    await profiles.update(ANA, { gameMaster: true })
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).not.toContain('gsi1')
  })

  it('never returns the key attributes, and a missing flag reads as false', async () => {
    ddb.on(GetCommand).resolves({})
    ddb.on(UpdateCommand).resolves({ Attributes: { ...stored(), findable: undefined, gsi1pk: FIND_PK, gsi1sk: 'ana#EMBER-AAAAAA' } })
    const p = await profiles.getOrCreate(ANA)
    expect(p.findable).toBe(false)
    expect(p).not.toHaveProperty('gsi1pk')
    expect(p).not.toHaveProperty('gsi1sk')
    expect(p).not.toHaveProperty('kind')
  })

  it('searches the index by the folded name prefix, then reads the profiles in one BatchGetItem', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ownerId: BEN }, { ownerId: ANA }] })
    ddb.on(BatchGetCommand).resolves({ Responses: { heroes: [stored({ ownerId: BEN, playerId: 'EMBER-BBBBBB', displayName: 'Ash', findable: true })] } })
    const found = await profiles.findByName('  ASH ', ANA, 10)
    expect(found).toEqual([{ playerId: 'EMBER-BBBBBB', displayName: 'Ash' }])
    const q = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(q).toMatchObject({ IndexName: 'gsi1', ExpressionAttributeValues: { ':pk': FIND_PK, ':prefix': 'ash#' }, Limit: 11 })
    expect(q.FilterExpression).toBeUndefined()
    // The caller's own row is dropped before the batch read.
    const keys = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems?.heroes.Keys
    expect(keys).toEqual([{ ownerId: BEN, id: 'profile' }])
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0)
  })

  it('drops a stale index row: someone who has since renamed or opted out', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ownerId: BEN }, { ownerId: 'cal-3' }] })
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        heroes: [
          stored({ ownerId: BEN, playerId: 'EMBER-BBBBBB', displayName: 'Bram', findable: true }), // renamed
          stored({ ownerId: 'cal-3', playerId: 'EMBER-CCCCCC', displayName: 'Ash', findable: false }), // opted out
        ],
      },
    })
    expect(await profiles.findByName('Ash', ANA, 10)).toEqual([])
  })

  it('returns nothing, and reads nothing, for a name that folds to empty', async () => {
    expect(await profiles.findByName('   ', ANA, 10)).toEqual([])
    expect(ddb.calls()).toHaveLength(0)
  })

  it('counts a search per player per minute, and refuses once the cap is reached', async () => {
    ddb.on(UpdateCommand).resolvesOnce({}).rejectsOnce(conditionFailed())
    expect(await profiles.allowSearch(ANA)).toBe(true)
    expect(await profiles.allowSearch(ANA)).toBe(false)
    const call = ddb.commandCalls(UpdateCommand)[0].args[0].input
    expect(call.Key?.ownerId).toBe(`ratelimit#${ANA}`)
    expect(String(call.Key?.id)).toMatch(/^search#\d+$/)
    expect(call.ExpressionAttributeValues).toMatchObject({ ':k': 'ratelimit', ':max': NAME_SEARCH.perMinute })
    expect(call.ConditionExpression).toContain('#n < :max')
  })
})
