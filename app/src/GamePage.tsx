// One Game (VTTER-72): its adventure, who is at the table, and the GM's controls (invite, public or private, delete).
// Anyone who is not in the Game sees a Join button: it works for a public Game and is refused for a private one.
import { useState, type FormEvent } from 'react'
import { ApiError, gamesApi, profileApi } from './api/client.ts'
// Heroes come from the offline-capable repository (VTTER-56), so the picker works offline too.
import { characterRepository, characters } from './characters/current.ts'
import type { Game, GameDraft, GameMember, HeroSummary } from './api/types.ts'
import { findBuiltIn } from './adventures/builtIn.ts'
import type { Auth } from './auth/useAuth.ts'
import { levelRange, sceneLabel } from './engine/adventure.ts'
import { cleanPlayerId, gameLink, GAME_LIMITS, memberName, partyWarning } from './engine/game.ts'
import { navigate } from './nav.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

type Found = { kind: 'game'; game: Game } | { kind: 'outsider' }

/** A Game you are not in answers 404, which means "not yours to read", so show the Join screen instead of an error. */
async function load(id: string): Promise<Found> {
  try {
    return { kind: 'game', game: await gamesApi.get(id) }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: 'outsider' }
    throw e
  }
}

function draftOf(g: Game, patch: Partial<GameDraft> = {}): GameDraft {
  return { name: g.name, adventure: g.adventure, visibility: g.visibility, solo: g.solo, ...patch }
}

function AdventureBlock({ game }: { game: Game }) {
  const own = game.adventureContent
  const builtIn = game.adventure.source === 'builtin' ? findBuiltIn(game.adventure.id) : undefined
  const a = own ?? builtIn
  if (!a) return <p className="muted">The adventure for this Game is no longer available.</p>
  return (
    <>
      <p><b>{a.title}</b> <span className="muted">{levelRange(a)}</span></p>
      <p>{a.summary}</p>
      <ol className="scenes">
        {a.scenes.map(s => (
          <li key={s.id} className="scene">
            <div className="scene-head"><b>{s.title}</b> <span className="chip-tag">{sceneLabel(s.type)}</span></div>
            {/* Players read the same scenes the GM wrote. GM-only notes arrive with the story designer (VTTER-75). */}
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </>
  )
}

/** What a member brought to the table. Read-only for everyone: only the owner can change it, below. */
function HeroLine({ member }: { member: GameMember }) {
  if (!member.hero) return <span className="muted">No hero yet</span>
  const h = member.hero
  return <span className="muted">{h.name} · level {h.level} {h.ancestry} {h.calling}</span>
}

/**
 * The signed-in member picks one of their own heroes (VTTER-77). The API takes the player from the
 * token, so this can only ever change your own hero.
 */
function MyHero({ game, onChange }: { game: Game; onChange: (g: Game) => void }) {
  const heroes = useLoad(characters.list)
  const mine = game.members.find(m => m.mine)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!mine) return null

  function pick(heroId: string) {
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        if (heroId === '') {
          onChange(await gamesApi.clearHero(game.id))
          return
        }
        // The hero list is offline-capable (VTTER-56), so it can include a hero the API has never
        // seen. Upload anything pending first, or the Game would reject an id that isn't there yet.
        await characterRepository().flush()
        onChange(await gamesApi.setHero(game.id, heroId))
      } catch (e) {
        const err = e as ApiError
        setError(err.status === 404
          ? "That hero hasn't finished syncing yet. Wait for it to save, then try again."
          : err.message)
      } finally {
        setBusy(false)
      }
    })()
  }

  const list: HeroSummary[] = heroes.state.status === 'ready' ? heroes.state.data : []

  return (
    <section className="panel" aria-labelledby="my-hero-title">
      <h2 id="my-hero-title">Your hero</h2>
      {heroes.state.status === 'error'
        ? <p className="notice error" role="alert">Couldn't load your heroes. {heroes.state.message}</p>
        : list.length === 0 && heroes.state.status === 'ready'
          ? (
            <p className="muted">
              You have no heroes yet. <Link to="/heroes/new">Create one</Link> to bring it to this Game.
            </p>
          )
          : (
            <label className="field">
              <span>Bring a hero to this Game</span>
              <select
                value={mine.hero?.id ?? ''} disabled={busy || heroes.state.status === 'loading'}
                onChange={e => pick(e.target.value)}
              >
                <option value="">No hero</option>
                {/* A hero deleted after being chosen is gone from this list, so keep the slot selectable. */}
                {mine.hero && !list.some(h => h.id === mine.hero!.id) && (
                  <option value={mine.hero.id}>{mine.hero.name} (deleted)</option>
                )}
                {list.map(h => (
                  <option key={h.id} value={h.id}>{h.name} — level {h.level} {h.ancestry} {h.calling}</option>
                ))}
              </select>
              <small className="muted">Only you can change this. The rest of the table sees it read-only.</small>
            </label>
          )}
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  )
}

