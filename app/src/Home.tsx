import HeroTools from './characters/HeroTools.tsx'
import { characters as heroesApi } from './characters/current.ts'
// Home for a signed-in player (VTTER-71): your Games, then your most recent heroes and adventures.
// The full lists live on their own screens: /heroes (Heroes.tsx) and /adventures (Adventures.tsx).
import core from '../../data/core.json'
import { adventuresApi, gamesApi, profileApi } from './api/client.ts'
import type { Auth } from './auth/useAuth.ts'
import { AdventureRows, NO_ADVENTURES } from './Adventures.tsx'
import { HeroRows, NO_HEROES } from './Heroes.tsx'
import Link from './Link.tsx'
import { recentFirst } from './recent.ts'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

/** How many heroes and adventures Home shows before "See all". */
const RECENT = 3

function SeeAll({ to, total, what }: { to: string; total: number; what: string }) {
  return total > RECENT ? <p className="see-all"><Link to={to}>See all {total} {what}</Link></p> : null
}

export default function Home({ auth, name }: { auth: Auth; name: string }) {
  const heroes = useLoad(heroesApi.list)
  const adventures = useLoad(adventuresApi.list)
  const profile = useLoad(profileApi.get)
  const games = useLoad(gamesApi.list)

  // A Game Master sees the GM tools. Until the profile loads, show the player view.
  const isGm = profile.state.status === 'ready' && profile.state.data.gameMaster
  const shownName = (profile.state.status === 'ready' && profile.state.data.displayName) || name

  return (
    <Shell auth={auth} wide>
      <header>
        <p className="eyebrow">Emberreach · v{core.version}</p>
        <h1>Welcome, {shownName}</h1>
      </header>

      <section className="panel" aria-labelledby="games-title">
        <div className="panel-head">
          <h2 id="games-title">Games</h2>
          {/* Public Games anyone can join (VTTER-76). Open to players and GMs alike. */}
          <Link to="/games" className="account-btn">Browse games</Link>
        </div>
        {games.state.status !== 'ready'
          ? <LoadState state={games.state} reload={games.reload} what="your Games" />
          : games.state.data.length === 0
            ? (
              <p className="muted">
                No Games yet. Pick “Play solo” on a built-in <Link to="/adventures">adventure</Link> to start one alone
                {isGm ? ', or “Create game” to run one for friends.' : <>. To run one for friends, turn on Game Master in <Link to="/profile">Settings</Link>.</>}
                {' '}You can also <Link to="/games">browse public Games</Link> to join someone else's table.
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

      <div className="home-grid">
        <section className="panel" aria-labelledby="heroes-title">
          <div className="panel-head">
            <h2 id="heroes-title"><Link to="/heroes" className="heading-link">Heroes</Link></h2>
            <Link to={{ name: 'hero', id: 'new' }} className="account-btn primary">New hero</Link>
          </div>
          {heroes.state.status !== 'ready'
            ? <LoadState state={heroes.state} reload={heroes.reload} what="your heroes" />
            : heroes.state.data.length === 0
              ? <p className="muted">{NO_HEROES}</p>
              : (
                <>
                  <HeroRows heroes={recentFirst(heroes.state.data, RECENT)} />
                  <SeeAll to="/heroes" total={heroes.state.data.length} what="heroes" />
                </>
              )}
          <p className="fine">Rolling a Test? <Link to="/roller">Open the Test roller</Link>.</p>
        </section>

        <section className="panel" aria-labelledby="adv-title">
          <div className="panel-head">
            <h2 id="adv-title"><Link to="/adventures" className="heading-link">Adventures</Link></h2>
            <Link to={{ name: 'adventure', id: 'new' }} className="account-btn primary">New adventure</Link>
          </div>
          {adventures.state.status !== 'ready'
            ? <LoadState state={adventures.state} reload={adventures.reload} what="your adventures" />
            : adventures.state.data.length === 0
              ? <p className="muted">{NO_ADVENTURES}</p>
              : (
                <>
                  <AdventureRows adventures={recentFirst(adventures.state.data, RECENT)} isGm={isGm} />
                  <SeeAll to="/adventures" total={adventures.state.data.length} what="adventures" />
                </>
              )}
          <p className="fine">Want something ready to play? <Link to="/adventures">Browse the built-in adventures</Link>.</p>
        </section>
      </div>
      <HeroTools auth={auth} reload={heroes.reload} />
    </Shell>
  )
}
