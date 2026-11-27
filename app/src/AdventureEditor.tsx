// Writing an adventure (VTTER-71): a title, a level range, an ordered list of scenes and some follow-up hooks.
// Any signed-in player can write one. It is private to its author until a Game Master shares it with friends (VTTER-73).
import { useState, type FormEvent } from 'react'
import { adventuresApi, profileApi } from './api/client.ts'
import type { AdventureDraft, Visibility } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import {
  addScene, draftOf, emptyAdventure, emptyEnemy, emptyNpc, ENEMY_TIERS, LEVELS, LIMITS, LIVE_VISIBILITIES, moveScene, NPC_ATTITUDES, problems,
  removeEnemy, removeNpc, removeScene, SCENE_TYPES, sceneLabel, setSceneEnemyCount, toggleSceneEnemy, toggleSceneNpc, updateEnemy, updateNpc,
  updateScene, visibilityHelp, visibilityLabel,
} from './engine/adventure.ts'
import { EnemyLibrary, NpcLibrary } from './AdventureLibrary.tsx'
import AdventureImport from './AdventureImport.tsx'
import Link from './Link.tsx'
import { navigate } from './nav.ts'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

const levels = Array.from({ length: LEVELS.max - LEVELS.min + 1 }, (_, i) => LEVELS.min + i)
const lines = (s: string) => s.split('\n')

/** What gets saved: surrounding spaces trimmed, blank traits and hooks dropped. */
function clean(d: AdventureDraft): AdventureDraft {
  const keep = (xs: string[]) => xs.map(x => x.trim()).filter(Boolean)
  return {
    ...d,
    title: d.title.trim(),
    summary: d.summary.trim(),
    scenes: d.scenes.map(s => ({ ...s, title: s.title.trim(), text: s.text.trim() })),
    hooks: keep(d.hooks),
    enemies: d.enemies.map(e => ({ ...e, name: e.name.trim(), damage: e.damage.trim(), moves: e.moves.trim(), traits: keep(e.traits), dread: keep(e.dread) })),
    npcs: d.npcs.map(n => ({ ...n, name: n.name.trim(), role: n.role.trim(), description: n.description.trim(), secret: n.secret.trim() })),
  }
}

type Status = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string }

