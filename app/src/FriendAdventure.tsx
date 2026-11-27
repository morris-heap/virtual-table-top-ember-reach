// An adventure a friend shared with friends (VTTER-73), read-only. The API answers 404 for anyone who isn't
// their friend, for an adventure that isn't shared, and for one that doesn't exist, so all three read the same here.
import { friendsApi } from './api/client.ts'
import type { Auth } from './auth/useAuth.ts'
import { levelRange, sceneLabel } from './engine/adventure.ts'
import AdventureCast, { SceneWho } from './AdventureCast.tsx'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

export default function FriendAdventure({ auth, playerId, id }: { auth: Auth; playerId: string; id: string }) {
  const adventure = useLoad(() => friendsApi.adventure(playerId, id), [playerId, id])
  if (adventure.state.status !== 'ready') {
    return (
      <Shell auth={auth}>
        <LoadState state={adventure.state} reload={adventure.reload} what="the adventure" />
        <p><Link to="/friends" className="account-btn">Back to friends</Link></p>
      </Shell>
    )
  }
  const a = adventure.state.data
  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow">Shared by a friend · {playerId}</p>
        <h1>{a.title}</h1>
        <p className="sub">{levelRange(a)}</p>
      </header>

      {a.summary && <section className="panel" aria-label="Summary"><p>{a.summary}</p></section>}

      <section className="panel" aria-labelledby="scenes-title">
        <h2 id="scenes-title">Scenes</h2>
        <ol className="scenes">
          {a.scenes.map(s => (
            <li key={s.id} className="scene">
              <div className="scene-head"><b>{s.title}</b> <span className="chip-tag">{sceneLabel(s.type)}</span></div>
              <p>{s.text}</p>
              <SceneWho scene={s} enemies={a.enemies} npcs={a.npcs} />
            </li>
          ))}
        </ol>
      </section>

      <AdventureCast enemies={a.enemies} npcs={a.npcs} />

      {a.hooks.length > 0 && (
        <section className="panel" aria-labelledby="hooks-title">
          <h2 id="hooks-title">Follow-up hooks</h2>
          <ul>{a.hooks.map(h => <li key={h}>{h}</li>)}</ul>
        </section>
      )}

      <p><Link to="/friends" className="account-btn">Back to friends</Link></p>
    </Shell>
  )
}
