import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { friendsApi } from './api/client.ts'
import type { Friend } from './api/types.ts'
import { clearToasts, getToasts } from './engine/toast.ts'
import { announceRead, useUnread } from './useUnread.ts'

vi.mock('./api/client.ts', () => ({ friendsApi: { list: vi.fn() } }))

const ana = (unread: boolean): Friend => ({ playerId: 'EMBER-AAAAB', displayName: 'Ana', unread })
const serve = (friends: Friend[]) => vi.mocked(friendsApi.list).mockResolvedValue({ friends } as never)
const poll = async () => { await act(async () => { announceRead() }) }

describe('useUnread toasts', () => {
  beforeEach(() => { clearToasts(); vi.mocked(friendsApi.list).mockReset() })
  afterEach(() => { cleanup(); clearToasts() })

  it('does not toast for messages already waiting on the first load', async () => {
    serve([ana(true)])
    const { result } = renderHook(() => useUnread(true))
    await waitFor(() => expect(result.current).toBe(1))
    expect(getToasts()).toHaveLength(0)
  })

  it('toasts, with a link to the chat, when a chat goes from read to unread', async () => {
    serve([ana(false)])
    const { result } = renderHook(() => useUnread(true))
    await waitFor(() => expect(vi.mocked(friendsApi.list)).toHaveBeenCalledTimes(1))
    serve([ana(true)])
    await poll()
    await waitFor(() => expect(result.current).toBe(1))
    const [toast] = getToasts()
    expect(toast.title).toBe('New message from Ana')
    expect(toast.to).toBe('/friends/EMBER-AAAAB/chat')
    expect(JSON.stringify(toast)).not.toMatch(/sub|ownerId/i)
  })

  it('toasts once, not on every poll while it stays unread', async () => {
    serve([ana(false)])
    const { result } = renderHook(() => useUnread(true))
    await waitFor(() => expect(vi.mocked(friendsApi.list)).toHaveBeenCalledTimes(1))
    serve([ana(true)])
    await poll()
    await waitFor(() => expect(result.current).toBe(1))
    await poll()
    await waitFor(() => expect(vi.mocked(friendsApi.list)).toHaveBeenCalledTimes(3))
    expect(getToasts()).toHaveLength(1)
  })

  it('does not toast for the chat that is open', async () => {
    serve([ana(false)])
    const { result } = renderHook(() => useUnread(true, 'EMBER-AAAAB'))
    await waitFor(() => expect(vi.mocked(friendsApi.list)).toHaveBeenCalledTimes(1))
    serve([ana(true)])
    await poll()
    await waitFor(() => expect(result.current).toBe(1))
    expect(getToasts()).toHaveLength(0)
  })
})
