// Built-in adventures and the ones you wrote (VTTER-71), each with its Game buttons (VTTER-72).
// Home shows your most recent few with AdventureRows.
import { adventuresApi, profileApi } from './api/client.ts'
import type { AdventureSummary } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import { BUILT_IN } from './adventures/builtIn.ts'
import { levelRange } from './engine/adventure.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import StartGame from './StartGame.tsx'
import { useLoad } from './useLoad.ts'

export function AdventureRows({ adventures, isGm }: { adventures: AdventureSummary[]; isGm: boolean }) {
  return (
    <ul className="rows">
      {adventures.map(a => (
        <li key={a.id} className="row">
          <Link to={{ name: 'adventure', id: a.id }}><b>{a.title}</b></Link>
          <span className="muted">{levelRange(a)}</span>
          <StartGame adventure={{ source: 'own', id: a.id }} title={a.title} canSolo={false} isGm={isGm} />
        </li>
      ))}
    </ul>
  )
}

export const NO_ADVENTURES = "You haven't written an adventure yet. Only you can see the ones you write."

export default function Adventures({ auth }: { auth: Auth }) {
  const adventures = useLoad(adventuresApi.list)
  const profile = useLoad(profileApi.get)
  // A Game Master sees "Create game". Until the profile loads, show the player view.
  const isGm = profile.state.status === 'ready' && profile.state.data.gameMaster

  return (
    <Shell auth={auth}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Play or write</p>
          <h1>Adventures</h1>
        </div>
        <Link to={{ name: 'adventure', id: 'new' }} className="account-btn primary">New adventure</Link>
      </header>

      <section className="panel" aria-labelledby="builtin-title">
        <h2 id="builtin-title">Built-in</h2>
        <ul className="rows">
          {BUILT_IN.map(a => (
            <li key={a.id} className="row">
              <Link to={{ name: 'builtIn', slug: a.id }}><b>{a.title}</b></Link>
              <span className="muted">{levelRange(a)} · {a.hours} hours{a.soloPlayable && ' · solo or with a GM'}</span>
              <StartGame adventure={{ source: 'builtin', id: a.id }} title={a.title} canSolo={a.soloPlayable} isGm={isGm} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="yours-title">
        <h2 id="yours-title">Yours <span className="chip-tag">Private</span></h2>
        {adventures.state.status !== 'ready'
          ? <LoadState state={adventures.state} reload={adventures.reload} what="your adventures" />
          : adventures.state.data.length === 0
            ? <p className="muted">{NO_ADVENTURES}</p>
            : <AdventureRows adventures={[...adventures.state.data].sort((a, b) => a.title.localeCompare(b.title))} isGm={isGm} />}
      </section>
    </Shell>
  )
}
