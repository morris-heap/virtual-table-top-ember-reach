// The Friends screen and the Game page's friend picker (VTTER-73), rendered against a fake API client.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendsView } from './Friends.tsx'
import { InviteFriend } from './GamePage.tsx'
import type { FriendLists, GameMember, Person } from './api/types.ts'
import { friendsApi } from './api/client.ts'
import { FRIEND_LIMITS } from './engine/friends.ts'

vi.mock('./api/client.ts', () => ({
  friendsApi: { list: vi.fn(), request: vi.fn(), remove: vi.fn(), adventures: vi.fn(), adventure: vi.fn() },
  gamesApi: {}, profileApi: {}, adventuresApi: {},
  ApiError: class extends Error {},
}))
// The Game page imports the offline-capable hero repository; this screen never touches it.
vi.mock('./characters/current.ts', () => ({ characters: {}, characterRepository: () => ({}) }))

const api = vi.mocked(friendsApi)
const ana: Person = { playerId: 'EMBER-AAAAB', displayName: 'Ana' }
const ben: Person = { playerId: 'EMBER-AAAAC', displayName: 'Ben' }
const cal: Person = { playerId: 'EMBER-AAAAD', displayName: '' } // no display name: shows the player ID
const lists = (over: Partial<FriendLists> = {}): FriendLists => ({ friends: [], incoming: [], outgoing: [], ...over })

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('FriendsView', () => {
  it('shows friends, requests for you, and requests waiting on them', () => {
    render(<FriendsView lists={lists({ friends: [ana], incoming: [ben], outgoing: [cal] })} onChange={vi.fn()} />)
    expect(within(screen.getByRole('region', { name: 'Friends' })).getByText('Ana')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Requests for you' })).getByText('Ben')).toBeVisible()
    // A person with no display name is listed by player ID, never as a blank row.
    expect(within(screen.getByRole('region', { name: 'Waiting for an answer' })).getAllByText('EMBER-AAAAD')).not.toHaveLength(0)
  })

  it('hides the request sections when they are empty and says so for friends', () => {
    render(<FriendsView lists={lists()} onChange={vi.fn()} />)
    expect(screen.queryByRole('region', { name: 'Requests for you' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Waiting for an answer' })).toBeNull()
    expect(screen.getByText(/No friends yet/)).toBeVisible()
  })

  it('tells you the request limit from /data', () => {
    render(<FriendsView lists={lists()} onChange={vi.fn()} />)
    expect(screen.getByText(new RegExp(`${FRIEND_LIMITS.maxOutgoing} requests waiting`))).toBeVisible()
  })

  it('refuses text that is not a player ID without calling the API', () => {
    render(<FriendsView lists={lists()} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Their player ID/), { target: { value: 'ana please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(screen.getByRole('alert')).toHaveTextContent('not a player ID')
    expect(api.request).not.toHaveBeenCalled()
  })

  it('sends a request with the ID upper-cased and shows the new lists', async () => {
    const after = lists({ outgoing: [ana] })
    api.request.mockResolvedValue(after)
    const onChange = vi.fn()
    render(<FriendsView lists={lists()} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Their player ID/), { target: { value: ' ember-aaaab ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(after))
    expect(api.request).toHaveBeenCalledWith('EMBER-AAAAB')
  })

  it('shows the API message when a request is refused', async () => {
    api.request.mockRejectedValue(new Error('No player has that ID'))
    render(<FriendsView lists={lists()} onChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Their player ID/), { target: { value: 'EMBER-AAAAB' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No player has that ID')
  })

  it('accepts a request by asking back, and declines with a delete then a refresh', async () => {
    const accepted = lists({ friends: [ben] })
    api.request.mockResolvedValue(accepted)
    api.remove.mockResolvedValue(undefined)
    api.list.mockResolvedValue(lists())
    const onChange = vi.fn()
    render(<FriendsView lists={lists({ incoming: [ben] })} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept Ben' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(accepted))
    expect(api.request).toHaveBeenCalledWith(ben.playerId)

    fireEvent.click(screen.getByRole('button', { name: 'Decline Ben' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(ben.playerId))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(lists()))
  })

  it('cancels a request you sent', async () => {
    api.remove.mockResolvedValue(undefined)
    api.list.mockResolvedValue(lists())
    render(<FriendsView lists={lists({ outgoing: [ana] })} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request to Ana' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(ana.playerId))
  })

  it('removes a friend only after you confirm', async () => {
    api.remove.mockResolvedValue(undefined)
    api.list.mockResolvedValue(lists())
    const confirm = vi.spyOn(window, 'confirm')
    render(<FriendsView lists={lists({ friends: [ana] })} onChange={vi.fn()} />)

    confirm.mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ana' }))
    expect(api.remove).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ana' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(ana.playerId))
  })

  it('opens a friend\'s shared adventures and links to each', async () => {
    api.adventures.mockResolvedValue([
      { id: '44444444-4444-4444-8444-444444444444', title: 'The Cold Hearth', summary: '', levelMin: 1, levelMax: 2, visibility: 'friends', updatedAt: 'x' },
    ])
    render(<FriendsView lists={lists({ friends: [ana] })} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adventures' }))
    const link = await screen.findByRole('link', { name: 'The Cold Hearth' })
    expect(link).toHaveAttribute('href', '/friends/EMBER-AAAAB/adventures/44444444-4444-4444-8444-444444444444')
    expect(api.adventures).toHaveBeenCalledWith(ana.playerId)
  })
})

describe('InviteFriend (Game page)', () => {
  const seated = (...people: Person[]): GameMember[] =>
    people.map(p => ({ ...p, role: 'player' as const, hero: null, mine: false, online: false, friend: false }))

  it('offers only friends who are not already at the table, and invites the one picked', async () => {
    api.list.mockResolvedValue(lists({ friends: [ana, ben] }))
    const onInvite = vi.fn()
    render(<InviteFriend members={seated(ana)} busy={false} onInvite={onInvite} />)

    const pick = await screen.findByLabelText('Invite a friend')
    expect(within(pick).queryByText(/Ana/)).toBeNull()
    fireEvent.change(pick, { target: { value: ben.playerId } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite friend' }))
    expect(onInvite).toHaveBeenCalledWith(ben.playerId)
  })

  it('points to the Friends page when there are no friends, and stays hidden if the list fails to load', async () => {
    api.list.mockResolvedValueOnce(lists())
    render(<InviteFriend members={[]} busy={false} onInvite={vi.fn()} />)
    expect(await screen.findByRole('link', { name: 'Friends' })).toHaveAttribute('href', '/friends')
    cleanup()

    api.list.mockRejectedValueOnce(new Error('down'))
    const { container } = render(<InviteFriend members={[]} busy={false} onInvite={vi.fn()} />)
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('FriendsView: presence (VTTER-73)', () => {
  it('lists online friends first, with a dot, and names a Game only when the API sent one', () => {
    const online = { ...ben, online: true, game: { id: 'g1', name: 'Friday' } }
    const away = { ...ana, online: false, game: null }
    render(<FriendsView lists={lists({ friends: [away, online] })} onChange={vi.fn()} />)
    const rows = within(screen.getByRole('region', { name: 'Friends' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Ben')
    expect(rows[0]).toHaveTextContent('Friday')
    expect(rows[0].querySelector('[aria-label="Online now"]')).not.toBeNull()
    expect(rows[1]).toHaveTextContent('Ana')
    expect(rows[1].querySelector('[aria-label="Offline"]')).not.toBeNull()
  })

  it('shows no dot of "online" for a friend row that carries no presence at all', () => {
    render(<FriendsView lists={lists({ friends: [ana] })} onChange={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Friends' }).querySelector('[aria-label="Online now"]')).toBeNull()
  })
})
