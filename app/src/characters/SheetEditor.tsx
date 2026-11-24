// One hero's sheet: a read-only View and a guided Edit (VTTER-47, docs/mockups/), with durable autosave.
import { useState, useSyncExternalStore } from 'react'
import { parseSheet } from '../../../api/src/sheet.ts'
import type { Hero } from '../api/types.ts'
import type { Auth } from '../auth/useAuth.ts'
import { creationSteps, SKILLS, type CharacterSheet } from '../engine/sheet.ts'
import { characterRepository } from './current.ts'
import { exportHero } from './repository.ts'
import Portrait from './Portrait.tsx'
import SheetEdit from './SheetEdit.tsx'
import SheetView from './SheetView.tsx'

type Mode = 'view' | 'edit'

export default function SheetEditor({ hero, auth }: { hero: Hero; auth: Auth }) {
  const repo = characterRepository()
  const state = useSyncExternalStore(repo.subscribe, repo.snapshot)
  // Every skill is listed (rank 0 included) so the steppers always have a value.
  const [draft, setDraft] = useState<CharacterSheet>(() => {
    const sheet = parseSheet(hero)
    return { ...sheet, skills: Object.fromEntries(SKILLS.map(skill => [skill, hero.skills[skill] ?? 0])) }
  })
  // The last draft that passed validation: the View shows this, never a half-typed value.
  const [valid, setValid] = useState(draft)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>(() => (draft.level === 1 && creationSteps(draft).some(s => !s.done) ? 'edit' : 'view'))
  const signedIn = auth.state.status === 'signedIn'
  const message = error || state.error?.message || ''

  function change(next: CharacterSheet) {
    setDraft(next)
    try {
      const sheet = parseSheet(next)
      setError('')
      setValid(next)
      void repo.save(hero.id, sheet).catch(e => setError(e.message))
    } catch (e) { setError((e as Error).message) }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportHero(valid)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${hero.id}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError((e as Error).message) }
  }

  return <section className="cs-page">
    <div className="cs-toolbar">
      <div className="cs-mode" role="group" aria-label="Sheet mode">
        <button type="button" aria-pressed={mode === 'view'} onClick={() => setMode('view')}>View</button>
        <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>
      </div>
      <div className="cs-toolbar-end">
        <span className="cs-saved" role="status" aria-live="polite">{error ? '' : state.error?.message ?? state.message}</span>
        {state.error && <button className="account-btn" onClick={() => void repo.flush()}>Retry save</button>}
        {state.error && 'status' in state.error && state.error.status === 401 && <button className="account-btn" onClick={auth.signIn}>Sign in again</button>}
        <button className="account-btn" onClick={download}>Export JSON</button>
        {mode === 'edit' && <button className="account-btn primary" onClick={() => setMode('view')}>Done</button>}
      </div>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {mode === 'view'
      ? <SheetView sheet={valid} portrait={<Portrait heroId={hero.id} signedIn={signedIn} editable={false} />} />
      : <>
        <header className="cs-header"><p className="eyebrow">Level {draft.level} · {draft.ancestry} {draft.calling}</p><h1>{draft.name || 'Your hero'}</h1></header>
        <SheetEdit sheet={draft} change={change} error={message} portrait={<Portrait heroId={hero.id} signedIn={signedIn} editable />} />
      </>}
  </section>
}
