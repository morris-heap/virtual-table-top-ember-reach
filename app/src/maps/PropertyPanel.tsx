// The selected object's properties (docs/mockups/map-editor.html). Every value is checked against the
// catalog in data/map.json. Movement properties are tagged "acts now"; the rest "acts later" or "describes".
import { useState } from 'react'
import {
  chainOf, effectiveCovers, KIND_LABELS, MAP_LIMITS, objectLabel, PROPERTIES, propertyAllowed, propertyDef, typeDef, typesOfKind,
  type MapDoc, type MapObject, type PropScalar, type PropValue, type ValueSpec,
} from '../engine/mapModel.ts'

const ACTS_LABEL = { now: 'acts now', later: 'acts later', describes: 'describes' } as const

/** A sensible first value for a property the author adds. */
function blank(spec: ValueSpec): PropValue {
  switch (spec.type) {
    case 'flag': return true
    case 'number': return Math.max(spec.min ?? 0, Math.min(spec.max ?? 12, 12))
    case 'text': return ''
    case 'enum': return spec.options?.[0] ?? ''
    case 'object': {
      const out: Record<string, PropScalar> = {}
      for (const [k, f] of Object.entries(spec.fields ?? {})) out[k] = blank(f) as PropScalar
      return out
    }
  }
}

function ValueInput({ spec, value, label, onChange }: { spec: ValueSpec; value: PropValue | undefined; label: string; onChange(v: PropValue): void }) {
  switch (spec.type) {
    case 'flag':
      return (
        <label className="map-check">
          <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} /> {label}
        </label>
      )
    case 'number':
      return (
        <label className="field">
          <span>{label}</span>
          <input type="number" min={spec.min} max={spec.max} value={typeof value === 'number' ? value : ''}
            onChange={e => onChange(e.target.value === '' ? (spec.min ?? 0) : Math.round(Number(e.target.value)))} />
        </label>
      )
    case 'text':
      return (
        <label className="field">
          <span>{label}</span>
          <input value={typeof value === 'string' ? value : ''} maxLength={spec.max} onChange={e => onChange(e.target.value)} />
        </label>
      )
    case 'enum':
      return (
        <label className="field">
          <span>{label}</span>
          <select value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}>
            {spec.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'object': {
      const v = (value && typeof value === 'object' ? value : {}) as Record<string, PropScalar>
      return (
        <div className="map-fields">
          {Object.entries(spec.fields ?? {}).map(([k, f]) => (
            <ValueInput key={k} spec={f} label={k} value={v[k]} onChange={x => onChange({ ...v, [k]: x as PropScalar })} />
          ))}
          {spec.grants?.map(g => (
            <ValueInput key={g} spec={{ type: 'flag' }} label={`grants ${g}`} value={v[g]}
              onChange={x => { const next = { ...v }; if (x === true) next[g] = true; else delete next[g]; onChange(next) }} />
          ))}
        </div>
      )
    }
  }
}

