// All your heroes, and the way to make a new one. Home shows the most recent few with HeroRows.
import { heroesApi } from './api/client.ts'
import type { HeroSummary } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

export function HeroRows({ heroes }: { heroes: HeroSummary[] }) {
  return (
    <ul className="rows">
      {heroes.map(h => (
        <li key={h.id} className="row">
          <Link to={{ name: 'hero', id: h.id }}><b>{h.name}</b></Link>
          <span className="muted">Level {h.level}{h.ancestry && ` · ${h.ancestry}`}{h.calling && ` ${h.calling}`}</span>
        </li>
      ))}
    </ul>
  )
}

export const NO_HEROES = 'No heroes yet. Choose New hero to make your first.'

export default function Heroes({ auth }: { auth: Auth }) {
  const heroes = useLoad(heroesApi.list)
  const sorted = heroes.state.status === 'ready' ? [...heroes.state.data].sort((a, b) => a.name.localeCompare(b.name)) : []

  return (
    <Shell auth={auth}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Your heroes</p>
          <h1>Heroes</h1>
        </div>
        <Link to={{ name: 'hero', id: 'new' }} className="account-btn primary">New hero</Link>
      </header>
      <section className="panel" aria-label="Heroes">
        {heroes.state.status !== 'ready'
          ? <LoadState state={heroes.state} reload={heroes.reload} what="your heroes" />
          : sorted.length === 0
            ? <p className="muted">{NO_HEROES}</p>
            : <HeroRows heroes={sorted} />}
      </section>
    </Shell>
  )
}
