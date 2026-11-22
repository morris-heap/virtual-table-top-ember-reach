// Home for a signed-in player (VTTER-71): their Heroes on the left, Adventures on the right.
import core from '../../data/core.json'
import { adventuresApi, heroesApi, profileApi } from './api/client.ts'
import type { Auth } from './auth/useAuth.ts'
import { BUILT_IN } from './adventures/builtIn.ts'
import { levelRange } from './engine/adventure.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

export default function Home({ auth, name }: { auth: Auth; name: string }) {
  const heroes = useLoad(heroesApi.list)
  const adventures = useLoad(adventuresApi.list)
  const profile = useLoad(profileApi.get)

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
                      {isGm && (
                        <span className="row-actions">
                          <button type="button" className="account-btn" disabled title="Creating Games is coming soon">Create game</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
        </section>
      </div>

      <p className="fine">
        Games, where friends play an adventure together, are coming soon.
        {!isGm && <> A Game Master turns on GM tools in <Link to="/profile">Settings</Link>.</>}
      </p>
    </Shell>
  )
}
