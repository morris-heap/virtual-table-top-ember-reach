// The map editor (VTTER-74, docs/mockups/map-editor.html). Pick a kind and a type, add the object, then paint
// its hexes (or, for a wall or a door, its edges). The layer tree shows what sits on what, and the panel edits the
// selected object's properties. On a phone the layers and properties share a sheet under the map.
import { useEffect, useMemo, useRef, useState } from 'react'
import { mapsApi } from '../api/client.ts'
import type { Auth } from '../auth/useAuth.ts'
import { DIFFICULT_COST, objectsAtHex } from '../engine/mapRules.ts'
import {
  addObject, KIND_LABELS, KINDS, MAP_LIMITS, mapWarnings, migrateMap, objectLabel, onEdges, paint as paintRuns, removeObject, sizeDef, typeDef,
  typesOfKind, updateObject, type Kind, type MapDoc, type MapObject,
} from '../engine/mapModel.ts'
import { paintOf } from '../engine/mapView.ts'
import { runsContain } from '../engine/runs.ts'
import Link from '../Link.tsx'
import Shell, { LoadState } from '../Shell.tsx'
import { useLoad } from '../useLoad.ts'
import LayerTree from './LayerTree.tsx'
import MapCanvas, { type Tool } from './MapCanvas.tsx'
import PropertyPanel from './PropertyPanel.tsx'

const KIND_ICON: Record<Kind, string> = { space: '⬢', enclosure: '▢', route: '〰', portal: '⌂', static: '♣', entity: '●' }
const HISTORY = 50

function useNarrow(query = '(max-width: 900px)') {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [narrow, setNarrow] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(query)
    const on = () => setNarrow(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [query])
  return narrow
}

type SaveState = { status: 'saved' } | { status: 'dirty' } | { status: 'saving' } | { status: 'error'; message: string }