export default function PropertyPanel({ map, object, onChange, onRemove }: {
  map: Pick<MapDoc, 'objects'>
  object: MapObject
  onChange(patch: Partial<MapObject>): void
  onRemove(): void
}) {
  const [adding, setAdding] = useState('')
  const type = typeDef(object.type)
  const defaults = type?.props ?? {}
  const own = object.props ?? {}
  // What the object has: its type's defaults, overridden by its own values. `false` turns a default flag off.
  const names = [...new Set([...Object.keys(defaults), ...Object.keys(own)])]
  const shown = names.filter(n => own[n] !== false || n in defaults)
  const missing = PROPERTIES.filter(p => propertyAllowed(p, object.type) && (!names.includes(p.name) || own[p.name] === false && !(p.name in defaults)))

  const setProp = (name: string, v: PropValue | undefined) => {
    const next = { ...own }
    if (v === undefined) delete next[name]
    else next[name] = v
    onChange({ props: next })
  }
  // Not this object, and nothing layered on it (that would make a loop).
  const parents = map.objects.filter(o => o.id !== object.id && !chainOf(map, o.id).some(x => x.id === object.id))
  const covers = effectiveCovers(object)

  return (
    <div className="map-props">
      <h2>{objectLabel(object)}</h2>
      <div className="map-tags">
        <span className="map-tag">{KIND_LABELS[object.kind]}</span>
        <span className="map-tag">type: {object.type}</span>
        {object.on && <span className="map-tag">on: {objectLabel(map.objects.find(o => o.id === object.on) ?? object)}</span>}
      </div>

      <label className="field">
        <span>Name</span>
        <input value={object.name ?? ''} maxLength={MAP_LIMITS.nameMax} placeholder={type?.label} onChange={e => onChange({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={object.type} onChange={e => onChange({ type: e.target.value })}>
          {typesOfKind(object.kind).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Sits on</span>
        <select value={object.on ?? ''} onChange={e => onChange({ on: e.target.value || undefined })}>
          <option value="">Nothing (top layer)</option>
          {parents.map(o => <option key={o.id} value={o.id}>{objectLabel(o)} ({KIND_LABELS[o.kind]})</option>)}
        </select>
      </label>
      {object.kind === 'route' && (
        <label className="field">
          <span>Line</span>
          <select value={object.line ?? 'fill'} onChange={e => onChange({ line: e.target.value as 'fill' | 'edge', at: [] })}>
            <option value="fill">Fill: it occupies hexes (a river, a road)</option>
            <option value="edge">Edge: it lies between hexes (a wall, a fence)</option>
          </select>
        </label>
      )}
      {object.kind === 'entity' && (
        <label className="field">
          <span>{object.type === 'foe' ? 'Foe' : 'NPC'} from the adventure</span>
          <input value={(object.type === 'foe' ? object.ref?.foe : object.ref?.npc) ?? ''} maxLength={MAP_LIMITS.nameMax}
            onChange={e => onChange({ ref: e.target.value ? (object.type === 'foe' ? { foe: e.target.value } : { npc: e.target.value }) : undefined })} />
        </label>
      )}

      <label className="map-check map-gm">
        <input type="checkbox" checked={!!object.gmOnly} onChange={e => onChange({ gmOnly: e.target.checked })} />
        <span><b>GM-only</b> <span className="muted">· players never receive it, or anything on it</span></span>
      </label>

      <h3>Properties</h3>
      {shown.length === 0 && <p className="muted">None.</p>}
      {shown.map(name => {
        const def = propertyDef(name)
        if (!def) return <p key={name} className="notice error">Unknown property “{name}”.</p>
        const value = name in own ? own[name] : defaults[name]
        const fromType = !(name in own)
        const off = value === false
        // Starting open changes some properties (an open door stops blocking sight): say so where it applies.
        const openChange = own.open === true && type?.opens && type.whenOpen && name in type.whenOpen ? type.whenOpen[name] : undefined
        return (
          <div key={name} className={`map-prop${off ? ' off' : ''}`}>
            <header>
              <span>{def.label}{fromType && <small className="muted"> · from {type?.label}</small>}</span>
              <span className={`map-tag ${def.acts}`}>{ACTS_LABEL[def.acts]}</span>
            </header>
            <p className="muted">{def.help}</p>
            {openChange !== undefined && (
              <p className="notice" role="note">
                While it starts open: {openChange === false ? 'off' : String(openChange)}.
              </p>
            )}
            {def.value.type !== 'flag' && !off && <ValueInput spec={def.value} label="Value" value={value} onChange={v => setProp(name, v)} />}
            <div className="row-actions">
              {def.value.type === 'flag'
                ? <button type="button" className="link-btn" onClick={() => setProp(name, off ? (name in defaults ? undefined : true) : (name in defaults ? false : undefined))}>{off ? 'Turn on' : 'Turn off'}</button>
                : !fromType && <button type="button" className="link-btn" onClick={() => setProp(name, undefined)}>{name in defaults ? `Back to ${type?.label}'s value` : 'Remove'}</button>}
            </div>
          </div>
        )
      })}
      <div className="map-add-prop">
        <label className="field">
          <span>Add a property</span>
          <select value={adding} onChange={e => setAdding(e.target.value)}>
            <option value="">Choose…</option>
            {missing.map(p => <option key={p.name} value={p.name}>{p.label} ({ACTS_LABEL[p.acts]})</option>)}
          </select>
        </label>
        <button type="button" className="account-btn" disabled={!adding} onClick={() => { setProp(adding, blank(propertyDef(adding)!.value)); setAdding('') }}>Add</button>
      </div>
      {covers.length > 0 && <p className="muted">Covers {covers.join(', ')} for anyone standing on it.</p>}

      <label className="field">
        <span>GM note</span>
        <textarea rows={3} maxLength={MAP_LIMITS.noteMax} value={object.note ?? ''} onChange={e => onChange({ note: e.target.value })}
          placeholder="Only the GM sees this." />
      </label>

      <button type="button" className="account-btn danger" onClick={onRemove}>Remove {objectLabel(object)}</button>
    </div>
  )
}
