import { lazy, Suspense, useState } from 'react'
import core from '../../data/core.json'
import AccountBar from './auth/AccountBar.tsx'
import type { Auth } from './auth/useAuth.ts'
import { Logo } from './Landing.tsx'
import { DEGREE_HINT, DEGREE_LABEL, endScene, MAX_STEPS, netModifierDie, rollTest, type TestResult } from './engine/dice'

// The 3D dice tray loads on demand, so the Test roller's first load stays small (VTTER-79).
const DiceTray = lazy(() => import('./dice/DiceTray.tsx'))

const MOMENTUM_MAX = core.momentum.max

type Mode = 'test' | 'tray'

function Stepper({ label, value, min, max, signed = false, onChange }: {
  label: string; value: number; min: number; max: number; signed?: boolean; onChange: (v: number) => void
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <output aria-live="polite">{signed && value > 0 ? `+${value}` : value}</output>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  )
}

function describeMod(boons: number, banes: number) {
  const die = netModifierDie(boons, banes)
  if (die === 0) return 'No modifier die'
  return die > 0 ? `Boon: +1d${die}` : `Bane: −1d${-die}`
}

/** The Test roller and Momentum tracker: the app itself, for signed-in users and guests. */
export default function Roller({ auth, onHome }: { auth: Auth; onHome?: () => void }) {
  const [attribute, setAttribute] = useState(2)
  const [skill, setSkill] = useState(1)
  const [dc, setDc] = useState(12)
  const [boons, setBoons] = useState(0)
  const [banes, setBanes] = useState(0)
  const [momentum, setMomentum] = useState(0)
  const [history, setHistory] = useState<TestResult[]>([])
  const [mode, setMode] = useState<Mode>('test')
  const last = history[0]

  function onRoll() {
    const r = rollTest({ attribute, skill, dc, boons, banes })
    setHistory(h => [r, ...h].slice(0, 10))
    if (r.momentumGained) setMomentum(m => Math.min(MOMENTUM_MAX, m + r.momentumGained))
  }

  return (
    <main className={mode === 'tray' ? 'wide' : undefined}>
      <div className="topbar">
        {onHome
          ? <button type="button" className="brand" onClick={onHome} aria-label="Emberreach home"><Logo size={26} /><span>Emberreach</span></button>
          : <span className="brand"><Logo size={26} /><span>Emberreach</span></span>}
        <AccountBar auth={auth} />
      </div>
      <header>
        <p className="eyebrow">Emberreach · v{core.version}</p>
        <h1>{mode === 'test' ? 'Test Roller' : 'Dice Tray'}</h1>
        <p className="sub">
          {mode === 'test'
            ? 'd20 + Attribute + Skill vs DC. Boons and Banes cancel one for one.'
            : 'Throw any mix of dice and add them up. For the table: no Attributes, DCs or Momentum.'}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Roller mode">
        <button type="button" role="tab" id="tab-test" aria-selected={mode === 'test'} aria-controls="roller-panel" onClick={() => setMode('test')}>Test</button>
        <button type="button" role="tab" id="tab-tray" aria-selected={mode === 'tray'} aria-controls="roller-panel" onClick={() => setMode('tray')}>Dice tray</button>
      </div>

      {mode === 'tray' && (
        <div id="roller-panel" role="tabpanel" aria-labelledby="tab-tray" className="roller-panel">
          <Suspense fallback={<p className="muted" role="status">Loading the dice tray…</p>}>
            <DiceTray />
          </Suspense>
        </div>
      )}

      {mode === 'test' && <div id="roller-panel" role="tabpanel" aria-labelledby="tab-test" className="roller-panel">

      <section className="panel" aria-label="Test setup">
        <div className="grid">
          <Stepper label="Attribute" value={attribute} min={-1} max={5} signed onChange={setAttribute} />
          <Stepper label="Skill rank" value={skill} min={0} max={4} signed onChange={setSkill} />
          <Stepper label="Boons" value={boons} min={0} max={MAX_STEPS} onChange={setBoons} />
          <Stepper label="Banes" value={banes} min={0} max={MAX_STEPS} onChange={setBanes} />
        </div>

        <fieldset className="dcs">
          <legend>Difficulty</legend>
          {core.difficulties.map(d => (
            <button key={d.dc} type="button" className={d.dc === dc ? 'chip active' : 'chip'} aria-pressed={d.dc === dc} onClick={() => setDc(d.dc)}>
              {d.name} <span>{d.dc}</span>
            </button>
          ))}
        </fieldset>

        <p className="mod">{describeMod(boons, banes)}</p>
        <button type="button" className="roll" onClick={onRoll}>Roll the Test</button>
      </section>

      {last && (
        <section className={`result ${last.degree}`} aria-live="polite" aria-label="Result">
          <div className="total">{last.total}</div>
          <div>
            <h2>{DEGREE_LABEL[last.degree]}</h2>
            <p>{DEGREE_HINT[last.degree]}</p>
            <p className="math">
              d20 <b>{last.natural}</b> + {attribute} + {skill}
              {last.modDie && <> {last.modDie.sign > 0 ? '+' : '−'} d{last.modDie.sides} <b>{last.modDie.roll}</b></>}
              {' '}vs DC {last.dc} ({last.margin >= 0 ? '+' : ''}{last.margin})
            </p>
          </div>
        </section>
      )}

      <section className="panel momentum" aria-label="Momentum">
        <div className="momentum-head">
          <h2>Party Momentum</h2>
          <div className="pips" aria-label={`${momentum} of ${MOMENTUM_MAX}`}>
            {Array.from({ length: MOMENTUM_MAX }, (_, i) => <span key={i} className={i < momentum ? 'pip on' : 'pip'} />)}
          </div>
        </div>
        <div className="momentum-actions">
          <button type="button" onClick={() => setMomentum(m => Math.min(MOMENTUM_MAX, m + 1))}>+1</button>
          <button type="button" onClick={() => setMomentum(m => Math.max(0, m - 1))}>−1</button>
          <button type="button" onClick={() => setMomentum(endScene)} title="Momentum empties at the end of each scene">End scene</button>
        </div>
        <ul className="costs">
          {core.momentum.costs.map(c => (
            <li key={c.effect}>
              <button type="button" disabled={momentum < c.cost} onClick={() => setMomentum(m => m - c.cost)}>
                <span className="cost">{c.cost}</span> {c.effect}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {history.length > 1 && (
        <section className="panel" aria-label="Recent rolls">
          <h2>Recent rolls</h2>
          <ol className="history">
            {history.slice(1).map((r, i) => (
              <li key={i}><b>{r.total}</b> vs {r.dc}: {DEGREE_LABEL[r.degree]} <span>(d20 {r.natural})</span></li>
            ))}
          </ol>
        </section>
      )}
      </div>}

      <footer>First iteration of the Emberreach companion · <a href="https://github.com/morris-heap/virtual-table-top-ember-reach">GitHub</a></footer>
    </main>
  )
}
