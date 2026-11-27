// Your maps (VTTER-74): the list, and a new map from scratch or from a generator. Up to `limits.mapsPerUser`
// maps each (data/map.json); the API refuses one more with the message shown here. A map attaches to a chapter
// once chapters exist (VTTER-75).
import { useState, type FormEvent } from 'react'
import { ApiError, mapsApi } from '../api/client.ts'
import type { Auth } from '../auth/useAuth.ts'
import { GENERATORS, generateMap, type GeneratorId } from '../engine/mapGen.ts'
import { ALLOWED_SIZES, MAP_LIMITS, MIN_SIDE, newMap, SIZES, sizeDef } from '../engine/mapModel.ts'
import Link from '../Link.tsx'
import { navigate } from '../nav.ts'
import Shell, { LoadState } from '../Shell.tsx'
import { useLoad } from '../useLoad.ts'

export const NO_MAPS = "You haven't made a map yet. Draw one by hand, or generate a maze, a cave or a dungeon to start from."

/** A short random seed an author can read back and type again. */
const randomSeed = () => Math.random().toString(36).slice(2, 8)

const sizeLabel = (id: string) => {
  const s = sizeDef(id)
  return s ? `${s.label} (up to ${s.max}×${s.max})` : id
}

export function NewMapForm({ atLimit, limit }: { atLimit: boolean; limit: number }) {
  const [name, setName] = useState('')
  const [size, setSize] = useState(ALLOWED_SIZES[0])
  const [start, setStart] = useState<'blank' | GeneratorId>('blank')
  const [seed, setSeed] = useState(randomSeed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const max = sizeDef(size)?.max ?? MIN_SIDE
  const [width, setWidth] = useState(max)
  const [height, setHeight] = useState(max)

  function pickSize(id: string) {
    setSize(id)
    const m = sizeDef(id)?.max ?? MIN_SIDE
    setWidth(m)
    setHeight(m)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const title = name.trim() || 'Untitled map'
    setBusy(true)
    setError(null)
    try {
      const map = start === 'blank' ? newMap(title, size, width, height) : generateMap(start, title, size, seed.trim() || 'ember', width, height)
      const id = crypto.randomUUID()
      await mapsApi.save(id, map)
      navigate(`/maps/${id}`)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (atLimit) {
    return <p className="notice" role="status">You have {limit} maps, the most you can keep. Delete one to make another.</p>
  }
  return (
    <form className="map-new" onSubmit={onSubmit} aria-label="New map">
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={MAP_LIMITS.nameMax} placeholder="The Forge vent" />
      </label>
      <label className="field">
        <span>Size</span>
        <select value={size} onChange={e => pickSize(e.target.value)}>
          {SIZES.filter(s => ALLOWED_SIZES.includes(s.id)).map(s => <option key={s.id} value={s.id}>{sizeLabel(s.id)}</option>)}
        </select>
      </label>
      <div className="map-new-dims">
        <label className="field">
          <span>Width</span>
          <input type="number" min={MIN_SIDE} max={max} value={width} onChange={e => setWidth(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" min={MIN_SIDE} max={max} value={height} onChange={e => setHeight(Number(e.target.value))} />
        </label>
      </div>
      <label className="field">
        <span>Start from</span>
        <select value={start} onChange={e => setStart(e.target.value as 'blank' | GeneratorId)}>
          <option value="blank">A blank map</option>
          {GENERATORS.map(g => <option key={g.id} value={g.id}>A generated {g.label.toLowerCase()}</option>)}
        </select>
      </label>
      {start !== 'blank' && (
        <label className="field">
          <span>Seed</span>
          <span className="map-seed">
            <input aria-label="Seed" value={seed} onChange={e => setSeed(e.target.value)} maxLength={40} aria-describedby="seed-help" />
            <button type="button" className="account-btn" onClick={() => setSeed(randomSeed())}>New seed</button>
          </span>
          <small id="seed-help" className="muted">The same seed always makes the same map. There is always a way from Start to Exit.</small>
        </label>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div><button type="submit" className="account-btn primary" disabled={busy}>{busy ? 'Making the map…' : 'Make the map'}</button></div>
    </form>
  )
}

export default function Maps({ auth }: { auth: Auth }) {
  const maps = useLoad(mapsApi.list)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete “${name}”? This can't be undone.`)) return
    setDeleting(id)
    setError(null)
    try {
      await mapsApi.remove(id)
      maps.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Shell auth={auth}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Write</p>
          <h1>Maps</h1>
        </div>
        <Link to={{ name: 'adventures' }} className="account-btn">Adventures</Link>
      </header>

      <section className="panel" aria-labelledby="maps-title">
        <h2 id="maps-title">Yours</h2>
        {error && <p className="notice error" role="alert">{error}</p>}
        {maps.state.status !== 'ready'
          ? <LoadState state={maps.state} reload={maps.reload} what="your maps" />
          : maps.state.data.maps.length === 0
            ? <p className="muted">{NO_MAPS}</p>
            : (
              <ul className="rows">
                {maps.state.data.maps.map(m => (
                  <li key={m.id} className="row">
                    <Link to={{ name: 'map', id: m.id }}><b>{m.name}</b></Link>
                    <span className="muted">{sizeDef(m.size)?.label ?? m.size} · {m.width}×{m.height} hexes</span>
                    <div className="row-actions">
                      <Link to={{ name: 'map', id: m.id }} className="account-btn">Edit</Link>
                      <button type="button" className="account-btn danger" disabled={deleting === m.id} onClick={() => void remove(m.id, m.name)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        {maps.state.status === 'ready' && (
          <p className="muted">{maps.state.data.maps.length} of {maps.state.data.limit} maps. A map attaches to a chapter once chapters arrive.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="new-map-title">
        <h2 id="new-map-title">New map</h2>
        {maps.state.status === 'ready'
          ? <NewMapForm atLimit={maps.state.data.maps.length >= maps.state.data.limit} limit={maps.state.data.limit} />
          : <p className="muted">Loading…</p>}
      </section>
    </Shell>
  )
}
