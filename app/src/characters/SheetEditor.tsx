import { useState, useSyncExternalStore } from 'react'
import { parseSheet } from '../../../api/src/sheet.ts'
import character from '../../../data/character.json'
import core from '../../../data/core.json'
import type { Hero } from '../api/types.ts'
import type { Auth } from '../auth/useAuth.ts'
import { characterRepository } from './current.ts'
import { exportHero } from './repository.ts'

const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
const choices: Record<string, string[]> = {
  ancestry: character.ancestries, calling: character.callings,
  armor: character.armor.map(a => a.id), supplyDie: character.supplyDice,
}
const templates: Record<string, unknown> = {
  wounds: core.attributes[0], talents: '',
  attacks: { name: '', testBonus: 0, damage: '', notes: '' },
  spells: { name: '', ember: 0, target: '', effect: '' },
}

function Field({ name, path, value, change, error }: {
  name: string; path: string; value: unknown; change: (value: unknown) => void; error: string
}) {
  const invalid = error.startsWith(`${path} `) || error.startsWith(`${path}.`) || error.startsWith(`${path}[`)
  const hint = invalid ? <span className="notice error" id={`error-${path}`} role="alert">{error}</span> : null
  if (Array.isArray(value)) return <fieldset><legend>{label(name)}</legend>
    {value.map((item, i) => <div key={i} className="panel">
      <Field name={`${name} ${i + 1}`} path={`${path}[${i}]`} value={item} error={error}
        change={next => change(value.map((old, j) => j === i ? next : old))} />
      <button type="button" className="account-btn" onClick={() => change(value.filter((_, j) => j !== i))}>Remove {label(name)} {i + 1}</button>
    </div>)}
    <button type="button" className="account-btn" onClick={() => change([...value, structuredClone(templates[name])])}>Add {label(name)}</button>
    {hint}
  </fieldset>
  if (value && typeof value === 'object') return <fieldset><legend>{label(name)}</legend><div className="grid">
    {Object.entries(value).map(([key, item]) => <Field key={key} name={key} path={`${path}.${key}`} value={item} error={error}
      change={next => change({ ...value, [key]: next })} />)}
  </div></fieldset>
  const options = path.startsWith('wounds[') ? core.attributes : choices[path]
  return <label className="field"><span>{label(name)}</span>
    {typeof value === 'boolean'
      ? <input type="checkbox" checked={value} onChange={e => change(e.target.checked)} />
      : options ? <select value={String(value)} onChange={e => change(e.target.value)}>
        {!options.includes(String(value)) && <option value={String(value)}>{String(value) || 'Choose…'}</option>}
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
        : typeof value === 'number' ? <input type="number" value={Number.isNaN(value) ? '' : value} onChange={e => change(e.target.valueAsNumber)}
          aria-invalid={invalid} aria-describedby={invalid ? `error-${path}` : undefined} />
          : <textarea rows={['notes', 'gear', 'contacts'].includes(path) ? 4 : 2} value={String(value ?? '')}
            onChange={e => change(e.target.value)} aria-invalid={invalid} aria-describedby={invalid ? `error-${path}` : undefined} />}
    {hint}
  </label>
}

export default function SheetEditor({ hero, auth }: { hero: Hero; auth: Auth }) {
  const repo = characterRepository()
  const state = useSyncExternalStore(repo.subscribe, repo.snapshot)
  const [draft, setDraft] = useState(() => ({ ...parseSheet(hero), skills: Object.fromEntries(
    [...character.skills, ...character.weaponSkills].map(skill => [skill, hero.skills[skill] ?? 0]),
  ) }))
  const [error, setError] = useState('')
  const message = error || state.error?.message || ''
  function update(key: string, value: unknown) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    try {
      const sheet = parseSheet(next)
      setError('')
      void repo.save(hero.id, sheet).catch(e => setError(e.message))
    } catch (e) { setError((e as Error).message) }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportHero(draft)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${hero.id}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError((e as Error).message) }
  }
  return <section className="panel">
    <header><p className="eyebrow">Level {draft.level} · {draft.ancestry} {draft.calling}</p><h1>{draft.name || 'Your hero'}</h1></header>
    <div className="panel-head"><h2>Character sheet</h2><button className="account-btn" onClick={download}>Export JSON</button></div>
    <p role="status" aria-live="polite">{message || state.message}</p>
    {state.error && <button className="account-btn" onClick={() => void repo.flush()}>Retry save</button>}
    {state.error && 'status' in state.error && state.error.status === 401 && <button className="account-btn" onClick={auth.signIn}>Sign in again</button>}
    <form className="form" onSubmit={e => e.preventDefault()} aria-label="Character sheet">
      {Object.entries(draft).filter(([key]) => key !== 'rulesVersion').map(([key, value]) =>
        <Field key={key} name={key} path={key} value={value} change={next => update(key, next)} error={message} />)}
    </form>
  </section>
}
