// The dice tray (VTTER-79): pick any mix of dice, gather them with the mouse, release, read the total.
// This file holds the controls and the result. The 3D scene itself loads lazily from ./scene.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDie, canAdd, emptyPool, expandPool, formatPool, MAX_PHYSICAL_DICE, removeDie, rollPool, summarize,
  type DieResult, type Pool, type PoolDie, type Summary,
} from '../engine/dicePool'
import {
  BODY_PRESETS, defaultSettings, FINISHES, lowContrast, NUMBER_PRESETS, sanitizeSettings, shade, styleFor,
  type DiceStyle, type Finish, type StyleSettings,
} from '../engine/diceStyle'
import { DIE_KINDS, type DieKind } from '../engine/polyhedra'
import type { DiceScene, Phase } from './scene'

const STYLE_KEY = 'emberreach.dice.style'
const MUTE_KEY = 'emberreach.dice.muted'
const HISTORY_MAX = 10

type Mode = 'loading' | '3d' | 'fallback'

interface Roll {
  formula: string
  summary: Summary
  /** The dice that were thrown. When the pool changes these are no longer in the tray. */
  dice: PoolDie[]
}

function loadSettings(): StyleSettings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null'))
  } catch {
    return defaultSettings()
  }
}

function loadMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode: the choice just isn't remembered */ }
}

const SHAPES: Record<DieKind, string> = {
  d4: '22,5 40,37 4,37',
  d6: '8,8 36,8 36,36 8,36',
  d8: '22,3 39,22 22,41 5,22',
  d10: '22,3 39,16 33,40 11,40 5,16',
  d12: '22,3 38,14 33,36 11,36 6,14',
  d20: '22,3 40,12 40,32 22,41 4,32 4,12',
  d100: '14,5 29,11 27,30 11,31 6,15',
}

function DieIcon({ kind, style }: { kind: DieKind; style: DiceStyle }) {
  return (
    <svg viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
      <polygon points={SHAPES[kind]} fill={style.body} stroke={shade(style.body, 0.55)} strokeWidth="2" strokeLinejoin="round" />
      {kind === 'd100' && <polygon points="33,15 41,25 36,40 24,36 26,22" fill={shade(style.body, 0.8)} stroke={shade(style.body, 0.55)} strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  )
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="dice-row">
      <span className="dice-row-label">{label}</span>
      <div className="swatches">
        {colors.map(c => (
          <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`${label} ${c}`}
            aria-pressed={c === value} onClick={() => onPick(c)} />
        ))}
        <input type="color" value={value} aria-label={`Custom ${label.toLowerCase()}`} onChange={e => onPick(e.target.value)} />
      </div>
    </div>
  )
}

const PHASE_HINT: Record<Phase, string> = {
  idle: 'Move over the tray to pick up your dice',
  held: 'Move to carry the dice · click to release them the way the mouse is moving',
  rolling: 'Rolling…',
  settled: 'Move over the tray to pick the dice up again',
}

