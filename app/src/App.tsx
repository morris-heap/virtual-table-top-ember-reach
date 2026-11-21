import { useState } from 'react'
import core from '../../data/core.json'
import AccountBar from './auth/AccountBar.tsx'
import { DEGREE_HINT, DEGREE_LABEL, endScene, MAX_STEPS, netModifierDie, rollTest, type TestResult } from './engine/dice'

const MOMENTUM_MAX = core.momentum.max

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

export default function App() {
  const [attribute, setAttribute] = useState(2)
  const [skill, setSkill] = useState(1)
  const [dc, setDc] = useState(12)
  const [boons, setBoons] = useState(0)
  const [banes, setBanes] = useState(0)
  const [momentum, setMomentum] = useState(0)
  const [history, setHistory] = useState<TestResult[]>([])
  const last = history[0]

  function onRoll() {
    const r = rollTest({ attribute, skill, dc, boons, banes })
    setHistory(h => [r, ...h].slice(0, 10))
    if (r.momentumGained) setMomentum(m => Math.min(MOMENTUM_MAX, m + r.momentumGained))
  }

  return (
    <main>
      <header>
        <AccountBar />
        <p className="eyebrow">Emberreach · v{core.version}</p>
        <h1>Test Roller</h1>
        <p className="sub">d20 + Attribute + Skill vs DC. Boons and Banes cancel one for one.</p>
      </header>

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

      <footer>First iteration of the Emberreach companion · <a href="https://github.com/morris-heap/virtual-table-top-ember-reach">GitHub</a></footer>
    </main>
  )
}
