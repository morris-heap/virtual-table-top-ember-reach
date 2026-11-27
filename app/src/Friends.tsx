// Your friends (VTTER-73): add a player by their player ID, answer requests, and read the adventures
// friends shared with you. A friendship is mutual and starts as a request the other player accepts.
import { useEffect, useState, type FormEvent } from 'react'
import { friendsApi } from './api/client.ts'
import type { Friend, FriendLists, Person } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import { levelRange } from './engine/adventure.ts'
import { FRIEND_LIMITS, personName } from './engine/friends.ts'
import { cleanPlayerId } from './engine/game.ts'
import { HEARTBEAT_MS, onlineFirst, presenceText } from './engine/presence.ts'
import Link from './Link.tsx'
import PresenceDot from './PresenceDot.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

/** The adventures one friend shared, loaded when you open the list. */
function SharedAdventures({ person }: { person: Person }) {
  const shared = useLoad(() => friendsApi.adventures(person.playerId), [person.playerId])
  if (shared.state.status !== 'ready') return <LoadState state={shared.state} reload={shared.reload} what="their adventures" />
  if (shared.state.data.length === 0) return <p className="muted">{personName(person)} hasn't shared an adventure with friends yet.</p>
  return (
    <ul className="rows">
      {shared.state.data.map(a => (
        <li key={a.id} className="row">
          <Link to={{ name: 'friendAdventure', playerId: person.playerId, id: a.id }}><b>{a.title}</b></Link>
          <span className="muted">{levelRange(a)}</span>
        </li>
      ))}
    </ul>
  )
}

function FriendRow({ person, busy, onRemove }: { person: Friend; busy: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="row">
      <span className="friend-line">
        <PresenceDot online={!!person.online} />
        <b>{personName(person)}</b>
      </span>
      <span className="muted">{person.playerId}</span>
      <span className="muted">
        {presenceText(person)}
        {person.online && person.game && <>{' · '}<Link to={{ name: 'game', id: person.game.id }}>Open</Link></>}
      </span>
      <span className="row-actions">
        <Link to={{ name: 'chat', playerId: person.playerId }} className="account-btn primary" aria-label={`Chat with ${personName(person)}`}>
          Chat{person.unread && <span className="unread-dot" role="img" aria-label="New messages" />}
        </Link>
        <button type="button" className="account-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide adventures' : 'Adventures'}
        </button>
        <button type="button" className="account-btn" disabled={busy} aria-label={`Remove ${personName(person)}`} onClick={onRemove}>Remove</button>
      </span>
      {open && <div className="row-detail"><SharedAdventures person={person} /></div>}
    </li>
  )
}

