// Public Games anyone can find and join (VTTER-76). Only Games whose GM made them public *and* chose
// to list them appear here; a private or unlisted Game is absent from the index the API reads, so it
// can never show up. Joining uses your own player ID, so the API takes the player from the token.
import { useState } from 'react'
import { ApiError, gamesApi, profileApi } from './api/client.ts'
import type { PublicGame } from './api/types.ts'
import { findBuiltIn } from './adventures/builtIn.ts'
import type { Auth } from './auth/useAuth.ts'
import { heroCountWarning, joinBlocker } from './engine/game.ts'
import Link from './Link.tsx'
import { navigate } from './nav.ts'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

export const NO_PUBLIC_GAMES
  = 'No public Games right now. A Game Master has to make one public and list it before it shows here.'

function adventureName(game: PublicGame): string {
  if (game.adventure.source === 'builtin') return findBuiltIn(game.adventure.id)?.title ?? 'A built-in adventure'
  // A GM's own adventure stays private, so a browser only ever learns that it is the GM's own.
  return "The Game Master's own adventure"
}

function tableSize(game: PublicGame): string {
  const people = `${game.memberCount} ${game.memberCount === 1 ? 'person' : 'people'}`
  const heroes = game.heroCount === 1 ? '1 hero' : `${game.heroCount} heroes`
  return `${people} · ${heroes}`
}

function GameRow({ game, onJoined }: { game: PublicGame; onJoined: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = joinBlocker(game)
  const crowded = heroCountWarning(game.heroCount)

  async function join() {
    setBusy(true)
    setError(null)
    try {
      // Joining needs your own player ID; the API checks it against the token and never trusts the body.
      const me = await profileApi.get()
      await gamesApi.addMember(game.id, me.playerId)
      navigate(`/games/${game.id}`)
    } catch (e) {
      const err = e as ApiError
      // The GM may have unlisted, filled or deleted the Game since the page loaded.
      setError(err.status === 404
        ? 'That Game is no longer open. Refresh the list.'
        : err.message)
      setBusy(false)
      onJoined()
    }
  }

  return (
    <li className="row">
      <b>{game.name}</b>
      <span className="muted">
        {adventureName(game)}
        {' · '}{tableSize(game)}
        {game.gm.displayName && <> · Run by {game.gm.displayName}</>}
      </span>
      {/* Past the recommended party is advice, never a block: the Join button stays enabled (VTTER-76). */}
      {crowded && <span className="fine">{crowded}</span>}
      <span className="row-actions">
        {game.joined
          ? <Link to={{ name: 'game', id: game.id }} className="account-btn">Open</Link>
          : (
            <button
              type="button" className="account-btn primary" disabled={busy || blocked !== null}
              onClick={() => void join()}
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          )}
      </span>
      {blocked && <span className="fine">{blocked}</span>}
      {error && <span className="notice error" role="alert">{error}</span>}
    </li>
  )
}

export default function BrowseGames({ auth }: { auth: Auth }) {
  // The first page. "Show more" appends later pages, so earlier rows stay put while reading.
  const first = useLoad(() => gamesApi.listPublic())
  const [more, setMore] = useState<PublicGame[]>([])
  const [cursor, setCursor] = useState<string | null | undefined>(undefined)
  const [paging, setPaging] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const page = first.state.status === 'ready' ? first.state.data : null
  const games = page ? [...page.games, ...more] : []
  // Undefined until the first "Show more": until then the first page's own cursor is the live one.
  const next = cursor === undefined ? page?.cursor ?? null : cursor

  function reload() {
    setMore([])
    setCursor(undefined)
    setPageError(null)
    first.reload()
  }

  async function showMore() {
    if (!next) return
    setPaging(true)
    setPageError(null)
    try {
      const got = await gamesApi.listPublic(next)
      setMore(prev => [...prev, ...got.games])
      setCursor(got.cursor)
    } catch (e) {
      setPageError((e as Error).message)
    } finally {
      setPaging(false)
    }
  }

  return (
    <Shell auth={auth}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Open tables</p>
          <h1>Browse games</h1>
        </div>
        <button type="button" className="account-btn" onClick={reload}>Refresh</button>
      </header>

      <section className="panel" aria-label="Public Games">
        {first.state.status !== 'ready'
          ? <LoadState state={first.state} reload={first.reload} what="public Games" />
          : games.length === 0
            ? <p className="muted">{NO_PUBLIC_GAMES}</p>
            : (
              <>
                <ul className="rows">
                  {games.map(g => <GameRow key={g.id} game={g} onJoined={reload} />)}
                </ul>
                {next && (
                  <p className="see-all">
                    <button type="button" className="link-btn" disabled={paging} onClick={() => void showMore()}>
                      {paging ? 'Loading…' : 'Show more'}
                    </button>
                  </p>
                )}
                {pageError && <p className="notice error" role="alert">{pageError}</p>}
              </>
            )}
        <p className="fine">
          Running a Game? Make it public and list it from its own page to see it here.
          Your own Games are on <Link to="/">Home</Link>.
        </p>
      </section>
    </Shell>
  )
}
