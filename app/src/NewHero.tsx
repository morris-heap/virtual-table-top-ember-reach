import { parseSheet } from '../../api/src/sheet.ts'
// The New hero form (/heroes/new): name, Ancestry and Calling, saved as a level 1 hero.
// Guided creation of the rest of the sheet is VTTER-47.
import { useState, type FormEvent } from 'react'
import { characters as heroesApi } from './characters/current.ts'
import type { HeroSummary } from './api/types.ts'
import { ANCESTRIES, CALLINGS, emptyHero, heroProblems, NAME_MAX, newHeroSheet, type NewHero as Draft } from './engine/hero.ts'

export default function NewHero({ onCreated, onCancel }: { onCreated: (hero: HeroSummary) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(emptyHero)
  const [showProblems, setShowProblems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const issues = heroProblems(draft)
  const set = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch })); setError('') }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (issues.length) return setShowProblems(true)
    setSaving(true)
    try {
      const saved = await heroesApi.save(crypto.randomUUID(), parseSheet(newHeroSheet(draft)))
      onCreated({ id: saved.id, name: saved.name, level: saved.level, ancestry: saved.ancestry, calling: saved.calling, updatedAt: saved.updatedAt })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={e => void onSubmit(e)} aria-label="New hero">
      <label className="field">
        <span>Name</span>
        <input value={draft.name} maxLength={NAME_MAX} autoFocus onChange={e => set({ name: e.target.value })} />
      </label>
      <div className="grid">
        <label className="field">
          <span>Ancestry</span>
          <select value={draft.ancestry} onChange={e => set({ ancestry: e.target.value })}>
            <option value="">Choose…</option>
            {ANCESTRIES.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Calling</span>
          <select value={draft.calling} onChange={e => set({ calling: e.target.value })}>
            <option value="">Choose…</option>
            {CALLINGS.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {showProblems && issues.length > 0 && (
        <div className="notice error" role="alert"><ul>{issues.map(i => <li key={i}>{i}</li>)}</ul></div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="account-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Create hero'}</button>
        <button type="button" className="account-btn" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
