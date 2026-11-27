// The chat screen (VTTER-109), rendered against a fake API client with fake timers for the polling.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatView } from './Chat.tsx'
import { FriendsView } from './Friends.tsx'
import type { ChatMessage, Person } from './api/types.ts'
import { friendsApi } from './api/client.ts'
import { CHAT_LIMITS, POLL_SECONDS } from './engine/chat.ts'

vi.mock('./api/client.ts', () => ({
  friendsApi: { list: vi.fn(), messages: vi.fn(), send: vi.fn(), markRead: vi.fn() },
  gamesApi: {}, profileApi: {}, adventuresApi: {},
  ApiError: class extends Error {},
}))

const api = vi.mocked(friendsApi)
const ana: Person = { playerId: 'EMBER-AAAAB', displayName: 'Ana' }
const msg = (second: number, mine: boolean, text: string): ChatMessage => {
  const at = `2026-11-26T12:00:${String(second).padStart(2, '0')}.000Z`
  return { id: `${at}#aaaaaaaa`, mine, text, createdAt: at }
}
const notFound = () => Object.assign(new Error('Not found'), { status: 404 })

/** Let the promises the component is waiting on settle. */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const tick = (seconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  api.markRead.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the Friends list', () => {
  it('links each friend to their chat, with a dot only for a friend who has something new', () => {
    render(<FriendsView
      lists={{ friends: [{ ...ana, unread: true }, { playerId: 'EMBER-AAAAC', displayName: 'Ben', unread: false }], incoming: [], outgoing: [] }}
      onChange={vi.fn()}
    />)
    const toAna = screen.getByRole('link', { name: /Chat with Ana/ })
    expect(toAna).toHaveAttribute('href', '/friends/EMBER-AAAAB/chat')
    expect(toAna.querySelector('.unread-dot')).not.toBeNull()
    const toBen = screen.getByRole('link', { name: /Chat with Ben/ })
    expect(toBen).toHaveAttribute('href', '/friends/EMBER-AAAAC/chat')
    expect(toBen.querySelector('.unread-dot')).toBeNull()
  })
})

