// A built-in adventure, read-only (VTTER-71). Playing one, solo or with a GM, comes with Games (VTTER-72).
import type { Auth } from './auth/useAuth.ts'
import { findBuiltIn } from './adventures/builtIn.ts'
import { levelRange, sceneLabel } from './engine/adventure.ts'
import Link from './Link.tsx'
import Shell from './Shell.tsx'

export default function AdventureView({ auth, slug }: { auth: Auth; slug: string }) {
  const a = findBuiltIn(slug)
  if (!a) {
    return (
      <Shell auth={auth}>
        <p className="notice error" role="alert">We couldn't find that adventure. <Link to="/">Back to Home</Link></p>
      </Shell>
    )
  }
  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow">Built-in adventure</p>
        <h1>{a.title}</h1>
        <p className="sub">{levelRange(a)} · {a.hours} hours{a.soloPlayable && ' · can be played solo, no Game Master needed'}</p>
      </header>

      <section className="panel" aria-label="Summary">
        <p>{a.summary}</p>
        <p className="muted">Playing this adventure is coming soon.</p>
      </section>

      <section className="panel" aria-labelledby="scenes-title">
        <h2 id="scenes-title">Scenes</h2>
        <ol className="scenes">
          {a.scenes.map(s => (
            <li key={s.id} className="scene">
              <div className="scene-head"><b>{s.title}</b> <span className="chip-tag">{sceneLabel(s.type)}</span></div>
              <p>{s.text}</p>
              {s.foes.length > 0 && <p className="muted">Foes: {s.foes.join(', ')}</p>}
            </li>
          ))}
        </ol>
      </section>

      {a.hooks.length > 0 && (
        <section className="panel" aria-labelledby="hooks-title">
          <h2 id="hooks-title">Follow-up hooks</h2>
          <ul>{a.hooks.map(h => <li key={h}>{h}</li>)}</ul>
        </section>
      )}

      <p><Link to="/" className="account-btn">Back</Link></p>
    </Shell>
  )
}
