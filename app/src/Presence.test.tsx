// Presence on screen (VTTER-73): the heartbeat hook, the friends list and the Home panel, against a fake API client.
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendsOnline, FriendsView } from './Friends.tsx'
import { friendsApi, gamesApi } from './api/client.ts'
import type { Friend, FriendLists } from './api/types.ts'
import { HEARTBEAT_MS } from './engine/presence.ts'
import { usePresence } from './usePresence.ts'

vi.mock('./api/client.ts', () => ({
  friendsApi: { list: vi.fn(), request: vi.fn(), remove: vi.fn(), adventures: vi.fn(), adventure: vi.fn() },
  gamesApi: { heartbeat: vi.fn() },
  profileApi: {}, adventuresApi: {},
  ApiError: class extends Error {},
}))

const friends = vi.mocked(friendsApi)
const games = vi.mocked(gamesApi)
const ana: Friend = { playerId: 'EMBER-AAAAB', displayName: 'Ana', online: true, game: { id: 'g-1', name: 'Friday' } }
const ben: Friend = { playerId: 'EMBER-AAAAC', displayName: 'Ben', online: true, game: null }
const cal: Friend = { playerId: 'EMBER-AAAAD', displayName: 'Cal', online: false, game: null }
const lists = (f: Friend[]): FriendLists => ({ friends: f, incoming: [], outgoing: [] })

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const setVisibility = (state: 'visible' | 'hidden') => vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  setVisibility('visible')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('usePresence', () => {
  it('beats on open and then every heartbeat, passing back who is online', async () => {
    games.heartbeat.mockResolvedValue({ online: ['EMBER-AAAAB'] })
    const seen = vi.fn()
    renderHook(() => usePresence('g-1', seen))
    await settle()
    expect(games.heartbeat).toHaveBeenCalledTimes(1)
    expect(games.heartbeat).toHaveBeenCalledWith('g-1')
    expect(seen).toHaveBeenCalledWith(['EMBER-AAAAB'])
    await tick(HEARTBEAT_MS)
    expect(games.heartbeat).toHaveBeenCalledTimes(2)
    await tick(HEARTBEAT_MS)
    expect(games.heartbeat).toHaveBeenCalledTimes(3)
  })

  it('sends nothing while the tab is hidden, and beats again when it comes back', async () => {
    games.heartbeat.mockResolvedValue({ online: [] })
    renderHook(() => usePresence('g-1', vi.fn()))
    await settle()
    games.heartbeat.mockClear()
    setVisibility('hidden')
    await tick(HEARTBEAT_MS * 3)
    expect(games.heartbeat).not.toHaveBeenCalled()
    setVisibility('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(games.heartbeat).toHaveBeenCalledTimes(1)
  })

  it('stops beating when the page closes, and survives a failed beat', async () => {
    games.heartbeat.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ online: [] })
    const { unmount } = renderHook(() => usePresence('g-1', vi.fn()))
    await settle() // the first beat failed and nothing threw
    await tick(HEARTBEAT_MS)
    expect(games.heartbeat).toHaveBeenCalledTimes(2) // the next one tried again
    unmount()
    await tick(HEARTBEAT_MS * 3)
    expect(games.heartbeat).toHaveBeenCalledTimes(2)
  })
})

describe('the Friends list', () => {
  it('shows who is online and where, and an Open link only for a Game you share', () => {
    render(<FriendsView lists={lists([ana, ben, cal])} onChange={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Friends' })
    const rows = within(region).getAllByRole('listitem')
    expect(within(rows[0]).getByRole('img', { name: 'Online now' })).toBeVisible()
    expect(rows[0]).toHaveTextContent('At the table in “Friday”')
    expect(within(rows[0]).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/games/g-1')
    expect(rows[1]).toHaveTextContent('In a Game')
    expect(within(rows[1]).queryByRole('link', { name: 'Open' })).toBeNull()
    expect(within(rows[2]).getByRole('img', { name: 'Offline' })).toBeVisible()
    expect(rows[2]).toHaveTextContent('Offline')
  })

  it('treats a friend with no presence fields as offline', () => {
    render(<FriendsView lists={lists([{ playerId: 'EMBER-AAAAE', displayName: 'Dee' }])} onChange={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Offline' })).toBeVisible()
  })
})

describe('Friends online on Home', () => {
  it('lists only friends who are online, online first, each with a Chat link', async () => {
    friends.list.mockResolvedValue(lists([cal, ben, ana]))
    render(<FriendsOnline />)
    await settle()
    const region = screen.getByRole('region', { name: 'Friends online' })
    const rows = within(region).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Ben')
    expect(rows[1]).toHaveTextContent('Ana')
    expect(within(rows[1]).getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/friends/EMBER-AAAAB/chat')
    expect(screen.queryByText('Cal')).toBeNull()
  })

  it('shows nothing at all when nobody is online, or when the list cannot be read', async () => {
    friends.list.mockResolvedValue(lists([cal]))
    const { container, rerender } = render(<FriendsOnline />)
    await settle()
    expect(container).toBeEmptyDOMElement()
    friends.list.mockRejectedValue(new Error('offline'))
    rerender(<FriendsOnline />)
    await tick(HEARTBEAT_MS)
    expect(container).toBeEmptyDOMElement()
  })

  it('refreshes while the tab is visible, so a friend who arrives appears and one who leaves goes', async () => {
    friends.list.mockResolvedValueOnce(lists([cal])).mockResolvedValueOnce(lists([{ ...cal, online: true }]))
    render(<FriendsOnline />)
    await settle()
    expect(screen.queryByRole('region', { name: 'Friends online' })).toBeNull()
    await tick(HEARTBEAT_MS)
    expect(screen.getByRole('region', { name: 'Friends online' })).toBeVisible()
    friends.list.mockResolvedValue(lists([cal]))
    await tick(HEARTBEAT_MS)
    expect(screen.queryByRole('region', { name: 'Friends online' })).toBeNull()
  })

  it('does not poll while the tab is hidden', async () => {
    friends.list.mockResolvedValue(lists([]))
    render(<FriendsOnline />)
    await settle()
    friends.list.mockClear()
    setVisibility('hidden')
    await tick(HEARTBEAT_MS * 3)
    expect(friends.list).not.toHaveBeenCalled()
  })
})