/** The whole screen, given the lists, so a test can render it without the network. */
export function FriendsView({ lists, onChange }: { lists: FriendLists; onChange: (l: FriendLists) => void }) {
  const [playerId, setPlayerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ask = (id: string) => run(async () => onChange(await friendsApi.request(id)))
  const drop = (id: string) => run(async () => {
    await friendsApi.remove(id)
    onChange(await friendsApi.list())
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const id = cleanPlayerId(playerId)
    if (!id) return setError('That is not a player ID. They look like EMBER-7K2Q9F.')
    void ask(id).then(() => setPlayerId(''))
  }

  return (
    <>
      <section className="panel" aria-labelledby="add-title">
        <h2 id="add-title">Add a friend</h2>
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Their player ID</span>
            <input value={playerId} placeholder="EMBER-7K2Q9F" autoComplete="off" onChange={e => setPlayerId(e.target.value)} />
            <small className="muted">
              They find theirs on their Profile page. They have to accept before you are friends.
              You can have {FRIEND_LIMITS.maxOutgoing} requests waiting at once.
            </small>
          </label>
          <div className="form-actions">
            <button type="submit" className="account-btn primary" disabled={busy || playerId.trim() === ''}>Send request</button>
          </div>
        </form>
        {error && <p className="notice error" role="alert">{error}</p>}
      </section>

      {lists.incoming.length > 0 && (
        <section className="panel" aria-labelledby="incoming-title">
          <h2 id="incoming-title">Requests for you</h2>
          <ul className="rows">
            {lists.incoming.map(p => (
              <li key={p.playerId} className="row">
                <b>{personName(p)}</b>
                <span className="muted">{p.playerId}</span>
                <span className="row-actions">
                  <button type="button" className="account-btn primary" disabled={busy} aria-label={`Accept ${personName(p)}`} onClick={() => void ask(p.playerId)}>Accept</button>
                  <button type="button" className="account-btn" disabled={busy} aria-label={`Decline ${personName(p)}`} onClick={() => void drop(p.playerId)}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-labelledby="friends-title">
        <h2 id="friends-title">Friends</h2>
        {lists.friends.length === 0
          ? <p className="muted">No friends yet. Send a request with their player ID, and share yours from your <Link to="/profile">Profile</Link>.</p>
          : (
            <ul className="rows">
              {lists.friends.map(p => (
                <FriendRow
                  key={p.playerId} person={p} busy={busy}
                  onRemove={() => {
                    if (window.confirm(`Remove ${personName(p)} from your friends? They stop seeing the adventures you share with friends.`)) void drop(p.playerId)
                  }}
                />
              ))}
            </ul>
          )}
      </section>

      {lists.outgoing.length > 0 && (
        <section className="panel" aria-labelledby="outgoing-title">
          <h2 id="outgoing-title">Waiting for an answer</h2>
          <ul className="rows">
            {lists.outgoing.map(p => (
              <li key={p.playerId} className="row">
                <b>{personName(p)}</b>
                <span className="muted">{p.playerId}</span>
                <span className="row-actions">
                  <button type="button" className="account-btn" disabled={busy} aria-label={`Cancel request to ${personName(p)}`} onClick={() => void drop(p.playerId)}>Cancel</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * Re-reads the friends list every heartbeat while the tab is visible, so the dots stay honest. `onList` gets
 * each fresh list. A failed read keeps the last list on screen and the next tick tries again.
 */
function useFriendsRefresh(enabled: boolean, onList: (l: FriendLists) => void) {
  useEffect(() => {
    if (!enabled) return
    let live = true
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      Promise.resolve().then(() => friendsApi.list()).then(l => { if (live) onList(l) }, () => {})
    }, HEARTBEAT_MS)
    return () => { live = false; clearInterval(timer) }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [enabled])
}

/** Home: friends who are online right now, with a way in. Hidden when nobody is, so it never adds empty noise. */
export function FriendsOnline() {
  const [online, setOnline] = useState<Friend[]>([])
  const keep = (l: FriendLists) => setOnline(onlineFirst(l.friends).filter(f => f.online))
  useEffect(() => {
    let live = true
    Promise.resolve().then(() => friendsApi.list()).then(l => { if (live) keep(l) }, () => {})
    return () => { live = false }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])
  useFriendsRefresh(true, keep)
  if (online.length === 0) return null
  return (
    <section className="panel" aria-labelledby="online-title">
      <div className="panel-head">
        <h2 id="online-title">Friends online</h2>
        <Link to="/friends" className="account-btn">All friends</Link>
      </div>
      <ul className="rows">
        {online.map(f => (
          <li key={f.playerId} className="row">
            <span className="friend-line"><PresenceDot online /><b>{personName(f)}</b></span>
            <span className="muted">
              {presenceText(f)}
              {f.game && <>{' · '}<Link to={{ name: 'game', id: f.game.id }}>Open</Link></>}
            </span>
            <span className="row-actions">
              <Link to={{ name: 'chat', playerId: f.playerId }} className="account-btn">Chat</Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Friends({ auth }: { auth: Auth }) {
  const lists = useLoad(friendsApi.list)
  useFriendsRefresh(lists.state.status === 'ready', lists.set)
  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow">Play together</p>
        <h1>Friends</h1>
      </header>
      {lists.state.status !== 'ready'
        ? <LoadState state={lists.state} reload={lists.reload} what="your friends" />
        : <FriendsView lists={lists.state.data} onChange={lists.set} />}
    </Shell>
  )
}
