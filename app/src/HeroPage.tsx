// One hero: the New hero form for `new`, otherwise a short view of the saved sheet.
// The full character sheet and guided creation are VTTER-47 (docs/mockups/).
import { useState } from 'react'
import core from '../../data/core.json'
import { heroesApi } from './api/client.ts'
import type { Hero } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import Link from './Link.tsx'
import { navigate } from './nav.ts'
import NewHero from './NewHero.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

function HeroView({ hero }: { hero: Hero }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onDelete() {
    if (!window.confirm(`Delete “${hero.name}”? This can't be undone.`)) return
    setBusy(true)
    try {
      await heroesApi.remove(hero.id)
      navigate('/heroes', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <header>
        <p className="eyebrow">Level {hero.level}{hero.ancestry && ` · ${hero.ancestry}`}{hero.calling && ` ${hero.calling}`}</p>
        <h1>{hero.name}</h1>
      </header>
      <section className="panel" aria-labelledby="attr-title">
        <h2 id="attr-title">Attributes</h2>
        <dl className="stat-grid">
          {core.attributes.map(a => {
            const v = hero.attributes[a.toLowerCase() as keyof Hero['attributes']] ?? 0
            return <div key={a}><dt>{a}</dt><dd>{v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'}</dd></div>
          })}
          <div><dt>Grit</dt><dd>{hero.grit}</dd></div>
          <div><dt>Ember</dt><dd>{hero.ember}</dd></div>
        </dl>
        <p className="fine">Guided setup of attributes, skills and gear is coming soon.</p>
      </section>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <Link to="/heroes" className="account-btn">All heroes</Link>
        <button type="button" className="account-btn danger" disabled={busy} onClick={() => void onDelete()}>Delete hero</button>
      </div>
    </>
  )
}

export default function HeroPage({ auth, id }: { auth: Auth; id: string }) {
  const isNew = id === 'new'
  const hero = useLoad(() => (isNew ? Promise.resolve(null) : heroesApi.get(id)), [id])

  return (
    <Shell auth={auth}>
      {isNew
        ? (
          <>
            <header>
              <p className="eyebrow">New hero</p>
              <h1>Make a hero</h1>
            </header>
            <section className="panel">
              <NewHero onCreated={h => navigate(`/heroes/${h.id}`, { replace: true })} onCancel={() => navigate('/heroes')} />
            </section>
          </>
        )
        : hero.state.status !== 'ready'
          ? <LoadState state={hero.state} reload={hero.reload} what="the hero" />
          : hero.state.data && <HeroView hero={hero.state.data} />}
    </Shell>
  )
}
