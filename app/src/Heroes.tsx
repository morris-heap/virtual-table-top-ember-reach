import HeroTools from './characters/HeroTools.tsx'
// All your heroes, and the way to make a new one. Home shows the most recent few with HeroRows.
import { characters as heroesApi } from './characters/current.ts'
import type { HeroSummary } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import { portraitApi } from './characters/portrait.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

/** Your portraits keyed by hero id, in one request. Empty when signed out or if it fails: a list never needs them. */
function usePortraits(): Record<string, string> {
  const loaded = useLoad(() => portraitApi.urls().catch(() => ({}) as Record<string, string>))
  return loaded.state.status === 'ready' ? loaded.state.data : {}
}

export function HeroRows({ heroes }: { heroes: HeroSummary[] }) {
  const portraits = usePortraits()
  return (
    <ul className="rows">
      {heroes.map(h => (
        <li key={h.id} className={portraits[h.id] ? 'row has-portrait' : 'row'}>
          {portraits[h.id] && <img className="row-portrait" src={portraits[h.id]} alt="" />}
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
      <HeroTools auth={auth} reload={heroes.reload} />
    </Shell>
  )
}
