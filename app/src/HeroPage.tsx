import SheetEditor from './characters/SheetEditor.tsx'
// One hero: creation or the editable sheet with durable autosave.
// Guided creation remains VTTER-47 (docs/mockups/).
import { useState } from 'react'
import { characters as heroesApi } from './characters/current.ts'
import type { Hero } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import Link from './Link.tsx'
import { navigate } from './nav.ts'
import NewHero from './NewHero.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

function HeroView({ hero, auth }: { hero: Hero; auth: Auth }) {
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
      <SheetEditor hero={hero} auth={auth} />
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
          : hero.state.data && <HeroView key={id} hero={hero.state.data} auth={auth} />}
    </Shell>
  )
}
