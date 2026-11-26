// The editable character sheet with guided creation (docs/mockups/character-sheet-edit.html).
// Layout follows the mockup; the numbers and the rules help come from engine/sheet.ts and engine/help.ts.
import { useId, type ReactNode } from 'react'
import character from '../../../data/character.json'
import {
  allowances, ancestryInfo, attributeArray, BACKGROUNDS, callingInfo, creationSteps, derive, signed, skillBudget,
  mineralList, SKILLS, spellList, withBackground, withCalling, withFullVitals, withKit, ATTRIBUTE_NAMES, type CharacterSheet,
} from '../engine/sheet.ts'
import { Field } from './GenericField.tsx'
import Help from './Help.tsx'

type Change = (next: CharacterSheet) => void

/** A labelled control with its help button beside the label. */
function F({ label, topic, sheet, className, fixedId, children }: {
  label: string; topic: string; sheet: CharacterSheet; className?: string; fixedId?: string; children: (id: string) => ReactNode
}) {
  const generated = useId()
  const id = fixedId ?? generated
  return (
    <div className={`cs-f${className ? ` ${className}` : ''}`}>
      <div className="cs-flabel"><label htmlFor={id}>{label}</label><Help topic={topic} sheet={sheet} label={label} /></div>
      {children(id)}
    </div>
  )
}

function Steps({ sheet }: { sheet: CharacterSheet }) {
  const steps = creationSteps(sheet)
  const next = steps.find(s => !s.done)?.id
  return (
    <nav className="cs-steps" aria-label="Character creation steps">
      {steps.map((s, i) => (
        <button key={s.id} type="button" className={`cs-step${s.done ? ' done' : ''}${s.id === next ? ' now' : ''}`}
          aria-current={s.id === next ? 'step' : undefined}
          onClick={() => document.getElementById(`cs-${s.id}`)?.focus()}>
          <b>{i + 1} {s.title}{s.done && <span className="sr-only"> (done)</span>}</b>{s.summary}
        </button>
      ))}
    </nav>
  )
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="cs-stepper">
      <button type="button" aria-label={`Lower ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <b aria-label={`${label} ${value}`}>{value}</b>
      <button type="button" aria-label={`Raise ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  )
}

function Pick({ checked, onChange, name, cost, text }: { checked: boolean; onChange: (on: boolean) => void; name: string; cost?: string; text?: string }) {
  return (
    <label className="cs-pick" title={text}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{name}{text && <small className="cs-pick-text">{text}</small>}</span>
      {cost && <span className="cs-cost">{cost}</span>}
    </label>
  )
}