function GameScreen({ game, myPlayerId, onChange, onGone }: {
  game: Game; myPlayerId: string; onChange: (g: Game) => void; onGone: () => void
}) {
  const isGm = game.role === 'gm'
  const [name, setName] = useState(game.name)
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const save = (patch: Partial<GameDraft>) => run(async () => onChange(await gamesApi.save(game.id, draftOf(game, patch))))

  function onInvite(e: FormEvent) {
    e.preventDefault()
    const id = cleanPlayerId(invite)
    if (!id) return setError('That is not a player ID. They look like EMBER-7K2Q9F.')
    void run(async () => {
      onChange(await gamesApi.addMember(game.id, id))
      setInvite('')
    })
  }

  const link = gameLink(window.location.origin, game.id)
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link is selectable on screen.
    }
  }

  const warning = partyWarning(game.members)

  return (
    <>
      <header>
        <p className="eyebrow">{game.solo ? 'Solo Game' : isGm ? 'Game · you are the Game Master' : 'Game · you are a player'}</p>
        <h1>{game.name}</h1>
      </header>

      <section className="panel" aria-labelledby="adv-title">
        <h2 id="adv-title">Adventure</h2>
        <AdventureBlock game={game} />
        <p className="muted">Playing the scenes, with Tests, turns and your hero, comes in a later release.</p>
      </section>

      {/* Outside the roster, so a solo Game can bring a hero too. */}
      <MyHero game={game} onChange={onChange} />

      {!game.solo && (
        <section className="panel" aria-labelledby="table-title">
          <h2 id="table-title">At the table</h2>
          <ul className="rows">
            {game.members.map(m => (
              <li key={m.playerId || m.displayName} className="row">
                <b>{memberName(m)}</b>
                <span className="muted">{m.role === 'gm' ? 'Game Master' : 'Player'} · {m.playerId}</span>
                <HeroLine member={m} />
                {m.role === 'player' && (isGm || m.playerId === myPlayerId) && (
                  <span className="row-actions">
                    <button
                      type="button" className="account-btn" disabled={busy}
                      onClick={() => void run(async () => {
                        await gamesApi.removeMember(game.id, m.playerId)
                        if (m.playerId === myPlayerId) onGone()
                        else onChange(await gamesApi.get(game.id))
                      })}
                    >
                      {m.playerId === myPlayerId ? 'Leave' : 'Remove'}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {warning && <p className="notice" role="status">{warning}</p>}
          <p className="fine">Up to {GAME_LIMITS.maxMembers} people can join one Game.</p>
        </section>
      )}

      {isGm && !game.solo && (
        <section className="panel" aria-labelledby="gm-title">
          <h2 id="gm-title">Game Master</h2>
          <form className="form" onSubmit={e => { e.preventDefault(); void save({ name: name.trim() || game.name }) }}>
            <label className="field">
              <span>Game name</span>
              <input value={name} maxLength={GAME_LIMITS.nameMax} onChange={e => setName(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="submit" className="account-btn" disabled={busy || name.trim() === game.name || name.trim() === ''}>Save name</button>
            </div>
          </form>

          <form className="form" onSubmit={onInvite}>
            <label className="field">
              <span>Invite a player</span>
              <input value={invite} placeholder="EMBER-7K2Q9F" autoComplete="off" onChange={e => setInvite(e.target.value)} />
              <small className="muted">Ask them for the player ID on their Profile page. They are added right away.</small>
            </label>
            <div className="form-actions">
              <button type="submit" className="account-btn primary" disabled={busy || invite.trim() === ''}>Invite</button>
            </div>
          </form>

          <label className="check">
            <input
              type="checkbox" checked={game.visibility === 'public'} disabled={busy}
              onChange={e => void save({ visibility: e.target.checked ? 'public' : 'private' })}
            />
            <span>Public: anyone with the link can join</span>
          </label>
          {game.visibility === 'public' && (
            <div className="id-row">
              <code className="player-id">{link}</code>
              <button type="button" className="account-btn" onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          )}
          <p className="muted">Private Games can only be joined by invitation. A list of public Games to browse is planned.</p>
        </section>
      )}

      {isGm && (
        <p>
          <button
            type="button" className="account-btn danger" disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete “${game.name}”? Everyone in it loses access.`)) {
                void run(async () => { await gamesApi.remove(game.id); onGone() })
              }
            }}
          >
            Delete Game
          </button>
        </p>
      )}

      {error && <p className="notice error" role="alert">{error}</p>}
    </>
  )
}

function Outsider({ id, onJoined }: { id: string; onJoined: () => void }) {
  const [state, setState] = useState<'idle' | 'joining' | 'refused'>('idle')
  const [message, setMessage] = useState('')

  async function join() {
    setState('joining')
    try {
      const me = await profileApi.get()
      await gamesApi.addMember(id, me.playerId)
      onJoined()
    } catch (e) {
      setMessage(e instanceof ApiError && e.status === 404 ? 'That Game is private or no longer exists.' : (e as Error).message)
      setState('refused')
    }
  }

  return (
    <section className="panel">
      <h2>Join this Game?</h2>
      <p className="muted">You are not in this Game yet. If it is public, you can join it now.</p>
      <p>
        <button type="button" className="account-btn primary" disabled={state === 'joining'} onClick={() => void join()}>
          {state === 'joining' ? 'Joining…' : 'Join Game'}
        </button>
      </p>
      {state === 'refused' && <p className="notice error" role="alert">{message}</p>}
    </section>
  )
}

export default function GamePage({ auth, id }: { auth: Auth; id: string }) {
  const found = useLoad(() => load(id), [id])
  const profile = useLoad(profileApi.get)

  return (
    <Shell auth={auth}>
      {found.state.status !== 'ready' || profile.state.status !== 'ready'
        ? <LoadState state={found.state.status !== 'ready' ? found.state : (profile.state as { status: 'loading' } | { status: 'error'; message: string })} reload={() => { found.reload(); profile.reload() }} what="the Game" />
        : found.state.data.kind === 'outsider'
          ? <Outsider id={id} onJoined={found.reload} />
          : (
            <GameScreen
              game={found.state.data.game}
              myPlayerId={profile.state.data.playerId}
              onChange={game => found.set({ kind: 'game', game })}
              onGone={() => navigate('/')}
            />
          )}
      <p><Link to="/" className="account-btn">Back to Home</Link></p>
    </Shell>
  )
}
