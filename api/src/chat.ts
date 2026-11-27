// Chat between friends (VTTER-109, docs/adr/0010-friend-chat.md). Plain text, one thread per pair of friends.
// Pure helpers: the store does the I/O. `from` is a Cognito id and stays inside the API, so a message
// leaves only through `toMessageView`, which says "mine" instead.
import chatData from '../../data/chat.json'
import { ValidationError } from './sheet.ts'

export const CHAT_LIMITS = chatData.limits

/** A message as the store holds it. `from` is the sender's Cognito id: never returned. */
export interface ChatMessageRecord {
  /** `<ISO time>#<8 hex>`: sorts by time, and is the cursor the client sends back. */
  id: string
  from: string
  text: string
  createdAt: string
}

export interface ChatMessageView {
  id: string
  mine: boolean
  text: string
  createdAt: string
}

// ISO time (always `Z`, from Date#toISOString) + '#' + 8 hex. Checked on the cursor so a client can't send anything else into a key.
const MESSAGE_ID = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z#[0-9a-f]{8}$/
// Control characters other than newline. Tabs and carriage returns are folded away first.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/

export function isMessageId(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_ID.test(value)
}

export function newMessageId(now: Date, random: () => number = Math.random): string {
  const hex = Math.floor(random() * 0x100000000).toString(16).padStart(8, '0')
  return `${now.toISOString()}#${hex}`
}

/** The text of a POST body, trimmed and checked. Throws a ValidationError (400) with a message the app can show. */
export function parseMessage(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body must be an object')
  const raw = (body as Record<string, unknown>).text
  if (typeof raw !== 'string') throw new ValidationError('text must be a string')
  const text = raw.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim()
  if (text === '') throw new ValidationError('Write something to send')
  if (text.length > CHAT_LIMITS.maxLength) throw new ValidationError(`A message can be at most ${CHAT_LIMITS.maxLength} characters`)
  if (CONTROL.test(text)) throw new ValidationError('That message has characters that can not be sent')
  return text
}

/** Built field by field so the sender's Cognito id can't ride along. */
export function toMessageView(m: ChatMessageRecord, me: string): ChatMessageView {
  return { id: m.id, mine: m.from === me, text: m.text, createdAt: m.createdAt }
}

/** Whether a friendship's own side has something the player hasn't opened yet. Both are ISO times, so they compare as text. */
export function isUnread(edge: { lastMessageAt?: string; lastReadAt?: string }): boolean {
  return !!edge.lastMessageAt && (!edge.lastReadAt || edge.lastMessageAt > edge.lastReadAt)
}
