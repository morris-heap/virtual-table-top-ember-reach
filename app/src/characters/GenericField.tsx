// A generic editor for the sheet fields the guided editor doesn't have a custom control for (attacks, Wounds, notes).
import character from '../../../data/character.json'
import core from '../../../data/core.json'

const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
const choices: Record<string, string[]> = {
  ancestry: character.ancestries, calling: character.callings,
  armor: character.armor.map(a => a.id), supplyDie: character.supplyDice,
}
const templates: Record<string, unknown> = {
  wounds: core.attributes[0], talents: '',
  attacks: { name: '', toHit: '', damage: '', properties: '', notes: '' },
  spells: { name: '', ember: 0, target: '', effect: '' },
}

export function Field({ name, path, value, change, error }: {
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
