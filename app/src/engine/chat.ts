// Pure helpers for chatting with friends (VTTER-109). The API enforces every rule; these shape what the screen shows.
import chatData from '../../../data/chat.json'
import type { ChatMessage, Friend } from '../api/types.ts'

export const CHAT_LIMITS = chatData.limits
export const POLL_SECONDS = chatData.pollSeconds

/** Add messages to a thread, dropping any already there, oldest first. Ids start with an ISO time, so text order is time order. */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map(m => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The cursor for "what is new since I last looked", or undefined for an empty thread. */
export function newestId(messages: ChatMessage[]): string | undefined {
  return messages.at(-1)?.id
}

/** Characters left in a draft, counted the way the API counts them (trimmed). Negative means too long. */
export function charsLeft(draft: string): number {
  return CHAT_LIMITS.maxLength - draft.trim().length
}

/** Whether a draft can be sent: something to say, and not too long. */
export function canSend(draft: string): boolean {
  return draft.trim() !== '' && charsLeft(draft) >= 0
}

/** How many friends have messages waiting. */
export function unreadCount(friends: Friend[]): number {
  return friends.filter(f => f.unread).length
}

/** Whether any message in the thread came from the friend, i.e. whether opening the thread has something to mark as read. */
export function hasFromThem(messages: ChatMessage[]): boolean {
  return messages.some(m => !m.mine)
}