export default function DiceTray() {
  const [pool, setPool] = useState<Pool>(() => ({ ...emptyPool(), d20: 1 }))
  const [settings, setSettings] = useState<StyleSettings>(loadSettings)
  const [editKind, setEditKind] = useState<DieKind>('d20')
  const [muted, setMuted] = useState(loadMuted)
  const [mode, setMode] = useState<Mode>('loading')
  const [phase, setPhase] = useState<Phase>('idle')
  const [current, setCurrent] = useState<Roll | null>(null)
  const [history, setHistory] = useState<Roll[]>([])
  const [expanded, setExpanded] = useState(false)
  const expandRef = useRef<HTMLButtonElement>(null)
  const exitRef = useRef<HTMLButtonElement>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<DiceScene | null>(null)
  const currentRef = useRef<Roll | null>(null)
  const resultsRef = useRef<Map<string, DieResult>>(new Map())

  const dice = useMemo(() => expandPool(pool), [pool])
  // The scene's callbacks are made once, so they read the latest values through these refs.
  const live = useRef({ dice, pool, muted, settings })
  useEffect(() => { live.current = { dice, pool, muted, settings } })

  const archive = useCallback(() => {
    const prev = currentRef.current
    if (prev) setHistory(h => [prev, ...h].slice(0, HISTORY_MAX))
    currentRef.current = null
    setCurrent(null)
  }, [])

  const record = useCallback((results: Map<string, DieResult>, full: boolean) => {
    const merged = full ? new Map<string, DieResult>() : new Map(resultsRef.current)
    results.forEach((v, k) => merged.set(k, v))
    resultsRef.current = merged
    const next: Roll = { formula: formatPool(live.current.pool), summary: summarize(live.current.dice, merged), dice: live.current.dice }
    currentRef.current = next
    setCurrent(next)
  }, [])

  // Start the 3D scene once; if it can't start, fall back to the plain roller.
  useEffect(() => {
    let cancelled = false
    let created: DiceScene | null = null
    const canvas = canvasRef.current
    if (!canvas) return
    import('./scene')
      .then(mod => {
        if (cancelled) return
        try {
          created = mod.createScene(canvas, { onRelease: archive, onSettled: record, onPhase: setPhase }, live.current.muted)
        } catch {
          setMode('fallback')
          return
        }
        created.setStyles(kind => styleFor(live.current.settings, kind))
        created.setDice(live.current.dice)
        sceneRef.current = created
        setMode('3d')
      })
      .catch(() => { if (!cancelled) setMode('fallback') })
    return () => {
      cancelled = true
      created?.dispose()
      sceneRef.current = null
    }
  }, [archive, record])

  useEffect(() => {
    sceneRef.current?.setDice(dice)
  }, [dice, mode])

  useEffect(() => {
    sceneRef.current?.setStyles(kind => styleFor(settings, kind))
    save(STYLE_KEY, JSON.stringify(settings))
  }, [settings, mode])

  useEffect(() => {
    sceneRef.current?.setMuted(muted)
    save(MUTE_KEY, muted ? '1' : '0')
  }, [muted, mode])

  const roll = useCallback(() => {
    if (live.current.dice.length === 0) return
    const scene = sceneRef.current
    if (scene) {
      scene.unlockSound()
      scene.rollAll()
    } else if (mode === 'fallback') {
      archive()
      record(rollPool(live.current.dice), true)
    }
  }, [archive, record, mode])

  // Space throws the dice, unless a control has the focus (Space presses a focused button).
  const rollRef = useRef(roll)
  useEffect(() => { rollRef.current = roll })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if ((e.target as HTMLElement | null)?.closest('button, input, select, textarea, a, [role="tab"]')) return
      e.preventDefault()
      rollRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Expanded: the tray fills the window. Esc closes it, the page behind doesn't scroll, and focus follows.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const opener = expandRef.current
    exitRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [expanded])

  function resetTray() {
    archive()
    resultsRef.current = new Map()
    sceneRef.current?.reset()
  }

  function rethrow(ids: string[]) {
    ids.forEach(id => sceneRef.current?.rethrow(id))
  }

  const target = settings.perType ? styleFor(settings, editKind) : settings.all
  function restyle(patch: Partial<DiceStyle>) {
    setSettings(s => (s.perType
      ? { ...s, types: { ...s.types, [editKind]: { ...styleFor(s, editKind), ...patch } } }
      : { ...s, all: { ...s.all, ...patch } }))
  }

  const empty = dice.length === 0
  const summary = current?.summary
  const resolved = summary?.entries.filter(e => e.value !== null) ?? []
  const canRethrow = !!current && current.dice === dice && mode === '3d'
  const chipFor = (e: Summary['entries'][number]) => e.cocked ? (
    <span key={e.key} className="dice-chip warn">
      <i>{e.kind}</i> cocked
      {canRethrow
        ? <button type="button" className="link-btn" onClick={() => rethrow(e.cockedIds)}>re-throw</button>
        : ' (not counted)'}
    </span>
  ) : (
    <span key={e.key} className="dice-chip">
      <i>{e.kind}</i> <b>{e.value}</b>{e.detail && <span className="muted"> ({e.detail})</span>}
    </span>
  )
  const chipList = summary?.entries.map(chipFor)
  // The expanded tray shows only the total and the dice that need a re-throw, so the readout leaves the tray clear.
  const cocked = summary?.entries.filter(e => e.cocked) ?? []
  const cockedChips = cocked.length > 0 ? cocked.map(chipFor) : null

  return (
    <>
      <section className="panel" aria-label="Choose dice">
        <h2>Choose dice (any mix)</h2>
        <div className="dice-picker">
          {DIE_KINDS.map(kind => (
            <div key={kind} className={pool[kind] > 0 ? 'die-pick has' : 'die-pick'}>
              <DieIcon kind={kind} style={styleFor(settings, kind)} />
              <b>{kind}</b>
              <div className="die-count">
                <button type="button" aria-label={`Remove a ${kind}`} disabled={pool[kind] === 0} onClick={() => setPool(p => removeDie(p, kind))}>−</button>
                <output aria-label={`${kind} count`}>{pool[kind]}</output>
                <button type="button" aria-label={`Add a ${kind}`} disabled={!canAdd(pool, kind)} onClick={() => setPool(p => addDie(p, kind))}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="dice-formula">
          <span className="muted">Pool</span>
          <code>{formatPool(pool) || 'empty'}</code>
          <span className="dice-formula-actions">
            <button type="button" className="btn" disabled={empty} onClick={() => setPool(emptyPool())}>Clear pool</button>
            <button type="button" className="roll dice-roll" disabled={empty || mode === 'loading'} onClick={roll}>Roll <kbd>Space</kbd></button>
          </span>
        </div>
        <p className="mod">
          A d100 throws a tens die (00–90) and a units d10 (0–9); 00 + 0 counts as 100. A d4 reads the number at its top corner.
          {' '}Up to {MAX_PHYSICAL_DICE} dice per throw (a d100 is two).
        </p>
      </section>

      <section className="panel" aria-label="Dice colors">
        <h2>Dice colors</h2>
        <div className="dice-row">
          <span className="dice-row-label">Apply to</span>
          <div className="seg" role="group" aria-label="Apply colors to">
            <button type="button" aria-pressed={!settings.perType} onClick={() => setSettings(s => ({ ...s, perType: false }))}>All dice</button>
            <button type="button" aria-pressed={settings.perType} onClick={() => setSettings(s => ({ ...s, perType: true }))}>Per die type</button>
          </div>
          {settings.perType && (
            <select aria-label="Die type to color" value={editKind} onChange={e => setEditKind(e.target.value as DieKind)}>
              {DIE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
        </div>
        <Swatches label="Dice body" colors={BODY_PRESETS} value={target.body} onPick={body => restyle({ body })} />
        <Swatches label="Numbers" colors={NUMBER_PRESETS} value={target.number} onPick={number => restyle({ number })} />
        <div className="dice-row">
          <span className="dice-row-label">Finish</span>
          <div className="seg" role="group" aria-label="Finish">
            {FINISHES.map((f: Finish) => (
              <button key={f} type="button" aria-pressed={target.finish === f} onClick={() => restyle({ finish: f })}>{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <button type="button" className="link-btn" onClick={() => setSettings(defaultSettings())}>Reset colors</button>
        </div>
        {lowContrast(target) && <p className="dice-warn" role="status">These numbers will be hard to read on this body color. Pick a lighter or darker number color.</p>}
        <p className="mod">Colors are saved on this device only.{mode === 'fallback' ? ' They do not apply to the plain roller.' : ''}</p>
      </section>

      <section className={expanded ? 'tray expanded' : 'tray'} aria-label="Dice tray" hidden={mode === 'fallback'}>
        <canvas ref={canvasRef} className="tray-canvas" role="img"
          aria-label="Dice tray. Move the mouse over it to pick up the dice, click to throw them. The Roll button or Space bar also throws." />
        <button type="button" className="tray-sound" aria-pressed={muted}
          onClick={() => { setMuted(m => !m); sceneRef.current?.unlockSound() }}>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
        <div className="tray-tools">
          {expanded && <button type="button" className="tray-roll" disabled={empty || mode === 'loading'} onClick={roll}>Roll</button>}
          <button type="button" disabled={empty || !current} onClick={roll}>Reroll</button>
          <button type="button" disabled={empty} onClick={resetTray}>Reset tray</button>
          {expanded
            ? <button type="button" ref={exitRef} onClick={() => setExpanded(false)}>Exit <kbd>Esc</kbd></button>
            : <button type="button" ref={expandRef} aria-label="Expand the tray to fill the window" onClick={() => setExpanded(true)}>Expand</button>}
        </div>
        {expanded && (
          <div className="tray-readout">
            {summary
              ? <>
                <span className="tray-readout-total"><small>{summary.complete ? 'Total' : 'So far'}</small>{summary.total}</span>
                <span className="chips">{cockedChips ?? <span className="muted">{summary.entries.length} {summary.entries.length === 1 ? 'die' : 'dice'}</span>}</span>
              </>
              : <span className="muted">{phase === 'rolling' ? 'Rolling…' : 'Throw the dice to see the total'}</span>}
          </div>
        )}
        <p className="tray-hint" aria-hidden="true">
          {mode === 'loading' ? 'Loading the dice…' : empty ? 'Add some dice to the pool' : PHASE_HINT[phase]}
        </p>
      </section>

      {mode === 'fallback' && (
        <p className="dice-warn" role="status">
          3D dice need WebGL, and this browser can't provide it. The roller below throws the same pool without the tray.
        </p>
      )}

      <section className="panel dice-result" aria-live="polite" aria-label="Dice result">
        {summary ? (
          <>
            <div className="dice-total">
              <small>{summary.complete ? 'Total' : 'Total so far'}</small>
              {summary.total}
            </div>
            <div>
              <div className="chips">{chipList}</div>
              {resolved.length > 0 && (
                <p className="math">{resolved.map(e => e.value).join(' + ')} = <b>{summary.total}</b></p>
              )}
              {!summary.complete && <p className="math">A cocked die is not counted until it lands flat. Re-throw it to finish the roll.</p>}
            </div>
          </>
        ) : (
          <p className="muted">
            {phase === 'rolling' ? 'Rolling…' : empty ? 'Add dice to the pool to roll.' : 'Throw the dice to see each result and the total.'}
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section className="panel" aria-label="Recent dice rolls">
          <h2>Recent rolls</h2>
          <ol className="history">
            {history.map((h, i) => (
              <li key={i}><b>{h.summary.total}</b> from {h.formula}{!h.summary.complete && ' (a cocked die was not counted)'}</li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