export function Editor({ initial, onSave }: { initial: MapDoc; onSave(map: Omit<MapDoc, 'id' | 'updatedAt'>): Promise<MapDoc> }) {
  const [doc, setDoc] = useState(initial)
  const [history, setHistory] = useState<MapDoc[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [kind, setKind] = useState<Kind>('space')
  const [type, setType] = useState(typesOfKind('space')[0].id)
  const [save, setSave] = useState<SaveState>({ status: 'saved' })
  const [tab, setTab] = useState<'layers' | 'properties'>('layers')
  const narrow = useNarrow()
  // A stroke is many small paints; it goes into the history once, as the map before it started.
  const strokeStart = useRef<MapDoc | null>(null)

  const paint = useMemo(() => paintOf(doc), [doc])
  const selected = doc.objects.find(o => o.id === selectedId) ?? null
  const edgeTarget = selected ? onEdges(selected) : false
  const warnings = mapWarnings(doc)
  const bytes = useMemo(() => new TextEncoder().encode(JSON.stringify(doc)).length, [doc])

  function change(next: MapDoc, record = true) {
    if (record) setHistory(h => [...h.slice(-HISTORY + 1), doc])
    setDoc(next)
    setSave({ status: 'dirty' })
  }

  function undo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory(h => h.slice(0, -1))
    setDoc(prev)
    setSave({ status: 'dirty' })
    if (selectedId && !prev.objects.some(o => o.id === selectedId)) setSelectedId(null)
  }

  function pickKind(k: Kind) {
    setKind(k)
    setType(typesOfKind(k)[0].id)
  }

  /** New objects sit on the selected Enclosure, or on whatever the selected object sits on. */
  function add() {
    const on = selected ? (selected.kind === 'enclosure' ? selected.id : selected.on) : undefined
    const r = addObject(doc, type, on ? { on } : {})
    change(r.map)
    setSelectedId(r.id)
    setTool('paint')
    if (narrow) setTab('properties')
  }

  function onStroke(index: number) {
    if (!selectedId) return
    if (!strokeStart.current) strokeStart.current = doc
    setDoc(d => paintRuns(d, selectedId, [index], tool === 'erase'))
    setSave({ status: 'dirty' })
  }

  function onStrokeEnd() {
    const before = strokeStart.current
    strokeStart.current = null
    if (before) setHistory(h => [...h.slice(-HISTORY + 1), before])
  }

  /** Tap to select the highest object here; tap again to step down through the layers. */
  function onPick(hex: number) {
    const here = [...objectsAtHex(doc, hex), ...doc.objects.filter(o => (o.kind === 'static' || o.kind === 'entity') && runsContain(o.at, hex))]
      .reverse()
    if (!here.length) { setSelectedId(null); return }
    const k = here.findIndex(o => o.id === selectedId)
    setSelectedId(here[(k + 1) % here.length].id)
    if (narrow) setTab('properties')
  }

  function patchSelected(patch: Partial<MapObject>) {
    if (!selected) return
    // Switching between a hex type and an edge type changes what `at` means, so its hexes are cleared.
    const next = { ...selected, ...patch }
    if (patch.type && onEdges(next) !== onEdges(selected)) patch = { ...patch, at: [] }
    change(updateObject(doc, selected.id, patch))
  }

  function removeSelected() {
    if (!selected) return
    if (!window.confirm(`Remove “${objectLabel(selected)}”? What sits on it moves down a layer.`)) return
    change(removeObject(doc, selected.id))
    setSelectedId(null)
  }

  async function doSave() {
    setSave({ status: 'saving' })
    try {
      const { id: _id, updatedAt: _u, ...body } = doc
      const saved = await onSave(body)
      setDoc(d => ({ ...d, updatedAt: saved.updatedAt }))
      setSave({ status: 'saved' })
    } catch (err) {
      setSave({ status: 'error', message: (err as Error).message })
    }
  }

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (save.status !== 'dirty' && save.status !== 'error') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save.status])

  // Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes.
  const keys = useRef({ doSave, undo })
  useEffect(() => { keys.current = { doSave, undo } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 's') { e.preventDefault(); void keys.current.doSave() }
      if (e.key === 'z' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); keys.current.undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const status = save.status === 'saving' ? 'Saving…' : save.status === 'dirty' ? 'Unsaved changes' : save.status === 'saved' ? 'Saved' : 'Not saved'
  const canSave = save.status !== 'saving' && warnings.length === 0

  const layers = <LayerTree map={doc} selectedId={selectedId} onSelect={id => { setSelectedId(id); if (narrow) setTab('properties') }} />
  const props = selected
    ? <PropertyPanel map={doc} object={selected} onChange={patchSelected} onRemove={removeSelected} />
    : (
      <div className="map-props">
        <h2>The map</h2>
        <label className="field">
          <span>Name</span>
          <input value={doc.name} maxLength={MAP_LIMITS.nameMax} onChange={e => change({ ...doc, name: e.target.value }, false)} />
        </label>
        <p className="muted">{sizeDef(doc.size)?.label} · {doc.width}×{doc.height} hexes. 1 hex = 1 zone. Difficult costs {DIFFICULT_COST} zones to enter.</p>
        <p className="muted">Select an object in the layers, or tap the map with Select, to edit it.</p>
      </div>
    )

  return (
    <div className="map-editor">
      <div className="panel map-toolbar">
        <div className="map-row">
          <input className="map-title" aria-label="Map name" value={doc.name} maxLength={MAP_LIMITS.nameMax}
            onChange={e => change({ ...doc, name: e.target.value }, false)} />
          <span className={`map-status ${save.status}`} role="status">{status}</span>
          <button type="button" className="account-btn" onClick={undo} disabled={!history.length}>Undo</button>
          <button type="button" className="account-btn primary" onClick={() => void doSave()} disabled={!canSave}>Save</button>
        </div>
        {!narrow && (
          <div className="map-row" role="toolbar" aria-label="Add object">
            {KINDS.map(k => (
              <button key={k} type="button" className="account-btn map-kind" aria-pressed={kind === k} onClick={() => pickKind(k)}>
                <i aria-hidden="true">{KIND_ICON[k]}</i>{KIND_LABELS[k]}
              </button>
            ))}
          </div>
        )}
        <div className="map-row">
          {narrow && (
            <label className="field map-type">
              <span>Kind</span>
              <select value={kind} onChange={e => pickKind(e.target.value as Kind)}>
                {KINDS.map(k => <option key={k} value={k}>{KIND_ICON[k]} {KIND_LABELS[k]}</option>)}
              </select>
            </label>
          )}
          <label className="field map-type">
            <span>Type</span>
            <select value={type} onChange={e => setType(e.target.value)}>
              {typesOfKind(kind).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <button type="button" className="account-btn" onClick={add} disabled={doc.objects.length >= MAP_LIMITS.objects}>
            Add {typeDef(type)?.label ?? type}
          </button>
          <span className="spacer" />
          <div className="map-row" role="group" aria-label="Tool">
            {(['select', 'paint', 'erase'] as const).map(t => (
              <button key={t} type="button" className="account-btn" aria-pressed={tool === t} onClick={() => setTool(t)}>
                {t === 'select' ? 'Select' : t === 'paint' ? (edgeTarget ? 'Paint edges' : 'Paint') : 'Erase'}
              </button>
            ))}
          </div>
        </div>
        {tool !== 'select' && !selected && <p className="notice" role="status">Add or select an object first, then paint its hexes.</p>}
        {tool !== 'select' && selected && (
          <p className="muted">Painting {objectLabel(selected)}{edgeTarget ? ' on the edges between hexes' : ''}. Two fingers pan and zoom.</p>
        )}
      </div>

      {!narrow && <aside className="panel map-side" aria-label="Layers"><h2>Layers</h2>{layers}</aside>}

      <section className="panel map-stage" aria-label="Map">
        <MapCanvas map={doc} paint={paint} selectedId={selectedId} edgeTarget={edgeTarget} tool={tool}
          onStroke={onStroke} onStrokeEnd={onStrokeEnd} onPick={onPick} />
        <p className="muted map-foot">
          {doc.objects.length} of {MAP_LIMITS.objects} objects · {Math.ceil(bytes / 1000)} KB of {MAP_LIMITS.itemBytesMax / 1000} KB
        </p>
        {warnings.length > 0 && (
          <div className="notice error" role="alert">
            Fix these before saving:
            <ul>{warnings.slice(0, 6).map(w => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        {save.status === 'error' && <p className="notice error" role="alert">{save.message}</p>}
      </section>

      {narrow
        ? (
          <section className="panel map-sheet" aria-label="Layers and properties">
            <div className="map-row" role="tablist">
              <button type="button" role="tab" className="account-btn" aria-selected={tab === 'layers'} aria-pressed={tab === 'layers'} onClick={() => setTab('layers')}>Layers</button>
              <button type="button" role="tab" className="account-btn" aria-selected={tab === 'properties'} aria-pressed={tab === 'properties'} onClick={() => setTab('properties')}>Properties</button>
            </div>
            {tab === 'layers' ? layers : props}
          </section>
        )
        : <aside className="panel map-side" aria-label="Properties">{props}</aside>}
    </div>
  )
}

export default function MapEditor({ auth, id }: { auth: Auth; id: string }) {
  const map = useLoad(async () => migrateMap(await mapsApi.get(id)), [id])
  return (
    <Shell auth={auth} full>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Map</p>
          <h1>{map.state.status === 'ready' ? map.state.data.name : 'Map editor'}</h1>
        </div>
        <Link to={{ name: 'maps' }} className="account-btn">All maps</Link>
      </header>
      {map.state.status !== 'ready'
        ? <LoadState state={map.state} reload={map.reload} what="the map" />
        : <Editor key={id} initial={map.state.data} onSave={body => mapsApi.save(id, body)} />}
    </Shell>
  )
}