export default function SheetEdit({ sheet, change, error, portrait }: { sheet: CharacterSheet; change: Change; error: string; portrait: ReactNode }) {
  const set = (patch: Partial<CharacterSheet>) => change({ ...sheet, ...patch })
  const d = derive(sheet)
  const calling = callingInfo(sheet.calling)
  const ancestry = ancestryInfo(sheet.ancestry)
  const array = attributeArray(sheet)
  const budget = skillBudget(sheet)
  const allowed = allowances(sheet)
  const maxRank = sheet.level >= 7 ? character.skillRank.maxAtLevel7 : character.skillRank.max
  const guided = sheet.level === character.levels.min
  const known = new Set(calling?.talents.map(t => t.name))
  const extraTalents = sheet.talents.filter(t => !known.has(t))
  const spells = spellList(sheet.calling)
  const knownSpells = new Set(spells.map(s => s.name))
  const extraSpells = sheet.spells.filter(s => !knownSpells.has(s.name))
  const minerals = mineralList(sheet.calling)
  const extraMinerals = sheet.minerals.filter(name => !minerals.some(m => m.name === name))
  const background = BACKGROUNDS.find(b => b.name === sheet.background)
  const chips = [...array.left]
  const toggle = (list: string[], name: string, on: boolean) => on ? [...list, name] : list.filter(x => x !== name)

  return (
    <div className="cs">
      {guided && <Steps sheet={sheet} />}

      <section className="cs-panel cs-hero" aria-label="Hero">
        <div className="cs-identity">
          <div className="cs-name-row">
            <F label="Name" topic="name" sheet={sheet}>{id => <input id={id} className="cs-in" value={sheet.name} maxLength={80} onChange={e => set({ name: e.target.value })} />}</F>
            <F label="Level" topic="level" sheet={sheet}>{id => (
              <select id={id} className="cs-in" value={sheet.level} onChange={e => set({ level: Number(e.target.value) })}>
                {Array.from({ length: character.levels.max - character.levels.min + 1 }, (_, i) => i + character.levels.min).map(n => <option key={n}>{n}</option>)}
              </select>
            )}</F>
          </div>

          <div className="cs-fields">
            <F label="Player" topic="player" sheet={sheet}>{id => <input id={id} className="cs-in" value={sheet.player} maxLength={80} onChange={e => set({ player: e.target.value })} />}</F>
            <F label="Ancestry" topic="ancestry" sheet={sheet} fixedId="cs-ancestry">{id => (
              <select id={id} className="cs-in" value={sheet.ancestry} onChange={e => set({ ancestry: e.target.value })}>
                <option value="">Choose…</option>
                {!ancestry && sheet.ancestry && <option>{sheet.ancestry}</option>}
                {character.ancestries.map(a => <option key={a}>{a}</option>)}
              </select>
            )}</F>
            <F label="Calling" topic="calling" sheet={sheet} fixedId="cs-calling">{id => (
              <select id={id} className="cs-in" value={sheet.calling} onChange={e => change(withCalling(sheet, e.target.value))}>
                <option value="">Choose…</option>
                {!calling && sheet.calling && <option>{sheet.calling}</option>}
                {character.callings.map(c => <option key={c}>{c}</option>)}
              </select>
            )}</F>
            <F label="Background" topic="background" sheet={sheet} fixedId="cs-background">{id => (
              <>
                <input id={id} className="cs-in" list="cs-backgrounds" maxLength={80} value={sheet.background}
                  placeholder="Pick or write your own" onChange={e => change(withBackground(sheet, e.target.value))} />
                <datalist id="cs-backgrounds">{BACKGROUNDS.map(b => <option key={b.name} value={b.name} />)}</datalist>
              </>
            )}</F>
            <F label="Oath" topic="oath" sheet={sheet} className="wide" fixedId="cs-oath">{id => (
              <input id={id} className="cs-in" value={sheet.oath} maxLength={500}
                placeholder="Something your hero has sworn to do…" onChange={e => set({ oath: e.target.value })} />
            )}</F>
          </div>

          <div className="cs-section" id="cs-attributes" tabIndex={-1}>
            <h2>Attributes <Help topic="attributes" sheet={sheet} label="Attributes" /></h2>
            <div className="cs-attrs">
              {ATTRIBUTE_NAMES.map(name => {
                const key = name.toLowerCase() as keyof CharacterSheet['attributes']
                return (
                  <div className="cs-attr edit" key={name}>
                    <Stepper label={name} value={sheet.attributes[key]} min={character.attributeRange.min} max={character.attributeRange.max}
                      onChange={n => set({ attributes: { ...sheet.attributes, [key]: n } })} />
                    <small>{name} <Help topic={`attribute:${name}`} sheet={sheet} label={name} /></small>
                    {array.bonus === name && <span className="cs-bonus">+1 {sheet.ancestry}</span>}
                  </div>
                )
              })}
            </div>
            {guided && (
              <p className="cs-array">Attribute points left:{' '}
                {chips.length ? chips.map((n, i) => <span key={i} className="cs-chip">{signed(n)}</span>) : <span className="cs-ok">all placed</span>}
                {array.tooHigh && <span className="cs-warn"> An Attribute is above {signed(4)}, the most at level 1.</span>}
              </p>
            )}
          </div>

          <div className="cs-section" id="cs-numbers" tabIndex={-1}>
            <h2>Vital numbers <span className="cs-sub">· worked out for you</span></h2>
            <div className="cs-vitals">
              <div className="cs-vital"><small>Max Grit <Help topic="maxGrit" sheet={sheet} label="Max Grit" /></small><b>{d.maxGrit ?? '—'}</b>
                <div className="cs-derived">{calling ? `${calling.grit.base} + Might + ${calling.grit.perLevel}/level` : 'pick a Calling'}</div></div>
              <div className="cs-vital"><small>Max Ember <Help topic="maxEmber" sheet={sheet} label="Max Ember" /></small><b>{d.maxEmber ?? '—'}</b>
                <div className="cs-derived">{calling ? `${calling.ember.base} + ${calling.ember.attribute}` : 'pick a Calling'}</div></div>
              <div className="cs-vital"><small>Dodge <Help topic="dodge" sheet={sheet} label="Dodge" /></small><b>{signed(d.dodge)}</b><div className="cs-derived">Grace + armor + shield</div></div>
              <div className="cs-vital"><small>Will <Help topic="will" sheet={sheet} label="Will" /></small><b>{signed(d.will)}</b><div className="cs-derived">Spirit</div></div>
              <div className="cs-vital"><small>Speed <Help topic="speed" sheet={sheet} label="Speed" /></small><b>{d.speed}</b><div className="cs-derived">zones / move</div></div>
            </div>
            <div className="cs-fields">
              <F label="Current Grit" topic="maxGrit" sheet={sheet}>{id => <input id={id} type="number" min={0} className="cs-in" value={Number.isNaN(sheet.grit) ? '' : sheet.grit} onChange={e => set({ grit: e.target.valueAsNumber })} />}</F>
              <F label="Current Ember" topic="maxEmber" sheet={sheet}>{id => <input id={id} type="number" min={0} className="cs-in" value={Number.isNaN(sheet.ember) ? '' : sheet.ember} onChange={e => set({ ember: e.target.valueAsNumber })} />}</F>
              <F label="Death roll failures" topic="wounds" sheet={sheet}>{id => (
                <select id={id} className="cs-in" value={sheet.deathFails} onChange={e => set({ deathFails: Number(e.target.value) })}>
                  {Array.from({ length: character.deathRollFailures + 1 }, (_, i) => <option key={i}>{i}</option>)}
                </select>
              )}</F>
              <div className="cs-f cs-actions"><button type="button" className="account-btn" disabled={d.maxGrit === null} onClick={() => change(withFullVitals(sheet))}>Fill Grit and Ember to full</button></div>
            </div>
          </div>
        </div>

        {portrait}
      </section>

      <div className="cs-layout">
        <div className="cs-stack">
          <section className="cs-panel" aria-label="Skills" id="cs-skills" tabIndex={-1}>
            <h2>Skills <Help topic="skills" sheet={sheet} label="Skills" /></h2>
            {guided && (
              <p className="cs-budget">
                {calling ? `${sheet.calling} gives ${Object.entries(calling.skills).map(([s, r]) => `${s} ${r}`).join(', ')}` : 'Pick a Calling for its ranks'}
                {background ? ` · ${background.name} gives ${background.skills.join(', ')}` : ''}
                {' · '}Ranks spent: <b className={budget.left === 0 ? 'ok' : budget.left < 0 ? 'bad' : undefined}>{budget.used} of {budget.total}</b> · Max rank {maxRank}
              </p>
            )}
            <div className="cs-skills">
              {SKILLS.map(skill => {
                const source = budget.source(skill)
                return (
                  <div key={skill} className={`cs-skill${character.weaponSkills.includes(skill) ? ' weapon' : ''}`}>
                    <span>{skill}{guided && source && <span className="cs-src" title="C: your Calling · B: your Background">{source.split('').join('·')}</span>}</span>
                    <Stepper label={skill} value={sheet.skills[skill] ?? 0} min={character.skillRank.min} max={maxRank}
                      onChange={n => set({ skills: { ...sheet.skills, [skill]: n } })} />
                  </div>
                )
              })}
            </div>
          </section>

          <section className="cs-panel" aria-label="Gear" id="cs-gear" tabIndex={-1}>
            <h2>Gear <Help topic="gear" sheet={sheet} label="Gear" /></h2>
            {calling && <p className="cs-budget">{sheet.calling} kit: {calling.kit}.</p>}
            <div className="cs-fields">
              <F label="Armor" topic="armor" sheet={sheet}>{id => (
                <select id={id} className="cs-in" value={sheet.armor} onChange={e => set({ armor: e.target.value })}>
                  {character.armor.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}</F>
              <F label="Shield" topic="shield" sheet={sheet}>{id => (
                <select id={id} className="cs-in" value={sheet.shield ? 'yes' : 'no'} onChange={e => set({ shield: e.target.value === 'yes' })}>
                  <option value="no">No</option><option value="yes">Yes</option>
                </select>
              )}</F>
              <F label="Silver" topic="silver" sheet={sheet}>{id => <input id={id} type="number" min={0} className="cs-in" value={Number.isNaN(sheet.silver) ? '' : sheet.silver} onChange={e => set({ silver: e.target.valueAsNumber })} />}</F>
              <F label="Supply" topic="supplyDie" sheet={sheet}>{id => (
                <select id={id} className="cs-in" value={sheet.supplyDie} onChange={e => set({ supplyDie: e.target.value })}>
                  {character.supplyDice.map(s => <option key={s}>{s}</option>)}
                </select>
              )}</F>
            </div>
            <div className="cs-f"><div className="cs-flabel"><label htmlFor="cs-gear-text">Gear list</label><Help topic="gearList" sheet={sheet} label="Gear list" /></div>
              <textarea id="cs-gear-text" className="cs-in" rows={3} value={sheet.gear} onChange={e => set({ gear: e.target.value })} /></div>
            <div><button type="button" className="account-btn" disabled={!calling} onClick={() => change(withKit(sheet))}>
              {calling ? `Use the ${sheet.calling} kit` : 'Pick a Calling to use its kit'}</button></div>
          </section>

          <section className="cs-panel" aria-label="Attacks">
            <h2>Attacks <Help topic="attacks" sheet={sheet} label="Attacks" /></h2>
            {sheet.attacks.map((a, i) => {
              const patch = (p: Partial<typeof a>) => set({ attacks: sheet.attacks.map((x, j) => (j === i ? { ...x, ...p } : x)) })
              return (
                <div key={i} className="cs-attack">
                  <div className="cs-f"><div className="cs-flabel"><label htmlFor={`cs-atk-name-${i}`}>Weapon / Spell</label><Help topic="attackName" sheet={sheet} label="Weapon / Spell" /></div>
                    <input id={`cs-atk-name-${i}`} className="cs-in" placeholder="Dagger or Fireball" value={a.name} maxLength={80} onChange={e => patch({ name: e.target.value })} /></div>
                  <div className="cs-f"><div className="cs-flabel"><label htmlFor={`cs-atk-test-${i}`}>To hit</label><Help topic="toHit" sheet={sheet} label="To hit" /></div>
                    <input id={`cs-atk-test-${i}`} className="cs-in" placeholder="1d20 + 1" value={a.toHit} maxLength={40} onChange={e => patch({ toHit: e.target.value })} /></div>
                  <div className="cs-f"><div className="cs-flabel"><label htmlFor={`cs-atk-dmg-${i}`}>Damage</label><Help topic="damage" sheet={sheet} label="Damage" /></div>
                    <input id={`cs-atk-dmg-${i}`} className="cs-in" placeholder="1d6 + 1" value={a.damage} maxLength={40} onChange={e => patch({ damage: e.target.value })} /></div>
                  <div className="cs-f"><div className="cs-flabel"><label htmlFor={`cs-atk-props-${i}`}>Properties</label><Help topic="properties" sheet={sheet} label="Properties" /></div>
                    <input id={`cs-atk-props-${i}`} className="cs-in" placeholder="Throwable (near), fire, range far…" value={a.properties} maxLength={300} onChange={e => patch({ properties: e.target.value })} /></div>
                  <div className="cs-f"><div className="cs-flabel"><label htmlFor={`cs-atk-notes-${i}`}>Notes</label><Help topic="attackNotes" sheet={sheet} label="Notes" /></div>
                    <input id={`cs-atk-notes-${i}`} className="cs-in" value={a.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })} /></div>
                  <button type="button" className="account-btn" onClick={() => set({ attacks: sheet.attacks.filter((_, j) => j !== i) })}>Remove attack {i + 1}</button>
                </div>
              )
            })}
            <div><button type="button" className="account-btn" onClick={() => set({ attacks: [...sheet.attacks, { name: '', toHit: '', damage: '', properties: '', notes: '' }] })}>Add attack</button></div>
          </section>

          <section className="cs-panel" aria-label="Wounds">
            <h2>Wounds <Help topic="wounds" sheet={sheet} label="Wounds" /></h2>
            <p className="cs-budget">{d.woundSlots} slots. Roll a d6 for each Wound: 1 Might, 2 Grace, 3 Wits, 4 Lore, 5 Spirit, 6 Presence.</p>
            <div className="cs-wound-edit">
              {Array.from({ length: Math.max(d.woundSlots, sheet.wounds.length) }, (_, i) => (
                <div className="cs-f" key={i}>
                  <label className="cs-flabel" htmlFor={`cs-wound-${i}`}>Wound {i + 1}</label>
                  <select id={`cs-wound-${i}`} className="cs-in" value={sheet.wounds[i] ?? ''}
                    onChange={e => set({ wounds: Array.from({ length: Math.max(d.woundSlots, sheet.wounds.length) }, (_, j) => (j === i ? e.target.value : sheet.wounds[j] ?? '')).filter(Boolean) })}>
                    <option value="">Empty</option>
                    {ATTRIBUTE_NAMES.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="cs-stack">
          <section className="cs-panel" aria-label="Talents">
            <h2>Signature &amp; talents <Help topic="talents" sheet={sheet} label="Talents" /></h2>
            {calling ? (
              <>
                <p className="cs-budget">Signature: <b>{sheet.signature || calling.signature}</b> · Picked <b className={sheet.talents.length === allowed.talents ? 'ok' : sheet.talents.length > allowed.talents ? 'bad' : undefined}>{sheet.talents.length} of {allowed.talents}</b> talents</p>
                {calling.talents.map(t => (
                  <Pick key={t.name} name={t.name} cost={t.cost} text={t.text} checked={sheet.talents.includes(t.name)}
                    onChange={on => set({ talents: toggle(sheet.talents, t.name, on) })} />
                ))}
              </>
            ) : <p className="cs-budget">Pick a Calling to see its talents.</p>}
            {extraTalents.map(t => <Pick key={t} name={t} checked onChange={on => set({ talents: toggle(sheet.talents, t, on) })} />)}
          </section>

          <section className="cs-panel" aria-label="Spells">
            <h2>Spells <Help topic="spells" sheet={sheet} label="Spells" /></h2>
            {calling?.casting ? (
              <>
                <p className="cs-budget">{sheet.calling} starts with {calling.casting.startingSpells} {calling.casting.list} spells · Picked <b className={sheet.spells.length === allowed.spells ? 'ok' : sheet.spells.length > allowed.spells ? 'bad' : undefined}>{sheet.spells.length} of {allowed.spells}</b> · cast with d20 + {calling.casting.attribute} + Spellcraft</p>
                {spells.map(s => (
                  <Pick key={s.name} name={s.name} cost={`${s.ember} Ember`} text={`${s.target}. ${s.effect}`} checked={sheet.spells.some(x => x.name === s.name)}
                    onChange={on => set({ spells: on ? [...sheet.spells, { ...s }] : sheet.spells.filter(x => x.name !== s.name) })} />
                ))}
              </>
            ) : <p className="cs-budget">{calling ? `${sheet.calling}s don't have a spell list.` : 'Pick a Calling to see its spells.'}</p>}
            {extraSpells.length > 0 && (
              <Field name="spells" path="spells" value={extraSpells} error={error}
                change={next => set({ spells: [...sheet.spells.filter(s => knownSpells.has(s.name)), ...(next as CharacterSheet['spells'])] })} />
            )}
          </section>

          {(calling?.alchemy || sheet.minerals.length > 0) && (
            <section className="cs-panel" aria-label="Minerals">
              <h2>Minerals <Help topic="minerals" sheet={sheet} label="Minerals" /></h2>
              {calling?.alchemy && <p className="cs-budget">Known: <b className={sheet.minerals.length === allowed.minerals ? 'ok' : sheet.minerals.length > allowed.minerals ? 'bad' : undefined}>{sheet.minerals.length} of {allowed.minerals}</b> · {calling.alchemy.emberCost} Ember to swallow one</p>}
              {minerals.map(m => (
                <Pick key={m.name} name={m.name} cost={`${m.vein} · ${m.temper}`} text={m.power} checked={sheet.minerals.includes(m.name)}
                  onChange={on => set({ minerals: toggle(sheet.minerals, m.name, on) })} />
              ))}
              {extraMinerals.map(name => <Pick key={name} name={name} checked onChange={on => set({ minerals: toggle(sheet.minerals, name, on) })} />)}
            </section>
          )}

          <section className="cs-panel" aria-label="Contacts and notes">
            <h2>Contacts &amp; notes <Help topic="contacts" sheet={sheet} label="Contacts and notes" /></h2>
            <div className="cs-f"><div className="cs-flabel"><label htmlFor="cs-contacts">Contacts</label><Help topic="contacts" sheet={sheet} label="Contacts" /></div>
              <textarea id="cs-contacts" className="cs-in" rows={3} value={sheet.contacts} onChange={e => set({ contacts: e.target.value })} /></div>
            <div className="cs-f"><div className="cs-flabel"><label htmlFor="cs-notes">Notes</label><Help topic="notes" sheet={sheet} label="Notes" /></div>
              <textarea id="cs-notes" className="cs-in" rows={5} value={sheet.notes} onChange={e => set({ notes: e.target.value })} /></div>
          </section>
        </div>
      </div>
    </div>
  )
}
