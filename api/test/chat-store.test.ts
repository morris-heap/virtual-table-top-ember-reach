import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHAT_LIMITS } from '../src/chat.ts'
import { DynamoChatStore, threadKey } from '../src/chat-store.ts'

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }))
const ddb = mockClient(DynamoDBDocumentClient)
const NOW = new Date('2026-11-26T12:00:00.000Z')
const chat = new DynamoChatStore(doc, 'vtter-game', () => NOW)
const ANA = 'ana-1'
const BEN = 'ben-1'
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })

beforeEach(() => ddb.reset())

describe('threadKey', () => {
  it('is the same from either side, so both friends share one partition', () => {
    expect(threadKey(ANA, BEN)).toBe(threadKey(BEN, ANA))
    expect(threadKey(BEN, ANA)).toBe(`chat#${ANA}#${BEN}`)
  })
})

describe('DynamoChatStore', () => {
  it('stores a message with kind, an expiry and the sender, under the pair partition', async () => {
    ddb.on(UpdateCommand).resolves({})
    const sent = await chat.send(BEN, ANA, 'hello')
    expect(sent).toMatchObject({ from: BEN, text: 'hello', createdAt: NOW.toISOString() })
    expect(sent!.id).toMatch(/^2026-11-26T12:00:00\.000Z#[0-9a-f]{8}$/)

    const message = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input).find(i => i.Key?.id === `msg#${sent!.id}`)!
    expect(message.Key?.ownerId).toBe(`chat#${ANA}#${BEN}`)
    expect(message.ExpressionAttributeValues).toMatchObject({
      ':k': 'message', ':f': BEN, ':t': 'hello', ':ttl': Math.floor(NOW.getTime() / 1000) + CHAT_LIMITS.ttlDays * 86400,
    })
  })

  it('counts the minute first, refuses at the cap, and writes nothing else when refused', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed())
    expect(await chat.send(ANA, BEN, 'too many')).toBeNull()
    const calls = ddb.commandCalls(UpdateCommand)
    expect(calls).toHaveLength(1)
    const input = calls[0].args[0].input
    expect(input.Key?.ownerId).toBe(`ratelimit#${ANA}`)
    expect(input.ConditionExpression).toContain('#n < :max')
    expect(input.ExpressionAttributeValues?.[':max']).toBe(CHAT_LIMITS.maxPerMinute)
  })

  it('marks the receiver unread and the sender read, without recreating a removed friendship', async () => {
    ddb.on(UpdateCommand).resolves({})
    await chat.send(ANA, BEN, 'hi')
    const marks = ddb.commandCalls(UpdateCommand).map(c => c.args[0].input).filter(i => String(i.Key?.id).startsWith('friend#'))
    expect(marks).toHaveLength(2)
    const toBen = marks.find(m => m.Key?.ownerId === BEN)!
    const toAna = marks.find(m => m.Key?.ownerId === ANA)!
    expect(toBen.Key?.id).toBe(`friend#${ANA}`)
    expect(toBen.ExpressionAttributeNames?.['#f']).toBe('lastMessageAt')
    expect(toAna.ExpressionAttributeNames?.['#f']).toBe('lastReadAt')
    for (const m of marks) expect(m.ConditionExpression).toBe('attribute_exists(#id)')
  })

  it('survives a friendship removed mid-send (the marker write finds no item)', async () => {
    ddb.on(UpdateCommand).callsFake(input => {
      if (String(input.Key?.id).startsWith('friend#')) throw conditionFailed()
      return {}
    })
    await expect(chat.send(ANA, BEN, 'hi')).resolves.toMatchObject({ text: 'hi' })
    await expect(chat.markRead(ANA, BEN)).resolves.toBeUndefined()
  })

  it('reads the newest page with a prefix range, no filter, consistently, and returns it oldest first', async () => {
    const rows = [3, 2, 1].map(n => ({ id: `msg#2026-11-26T12:00:0${n}.000Z#aaaaaaa${n}`, from: ANA, text: `m${n}`, createdAt: 'x' }))
    ddb.on(QueryCommand).resolves({ Items: rows })
    const page = await chat.list(BEN, ANA, {})
    expect(page.messages.map(m => m.text)).toEqual(['m1', 'm2', 'm3'])
    expect(page.messages[0].id).toBe('2026-11-26T12:00:01.000Z#aaaaaaa1') // prefix stripped
    expect(page.hasMore).toBe(false)
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toContain('begins_with')
    expect(input.FilterExpression).toBeUndefined()
    expect(input.ScanIndexForward).toBe(false)
    expect(input.ConsistentRead).toBe(true)
    expect(input.Limit).toBe(CHAT_LIMITS.pageSize + 1)
  })

  it('says there is more when the page overflows by one', async () => {
    const rows = Array.from({ length: CHAT_LIMITS.pageSize + 1 }, (_, i) => ({ id: `msg#t${i}`, from: ANA, text: 'x', createdAt: 'x' }))
    ddb.on(QueryCommand).resolves({ Items: rows })
    const page = await chat.list(ANA, BEN, { before: 'z' })
    expect(page.messages).toHaveLength(CHAT_LIMITS.pageSize)
    expect(page.hasMore).toBe(true)
  })

  it('reads forward from a cursor for polling', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] })
    await chat.list(ANA, BEN, { after: '2026-11-26T12:00:00.000Z#aaaaaaaa' })
    const input = ddb.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toContain('> :c')
    expect(input.ExpressionAttributeValues?.[':c']).toBe('msg#2026-11-26T12:00:00.000Z#aaaaaaaa')
    expect(input.ScanIndexForward).toBe(true)
  })
})