describe('ChatView', () => {
  it('opens the newest page, oldest first, and marks it read when there is something from them', async () => {
    api.messages.mockResolvedValue({ messages: [msg(1, false, 'Friday at 7?'), msg(2, true, 'Works for me')], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Friday at 7?')
    expect(items[1]).toHaveTextContent('Works for me')
    expect(items[0]).toHaveTextContent('Ana')
    expect(items[1]).toHaveTextContent('You')
    expect(api.messages).toHaveBeenCalledWith('EMBER-AAAAB')
    expect(api.markRead).toHaveBeenCalledWith('EMBER-AAAAB')
  })

  it('does not mark an all-yours thread read, and invites you to say hello when it is empty', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    expect(screen.getByText(/No messages yet/)).toBeVisible()
    expect(api.markRead).not.toHaveBeenCalled()
  })

  it('shows message text as text, never as markup', async () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    api.messages.mockResolvedValue({ messages: [msg(1, false, evil)], hasMore: false })
    const { container } = render(<ChatView person={ana} />)
    await settle()
    expect(screen.getByText(evil)).toBeVisible()
    expect(container.querySelector('.chat-log img, .chat-log script')).toBeNull()
  })

  it('sends with the draft trimmed, shows the message and clears the box', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    api.send.mockResolvedValue(msg(5, true, 'See you there'))
    render(<ChatView person={ana} />)
    await settle()
    fireEvent.change(screen.getByLabelText('Message to Ana'), { target: { value: '  See you there \n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await settle()
    expect(api.send).toHaveBeenCalledWith('EMBER-AAAAB', 'See you there')
    expect(screen.getByText('See you there')).toBeVisible()
    expect(screen.getByLabelText('Message to Ana')).toHaveValue('')
  })

  it('sends on Enter, but Shift+Enter is a new line', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    api.send.mockResolvedValue(msg(5, true, 'hi'))
    render(<ChatView person={ana} />)
    await settle()
    const box = screen.getByLabelText('Message to Ana')
    fireEvent.change(box, { target: { value: 'hi' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(api.send).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })
    await settle()
    expect(api.send).toHaveBeenCalledTimes(1)
  })

  it('cannot send nothing, or more than the limit', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Message to Ana'), { target: { value: 'x'.repeat(CHAT_LIMITS.maxLength + 1) } })
    expect(send).toBeDisabled()
    expect(screen.getByText(/1 characters too many/)).toBeVisible()
  })

  it('keeps the draft and shows the API message when a send fails (for example a rate limit)', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    api.send.mockRejectedValue(Object.assign(new Error('You are sending messages too fast. Wait a moment.'), { status: 429 }))
    render(<ChatView person={ana} />)
    await settle()
    fireEvent.change(screen.getByLabelText('Message to Ana'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('too fast')
    expect(screen.getByLabelText('Message to Ana')).toHaveValue('hello')
  })

  it('asks for what is new after the newest message, and adds it', async () => {
    api.messages
      .mockResolvedValueOnce({ messages: [msg(1, true, 'first')], hasMore: false })
      .mockResolvedValueOnce({ messages: [msg(2, false, 'a reply')], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    api.markRead.mockClear()
    await tick(POLL_SECONDS.thread)
    expect(api.messages).toHaveBeenLastCalledWith('EMBER-AAAAB', { after: msg(1, true, '').id })
    expect(screen.getByText('a reply')).toBeVisible()
    expect(screen.getByText('first')).toBeVisible()
    expect(api.markRead).toHaveBeenCalledTimes(1) // something new from them
  })

  it('does not show a message twice when a poll returns one it already has', async () => {
    const same = msg(1, true, 'only once')
    api.messages.mockResolvedValue({ messages: [same], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    await tick(POLL_SECONDS.thread)
    expect(screen.getAllByText('only once')).toHaveLength(1)
  })

  it('does not poll while the tab is hidden', async () => {
    api.messages.mockResolvedValue({ messages: [], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    const calls = api.messages.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await tick(POLL_SECONDS.thread * 3)
    expect(api.messages).toHaveBeenCalledTimes(calls)
  })

  it('says it is reconnecting when a poll fails, and recovers on the next one', async () => {
    api.messages
      .mockResolvedValueOnce({ messages: [], hasMore: false })
      .mockRejectedValueOnce(new Error("Can't reach the server."))
      .mockResolvedValue({ messages: [], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    await tick(POLL_SECONDS.thread)
    expect(screen.getByRole('status')).toHaveTextContent(/Trying again/)
    await tick(POLL_SECONDS.thread)
    expect(screen.queryByText(/Trying again/)).toBeNull()
  })

  it('turns into a notice, with no composer, when the friendship has ended', async () => {
    api.messages
      .mockResolvedValueOnce({ messages: [msg(1, false, 'hi')], hasMore: false })
      .mockRejectedValueOnce(notFound())
    render(<ChatView person={ana} />)
    await settle()
    await tick(POLL_SECONDS.thread)
    expect(screen.getByRole('alert')).toHaveTextContent('not friends with Ana any more')
    expect(screen.queryByLabelText('Message to Ana')).toBeNull()
  })

  it('pages back with "Show older messages", keeping the order', async () => {
    api.messages
      .mockResolvedValueOnce({ messages: [msg(5, false, 'newer')], hasMore: true })
      .mockResolvedValueOnce({ messages: [msg(1, false, 'older')], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Show older messages' }))
    await settle()
    expect(api.messages).toHaveBeenLastCalledWith('EMBER-AAAAB', { before: msg(5, false, '').id })
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringContaining('older'), expect.stringContaining('newer'),
    ])
    expect(screen.queryByRole('button', { name: 'Show older messages' })).toBeNull()
  })

  it('offers a retry when the thread cannot be opened', async () => {
    api.messages.mockRejectedValueOnce(new Error('The server is busy.')).mockResolvedValueOnce({ messages: [msg(1, true, 'back')], hasMore: false })
    render(<ChatView person={ana} />)
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('busy')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await settle()
    expect(screen.getByText('back')).toBeVisible()
  })
})
