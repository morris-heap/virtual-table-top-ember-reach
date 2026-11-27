import { describe, expect, it } from 'vitest'
import type { ChatMessage, Friend } from '../api/types.ts'
import { canSend, charsLeft, CHAT_LIMITS, hasFromThem, mergeMessages, newestId, newlyUnread, unreadCount, unreadIds } from './chat.ts'

const msg = (second: number, mine = false, text = `m${second}`): ChatMessage => ({
  id: `2026-11-26T12:00:${String(second).padStart(2, '0')}.000Z#aaaaaaaa`, mine, text, createdAt: `2026-11-26T12:00:${String(second).padStart(2, '0')}.000Z`,
})

describe('mergeMessages', () => {
  it('orders by time and drops messages it already has', () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3), msg(4)])
    expect(merged.map(m => m.text)).toEqual(['m1', 'm2', 'm3', 'm4'])
  })
  it('does not change its inputs', () => {
    const a = [msg(1)]
    mergeMessages(a, [msg(2)])
    expect(a).toHaveLength(1)
  })
  it('handles an empty thread on either side', () => {
    expect(mergeMessages([], [])).toEqual([])
    expect(mergeMessages([], [msg(1)])).toHaveLength(1)
    expect(mergeMessages([msg(1)], [])).toHaveLength(1)
  })
})

describe('newestId', () => {
  it('is the last message id, or undefined for an empty thread', () => {
    expect(newestId([msg(1), msg(2)])).toBe(msg(2).id)
    expect(newestId([])).toBeUndefined()
  })
})

describe('drafts', () => {
  it('counts what is left the way the API counts it, trimmed', () => {
    expect(charsLeft('')).toBe(CHAT_LIMITS.maxLength)
    expect(charsLeft('  hi  ')).toBe(CHAT_LIMITS.maxLength - 2)
  })
  it('can send something to say up to the limit, and nothing else', () => {
    expect(canSend('')).toBe(false)
    expect(canSend('   \n ')).toBe(false)
    expect(canSend('Friday?')).toBe(true)
    expect(canSend('x'.repeat(CHAT_LIMITS.maxLength))).toBe(true)
    expect(canSend('x'.repeat(CHAT_LIMITS.maxLength + 1))).toBe(false)
  })
})

describe('unread', () => {
  it('counts friends with something waiting', () => {
    const friends: Friend[] = [
      { playerId: 'EMBER-AAAAB', displayName: 'Ana', unread: true },
      { playerId: 'EMBER-AAAAC', displayName: 'Ben', unread: false },
      { playerId: 'EMBER-AAAAD', displayName: 'Cal' },
    ]
    expect(unreadCount(friends)).toBe(1)
    expect(unreadCount([])).toBe(0)
  })
  describe('newlyUnread', () => {
    const ana: Friend = { playerId: 'EMBER-AAAAB', displayName: 'Ana', unread: true }
    const ben: Friend = { playerId: 'EMBER-AAAAC', displayName: 'Ben', unread: true }
    it('reports nothing on the first poll, whatever is waiting', () => {
      expect(newlyUnread(null, [ana, ben])).toEqual([])
    })
    it('reports a friend whose chat went from read to unread', () => {
      expect(newlyUnread(new Set(), [ana])).toEqual([ana])
      expect(newlyUnread(unreadIds([{ ...ana, unread: false }]), [ana])).toEqual([ana])
    })
    it('does not repeat a chat that was already unread', () => {
      expect(newlyUnread(new Set([ana.playerId]), [ana, ben])).toEqual([ben])
    })
    it('skips the chat that is open', () => {
      expect(newlyUnread(new Set(), [ana, ben], ana.playerId)).toEqual([ben])
    })
    it('ignores friends with nothing waiting', () => {
      expect(newlyUnread(new Set(), [{ ...ana, unread: false }, { playerId: 'EMBER-AAAAD', displayName: 'Cal' }])).toEqual([])
    })
  })
  it('knows whether a thread has anything from the friend to mark as read', () => {
    expect(hasFromThem([msg(1, true), msg(2, true)])).toBe(false)
    expect(hasFromThem([msg(1, true), msg(2, false)])).toBe(true)
    expect(hasFromThem([])).toBe(false)
  })
})
