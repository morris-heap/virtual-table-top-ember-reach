// The read-only character sheet (docs/mockups/character-sheet-ui.html).
import { Fragment, type ReactNode } from 'react'
import character from '../../../data/character.json'
import { callingInfo, derive, MINERALS, signed, woundBanes, type CharacterSheet } from '../engine/sheet.ts'

// Same layout as sheets/character-sheet.md: three Skill / Rank pairs per row, read down each column, weapon skills last.
const columns = Math.ceil(character.skills.length / 3)
const skillRows: string[][] = [
  ...Array.from({ length: columns }, (_, r) => [0, 1, 2].map(c => character.skills[c * columns + r])),
  character.weaponSkills,
]

/** Keeps a roll like "1d20 + 1" on one line inside a narrow table cell. */
const nb = (text: string) => text.replace(/ /g, ' ')

const armorName =(id: string) => character.armor.find(a => a.id === id)?.name ?? id

function Dots({ rank, max }: { rank: number; max: number }) {
  return (
    <span className="cs-dots" role="img" aria-label={`rank ${rank} of ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < rank ? '' : 'off'}>●</span>)}
    </span>
  )
}

function Vital({ label, value, max, note }: { label: string; value: string | number; max?: number | null; note?: string }) {
  const pct = typeof value === 'number' && max ? Math.max(0, Math.min(100, (value / max) * 100)) : null
  return (
    <div className="cs-vital">
      <small>{label}</small>
      <b>{value}{max != null && <span className="cs-max"> / {max}</span>}</b>
      {pct !== null && <div className="cs-bar"><i style={{ width: `${pct}%` }} /></div>}
      {note && <div className="cs-derived">{note}</div>}
    </div>
  )
}

export default function SheetView({ sheet, portrait }: { sheet: CharacterSheet; portrait: ReactNode }) {
  const d = derive(sheet)
  const banes = woundBanes(sheet)
  const maxRank = sheet.level >= 7 ? character.skillRank.maxAtLevel7 : character.skillRank.max
  const calling = callingInfo(sheet.calling)
  const slots = Math.max(d.woundSlots, sheet.wounds.length)

  return (
    <div className="cs">
      <section className="cs-panel cs-hero" aria-label="Hero">
        <div className="cs-identity">
          <div className="cs-name-row">
            <h1>{sheet.name}</h1>
            <span className="cs-level">Level {sheet.level}</span>
          </div>
          <div className="cs-fields">
            {([['Player', sheet.player], ['Ancestry', sheet.ancestry], ['Calling', sheet.calling], ['Background', sheet.background]] as const).map(([label, value]) =>
              <div className="cs-field" key={label}><span className="cs-label">{label}</span><span>{value || '—'}</span></div>)}
          </div>
          <div className="cs-field"><span className="cs-label">Oath</span><span className="cs-oath">{sheet.oath ? `“${sheet.oath}”` : '—'}</span></div>

          <div>
            <h2>Attributes</h2>
            <div className="cs-attrs">
              {Object.entries(sheet.attributes).map(([key, value]) => {
                const name = key[0].toUpperCase() + key.slice(1)
                const bane = banes[name]
                return (
                  <div key={key} className={`cs-attr${bane ? ' bane' : ''}`} title={bane ? `Wound Bane ${bane}` : undefined}>
                    <b>{signed(value)}</b><small>{name}{bane ? ` · Bane ${bane}` : ''}</small>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h2>Vital numbers</h2>
            <div className="cs-vitals">
              <Vital label="Grit" value={sheet.grit} max={d.maxGrit} />
              <Vital label="Ember" value={sheet.ember} max={d.maxEmber} />
              <Vital label="Dodge" value={signed(d.dodge)} note="Grace + armor + shield" />
              <Vital label="Will" value={signed(d.will)} note="Spirit" />
              <Vital label="Speed" value={d.speed} note="zones / move" />
            </div>
          </div>
        </div>

        {portrait}
      </section>

      <div className="cs-layout">
        <div className="cs-stack">
          <section className="cs-panel" aria-label="Wounds">
            <h2>Wounds <span className="cs-sub">· {sheet.wounds.length} of {slots} slots</span></h2>
            <div className="cs-wounds">
              {Array.from({ length: slots }, (_, i) => {
                const attribute = sheet.wounds[i]
                return attribute
                  ? <div key={i} className="cs-wound on">✕ <b>{attribute}</b> · Bane {banes[attribute]}</div>
                  : <div key={i} className="cs-wound">○ Empty{i === sheet.wounds.length ? ', roll d6 when you take a Wound' : ''}</div>
              })}
            </div>
            <div className="cs-death">Death rolls:{' '}
              {Array.from({ length: character.deathRollFailures }, (_, i) =>
                <span key={i} className={`cs-pip${i < sheet.deathFails ? ' on' : ''}`} role="img" aria-label={i < sheet.deathFails ? 'failed' : 'open'} />)}
            </div>
          </section>

          <section className="cs-panel" aria-label="Skills">
            <h2>Skills (rank 0–{maxRank})</h2>
            <div className="cs-scroll">
              <table className="cs-skill-table">
                <thead><tr>{[0, 1, 2].map(c => <Fragment key={c}><th>Skill</th><th className="c">Rank</th></Fragment>)}</tr></thead>
                <tbody>
                  {skillRows.map((row, r) => (
                    <tr key={r}>{row.map(skill => (
                      <Fragment key={skill}>
                        <td className={character.weaponSkills.includes(skill) ? 'weapon' : undefined}>{skill}</td>
                        <td className="c rank"><Dots rank={sheet.skills[skill] ?? 0} max={maxRank} /> <span className="sr-only">{sheet.skills[skill] ?? 0}</span></td>
                      </Fragment>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cs-panel" aria-label="Gear">
            <h2>Gear</h2>
            <div className="cs-gear-row">
              <span><b>Armor:</b> {armorName(sheet.armor)}</span>
              <span><b>Shield:</b> {sheet.shield ? 'Yes' : 'No'}</span>
              <span><b>Silver:</b> {sheet.silver}</span>
              <span><b>Supply:</b> {sheet.supplyDie}</span>
            </div>
            <p className="cs-muted">{sheet.gear || 'Nothing written yet.'}</p>
          </section>
        </div>

        <div className="cs-stack">
          <section className="cs-panel" aria-label="Attacks">
            <h2>Attacks</h2>
            {sheet.attacks.length === 0 ? <p className="cs-muted">No attacks yet.</p> : (
              <div className="cs-scroll">
                <table>
                  <thead><tr><th>Weapon / Spell</th><th className="c">To hit</th><th className="c">Damage</th><th>Properties</th><th>Notes</th></tr></thead>
                  <tbody>{sheet.attacks.map((a, i) => (
                    <tr key={i}><td>{a.name}</td><td className="c">{nb(a.toHit) || '—'}</td><td className="c">{nb(a.damage) || '—'}</td><td>{a.properties}</td><td>{a.notes}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="cs-panel" aria-label="Signature and talents">
            <h2>Signature feature &amp; talents</h2>
            <ul className="cs-list">
              {(sheet.signature || calling) && (
                <li><b>Signature: {sheet.signature || calling?.signature}.</b>{' '}
                  {sheet.signature && sheet.signature !== calling?.signature ? '' : calling?.signatureText}</li>
              )}
              {sheet.talents.map(name => {
                const talent = calling?.talents.find(t => t.name === name)
                return (
                  <li key={name}><b>{name}.</b>{talent?.cost && <span className="cs-tag">{talent.cost}</span>} {talent?.text}</li>
                )
              })}
              {!sheet.signature && !calling && sheet.talents.length === 0 && <li className="cs-muted">Pick a Calling to see its signature feature.</li>}
            </ul>
          </section>

          <section className="cs-panel" aria-label="Spells">
            <h2>Spells</h2>
            {sheet.spells.length === 0 ? <p className="cs-muted">No spells.</p> : (
              <div className="cs-scroll">
                <table>
                  <thead><tr><th>Spell</th><th className="c">Ember</th><th>DC / Target</th><th>Effect</th></tr></thead>
                  <tbody>{sheet.spells.map((s, i) => (
                    <tr key={i}><td>{s.name}</td><td className="c">{s.ember}</td><td>{s.target}</td><td>{s.effect}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {(calling?.alchemy || sheet.minerals.length > 0) && (
            <section className="cs-panel" aria-label="Minerals">
              <h2>Minerals</h2>
              {sheet.minerals.length === 0 ? <p className="cs-muted">No minerals known.</p> : (
                <ul className="cs-list">
                  {sheet.minerals.map(name => {
                    const mineral = MINERALS.find(m => m.name === name)
                    return (
                      <li key={name}><b>{name}.</b>{mineral && <span className="cs-tag">{mineral.vein} · {mineral.temper}</span>} {mineral?.power}</li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="cs-panel" aria-label="Contacts and notes">
            <h2>Contacts &amp; notes</h2>
            {sheet.contacts || sheet.notes ? (
              <>
                {sheet.contacts && <p className="cs-pre">{sheet.contacts}</p>}
                {sheet.notes && <p className="cs-pre">{sheet.notes}</p>}
              </>
            ) : <p className="cs-muted">Nothing yet.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