function EditorForm({ initial, savedId, canShare }: { initial: AdventureDraft; savedId: string | null; canShare: boolean }) {
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<Status>({ status: 'idle' })
  const [showProblems, setShowProblems] = useState(false)
  const issues = problems(clean(draft))
  const busy = status.status === 'saving'
  const set = (patch: Partial<AdventureDraft>) => { setDraft(d => ({ ...d, ...patch })); setStatus({ status: 'idle' }) }
  const change = (next: AdventureDraft) => { setDraft(next); setStatus({ status: 'idle' }) }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (issues.length) return setShowProblems(true)
    setStatus({ status: 'saving' })
    const id = savedId ?? crypto.randomUUID()
    try {
      const saved = await adventuresApi.save(id, clean(draft))
      if (savedId === null) return navigate(`/adventures/${id}`, { replace: true })
      setDraft(draftOf(saved))
      setStatus({ status: 'saved' })
    } catch (err) {
      setStatus({ status: 'error', message: (err as Error).message })
    }
  }

  async function onDelete() {
    if (!savedId || !window.confirm(`Delete “${draft.title || 'this adventure'}”? This can't be undone.`)) return
    setStatus({ status: 'saving' })
    try {
      await adventuresApi.remove(savedId)
      navigate('/', { replace: true })
    } catch (err) {
      setStatus({ status: 'error', message: (err as Error).message })
    }
  }

  return (
    <form className="form" onSubmit={e => void onSubmit(e)}>
      <AdventureImport hasContent={Boolean(draft.title.trim() || draft.scenes.length)} onImport={d => change({ ...d, visibility: draft.visibility })} />
      <section className="panel" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        <label className="field">
          <span>Title</span>
          <input value={draft.title} maxLength={LIMITS.titleMax} onChange={e => set({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>Summary</span>
          <textarea rows={3} value={draft.summary} maxLength={LIMITS.summaryMax} onChange={e => set({ summary: e.target.value })} />
        </label>
        <div className="grid">
          <label className="field">
            <span>Lowest level</span>
            <select value={draft.levelMin} onChange={e => set({ levelMin: Number(e.target.value) })}>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Highest level</span>
            <select value={draft.levelMax} onChange={e => set({ levelMax: Number(e.target.value) })}>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Who can read it</span>
          {/* Sharing is a Game Master feature (ADR 0005). An adventure already shared stays readable and editable. */}
          <select
            value={draft.visibility} disabled={!canShare && draft.visibility === 'private'}
            onChange={e => set({ visibility: e.target.value as Visibility })}
          >
            {LIVE_VISIBILITIES.map(v => <option key={v} value={v}>{visibilityLabel(v)}</option>)}
          </select>
          <small className="muted">
            {visibilityHelp(draft.visibility)}
            {!canShare && draft.visibility === 'private' && <> Turn on Game Master in your <Link to="/profile">Profile</Link> to share adventures with friends.</>}
          </small>
        </label>
      </section>

      <section className="panel" aria-labelledby="scenes-title">
        <h2 id="scenes-title">Scenes</h2>
        {draft.scenes.length === 0 && <p className="muted">No scenes yet. A scene is one step of the story: a talk, a climb, a trap, a fight.</p>}
        <ol className="scenes">
          {draft.scenes.map((s, i) => (
            <li key={s.id} className="scene">
              <div className="scene-head">
                <b>Scene {i + 1}</b>
                <span className="row-actions">
                  <button type="button" className="account-btn" aria-label={`Move scene ${i + 1} up`} disabled={i === 0} onClick={() => change(moveScene(draft, s.id, -1))}>↑</button>
                  <button type="button" className="account-btn" aria-label={`Move scene ${i + 1} down`} disabled={i === draft.scenes.length - 1} onClick={() => change(moveScene(draft, s.id, 1))}>↓</button>
                  <button type="button" className="account-btn" aria-label={`Remove scene ${i + 1}`} onClick={() => change(removeScene(draft, s.id))}>Remove</button>
                </span>
              </div>
              <div className="grid">
                <label className="field">
                  <span>Title</span>
                  <input value={s.title} maxLength={LIMITS.titleMax} onChange={e => change(updateScene(draft, s.id, { title: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Kind of scene</span>
                  <select value={s.type} onChange={e => change(updateScene(draft, s.id, { type: e.target.value }))}>
                    {SCENE_TYPES.map(t => <option key={t} value={t}>{sceneLabel(t)}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>What happens</span>
                <textarea rows={4} value={s.text} maxLength={LIMITS.textMax} onChange={e => change(updateScene(draft, s.id, { text: e.target.value }))} />
              </label>
              {draft.enemies.length + draft.npcs.length === 0
                ? <p className="muted">Add NPCs and enemies below, then choose who is in this scene.</p>
                : (
                  <fieldset className="field">
                    <legend>Who is in this scene</legend>
                    {draft.npcs.map(n => (
                      <label key={n.id}>
                        <input type="checkbox" checked={s.npcs.includes(n.id)} onChange={() => change(toggleSceneNpc(draft, s.id, n.id))} /> {n.name || 'Unnamed NPC'} <span className="muted">(NPC)</span>
                      </label>
                    ))}
                    {draft.enemies.map(en => {
                      const here = s.enemies.find(x => x.id === en.id)
                      return (
                        <span key={en.id} className="row">
                          <label>
                            <input type="checkbox" checked={Boolean(here)} onChange={() => change(toggleSceneEnemy(draft, s.id, en.id))} /> {en.name || 'Unnamed enemy'}
                          </label>
                          {here && (
                            <label>
                              <span className="muted">How many </span>
                              <input type="number" min={1} max={LIMITS.maxCount} value={here.count} aria-label={`How many ${en.name || 'enemies'} in scene ${i + 1}`} onChange={e => change(setSceneEnemyCount(draft, s.id, en.id, Number(e.target.value)))} />
                            </label>
                          )}
                        </span>
                      )
                    })}
                  </fieldset>
                )}
            </li>
          ))}
        </ol>
        <div>
          <button type="button" className="account-btn" disabled={draft.scenes.length >= LIMITS.maxScenes} onClick={() => change(addScene(draft))}>Add scene</button>
        </div>
      </section>

      <section className="panel" aria-labelledby="npcs-title">
        <h2 id="npcs-title">NPCs</h2>
        {draft.npcs.length === 0 && <p className="muted">People the heroes meet: allies, rivals, quest-givers.</p>}
        <ul className="scenes">
          {draft.npcs.map((n, i) => (
            <li key={n.id} className="scene">
              <div className="scene-head">
                <b>NPC {i + 1}</b>
                <button type="button" className="account-btn" aria-label={`Remove NPC ${i + 1}`} onClick={() => change(removeNpc(draft, n.id))}>Remove</button>
              </div>
              <div className="grid">
                <label className="field"><span>Name</span><input value={n.name} maxLength={LIMITS.nameMax} onChange={e => change(updateNpc(draft, n.id, { name: e.target.value }))} /></label>
                <label className="field"><span>Role</span><input value={n.role} maxLength={LIMITS.lineMax} onChange={e => change(updateNpc(draft, n.id, { role: e.target.value }))} /></label>
                <label className="field">
                  <span>Attitude</span>
                  <select value={n.attitude} onChange={e => change(updateNpc(draft, n.id, { attitude: e.target.value }))}>
                    {NPC_ATTITUDES.map(a => <option key={a} value={a}>{sceneLabel(a)}</option>)}
                  </select>
                </label>
              </div>
              <label className="field"><span>Description</span><textarea rows={2} value={n.description} maxLength={LIMITS.textMax} onChange={e => change(updateNpc(draft, n.id, { description: e.target.value }))} /></label>
              <label className="field"><span>Secret (GM only)</span><textarea rows={2} value={n.secret} maxLength={LIMITS.textMax} onChange={e => change(updateNpc(draft, n.id, { secret: e.target.value }))} /></label>
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <button type="button" className="account-btn" disabled={draft.npcs.length >= LIMITS.maxNpcs} onClick={() => change({ ...draft, npcs: [...draft.npcs, emptyNpc(draft.npcs.map(x => x.id))] })}>Create NPC</button>
        </div>
        <NpcLibrary added={draft.npcs} onAdd={n => change({ ...draft, npcs: [...draft.npcs, n] })} />
      </section>

      <section className="panel" aria-labelledby="enemies-title">
        <h2 id="enemies-title">Enemies</h2>
        {draft.enemies.length === 0 && <p className="muted">Foe stat blocks. Foes have no dice: Defense and Attack DC are numbers the heroes roll against (GM guide §2).</p>}
        <ul className="scenes">
          {draft.enemies.map((en, i) => {
            const set = (patch: Parameters<typeof updateEnemy>[2]) => change(updateEnemy(draft, en.id, patch))
            const optional = (v: string) => (v === '' ? null : Number(v))
            return (
              <li key={en.id} className="scene">
                <div className="scene-head">
                  <b>Enemy {i + 1}</b>
                  <button type="button" className="account-btn" aria-label={`Remove enemy ${i + 1}`} onClick={() => change(removeEnemy(draft, en.id))}>Remove</button>
                </div>
                <div className="grid">
                  <label className="field"><span>Name</span><input value={en.name} maxLength={LIMITS.nameMax} onChange={e => set({ name: e.target.value })} /></label>
                  <label className="field">
                    <span>Tier</span>
                    <select value={en.tier} onChange={e => set({ tier: e.target.value })}>
                      {ENEMY_TIERS.map(t => <option key={t} value={t}>{sceneLabel(t)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid">
                  <label className="field"><span>Defense</span><input type="number" value={en.defense} onChange={e => set({ defense: Number(e.target.value) })} /></label>
                  <label className="field"><span>Grit</span><input type="number" value={en.grit} onChange={e => set({ grit: Number(e.target.value) })} /></label>
                  <label className="field"><span>Attack DC</span><input type="number" value={en.attackDc} onChange={e => set({ attackDc: Number(e.target.value) })} /></label>
                  <label className="field"><span>Damage</span><input value={en.damage} maxLength={LIMITS.lineMax} onChange={e => set({ damage: e.target.value })} /></label>
                  <label className="field"><span>Will DC (optional)</span><input type="number" value={en.willDc ?? ''} onChange={e => set({ willDc: optional(e.target.value) })} /></label>
                  <label className="field"><span>Resolve (optional)</span><input type="number" value={en.resolve ?? ''} onChange={e => set({ resolve: optional(e.target.value) })} /></label>
                  <label className="field"><span>Moves</span><input value={en.moves} maxLength={LIMITS.lineMax} onChange={e => set({ moves: e.target.value })} /></label>
                </div>
                <label className="field"><span>Traits (one per line)</span><textarea rows={2} value={en.traits.join('\n')} onChange={e => set({ traits: lines(e.target.value) })} /></label>
                <label className="field"><span>Dread abilities (one per line)</span><textarea rows={2} value={en.dread.join('\n')} onChange={e => set({ dread: lines(e.target.value) })} /></label>
              </li>
            )
          })}
        </ul>
        <div className="form-actions">
          <button type="button" className="account-btn" disabled={draft.enemies.length >= LIMITS.maxEnemies} onClick={() => change({ ...draft, enemies: [...draft.enemies, emptyEnemy(draft.enemies.map(x => x.id))] })}>Create enemy</button>
        </div>
        <EnemyLibrary added={draft.enemies} onAdd={e => change({ ...draft, enemies: [...draft.enemies, e] })} />
      </section>

      <section className="panel" aria-labelledby="hooks-title">
        <h2 id="hooks-title">Follow-up hooks</h2>
        <label className="field">
          <span>Ideas for what comes next (one per line)</span>
          <textarea rows={3} value={draft.hooks.join('\n')} onChange={e => set({ hooks: lines(e.target.value) })} />
        </label>
      </section>

      {showProblems && issues.length > 0 && (
        <div className="notice error" role="alert">
          <b>Fix these first:</b>
          <ul>{issues.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {status.status === 'error' && <p className="notice error" role="alert">{status.message}</p>}

      <div className="form-actions">
        <button type="submit" className="account-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save adventure'}</button>
        <Link to="/" className="account-btn">Back</Link>
        {savedId && <button type="button" className="account-btn danger" disabled={busy} onClick={() => void onDelete()}>Delete</button>}
        <span role="status" className="muted">{status.status === 'saved' && 'Saved'}</span>
      </div>
    </form>
  )
}

export default function AdventureEditor({ auth, id }: { auth: Auth; id: string }) {
  const isNew = id === 'new'
  const adventure = useLoad(() => (isNew ? Promise.resolve(null) : adventuresApi.get(id)), [id])
  // Only a Game Master sees the (not yet working) Share control.
  const profile = useLoad(profileApi.get)
  const canShare = profile.state.status === 'ready' && profile.state.data.gameMaster

  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow">{isNew ? 'New adventure' : 'Your adventure'}</p>
        <h1>{isNew ? 'Write an adventure' : 'Edit adventure'}</h1>
      </header>
      {adventure.state.status !== 'ready'
        ? <LoadState state={adventure.state} reload={adventure.reload} what="the adventure" />
        : <EditorForm
            key={id}
            initial={adventure.state.data ? draftOf(adventure.state.data) : emptyAdventure()}
            savedId={isNew ? null : id}
            canShare={canShare}
          />}
    </Shell>
  )
}
