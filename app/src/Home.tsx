// Home for a signed-in player (VTTER-71): their Heroes on the left, Adventures on the right.
import core from '../../data/core.json'
import { adventuresApi, gamesApi, heroesApi, profileApi } from './api/client.ts'
import type { Auth } from './auth/useAuth.ts'
import { BUILT_IN } from './adventures/builtIn.ts'
import { levelRange } from './engine/adventure.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import StartGame from './StartGame.tsx'
import { useLoad } from './useLoad.ts'

export default function Home({ auth, name }: { auth: Auth; name: string }) {
  const heroes = useLoad(heroesApi.list)
  const adventures = useLoad(adventuresApi.list)
  const profile = useLoad(profileApi.get)
  const games = useLoad(gamesApi.list)

  // A Game Master sees the GM tools on their adventures. Until the profile loads, show the player view.
  const isGm = profile.state.status === 'ready' && profile.state.data.gameMaster
  const shownName = (profile.state.status === 'ready' && profile.state.data.displayName) || name

  return (
    <Shell auth={auth} wide>
      <header>
        <p className="eyebrow">Emberreach · v{core.version}</p>
        <h1>Welcome, {shownName}</h1>
      </header>

      <div className="home-grid">
        <section className="panel" aria-labelledby="heroes-title">
          <div className="panel-head">
            <h2 id="heroes-title">Heroes</h2>
            <button type="button" className="account-btn" disabled title="Guided hero creation is coming soon">New hero</button>
          </div>
          {heroes.state.status !== 'ready'
            ? <LoadState state={heroes.state} reload={heroes.reload} what="your heroes" />
            : heroes.state.data.length === 0
              ? <p className="muted">No heroes yet. Guided hero creation is coming soon.</p>
              : (
                <ul className="rows">
                  {heroes.state.data.map(h => (
                    <li key={h.id} className="row">
                      <b>{h.name}</b>
                      <span className="muted">Level {h.level}{h.ancestry && ` · ${h.ancestry}`}{h.calling && ` ${h.calling}`}</span>
                    </li>
                  ))}
                </ul>
              )}
          <p className="fine">Rolling a Test? <Link to="/roller">Open the Test roller</Link>.</p>
        </section>

        <section className="panel" aria-labelledby="adv-title">
          <div className="panel-head">
            <h2 id="adv-title">Adventures</h2>
            <Link to={{ name: 'adventure', id: 'new' }} className="account-btn primary">New adventure</Link>
          </div>

          <h3 className="group-title">Built-in</h3>
          <ul className="rows">
            {BUILT_IN.map(a => (
              <li key={a.id} className="row">
                <Link to={{ name: 'builtIn', slug: a.id }}><b>{a.title}</b></Link>
                <span className="muted">{levelRange(a)} · {a.hours} hours{a.soloPlayable && ' · solo or with a GM'}</span>
                <StartGame adventure={{ source: 'builtin', id: a.id }} title={a.title} canSolo={a.soloPlayable} isGm={isGm} />
              </li>
            ))}
          </ul>

          <h3 className="group-title">Yours <span className="chip-tag">Private</span></h3>
          {adventures.state.status !== 'ready'
            ? <LoadState state={adventures.state} reload={adventures.reload} what="your adventures" />
            : adventures.state.data.length === 0
              ? <p className="muted">You haven't written an adventure yet. Only you can see the ones you write.</p>
              : (
                <ul className="rows">
                  {adventures.state.data.map(a => (
                    <li key={a.id} className="row">
                      <Link to={{ name: 'adventure', id: a.id }}><b>{a.title}</b></Link>
                      <span className="muted">{levelRange(a)}</span>
                      <StartGame adventure={{ source: 'own', id: a.id }} title={a.title} canSolo={false} isGm={isGm} />
                    </li>
                  ))}
                </ul>
              )}
        </section>
      </div>

      <section className="panel" aria-labelledby="games-title">
        <div className="panel-head"><h2 id="games-title">Games</h2></div>
        {games.state.status !== 'ready'
          ? <LoadState state={games.state} reload={games.reload} what="your Games" />
          : games.state.data.length === 0
            ? (
              <p className="muted">
                No Games yet. Pick “Play solo” on a built-in adventure to start one alone
                {isGm ? ', or “Create game” to run one for friends.' : <>. To run one for friends, turn on Game Master in <Link to="/profile">Settings</Link>.</>}
              </p>
            )
            : (
              <ul className="rows">
                {games.state.data.map(g => (
                  <li key={g.id} className="row">
                    <Link to={{ name: 'game', id: g.id }}><b>{g.name}</b></Link>
                    <span className="muted">
                      {g.solo ? 'Solo' : `${g.role === 'gm' ? 'You run it' : 'You play'} · ${g.memberCount} ${g.memberCount === 1 ? 'person' : 'people'}`}
                      {' · '}{g.visibility === 'public' ? 'Public' : 'Private'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </Shell>
  )
}
