// Search the built-in enemies and NPCs and add them to the adventure being written.
import { useState } from 'react'
import type { Enemy, Npc } from './api/types.ts'
import { EnemyBlock, NpcBlock } from './AdventureCast.tsx'
import { ENEMY_TIERS, LEVELS, LIMITS, NPC_ATTITUDES, sceneLabel } from './engine/adventure.ts'
import { enemyFromLibrary, npcFromLibrary, searchEnemies, searchNpcs } from './engine/library.ts'

const levels = Array.from({ length: LEVELS.max - LEVELS.min + 1 }, (_, i) => LEVELS.min + i)

export function EnemyLibrary({ added, onAdd }: { added: Enemy[]; onAdd: (e: Enemy) => void }) {
  const [text, setText] = useState('')
  const [tier, setTier] = useState('')
  const [level, setLevel] = useState<number | null>(null)
  const found = searchEnemies({ text, tier, level })
  return (
    <details className="library">
      <summary>Add from the enemy library</summary>
      <div className="grid">
        <label className="field"><span>Search</span><input type="search" value={text} placeholder="wolf, undead, fire, flier…" onChange={e => setText(e.target.value)} /></label>
        <label className="field">
          <span>Tier</span>
          <select value={tier} onChange={e => setTier(e.target.value)}>
            <option value="">Any</option>
            {ENEMY_TIERS.map(t => <option key={t} value={t}>{sceneLabel(t)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Party level</span>
          <select value={level ?? ''} onChange={e => setLevel(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Any</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" role="status">{found.length} {found.length === 1 ? 'enemy' : 'enemies'}</p>
      <ul className="scenes library-list">
        {found.map(e => {
          const have = added.some(a => a.id === e.id)
          return (
            <li key={e.id} className="library-row">
              <ul className="scenes"><EnemyBlock e={e} /></ul>
              <button type="button" className="account-btn" disabled={have || added.length >= LIMITS.maxEnemies} aria-label={`Add ${e.name}`} onClick={() => onAdd(enemyFromLibrary(e))}>{have ? 'Added' : 'Add'}</button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

export function NpcLibrary({ added, onAdd }: { added: Npc[]; onAdd: (n: Npc) => void }) {
  const [text, setText] = useState('')
  const [attitude, setAttitude] = useState('')
  const found = searchNpcs({ text, attitude })
  return (
    <details className="library">
      <summary>Add from the NPC library</summary>
      <div className="grid">
        <label className="field"><span>Search</span><input type="search" value={text} placeholder="innkeeper, witch, rival…" onChange={e => setText(e.target.value)} /></label>
        <label className="field">
          <span>Attitude</span>
          <select value={attitude} onChange={e => setAttitude(e.target.value)}>
            <option value="">Any</option>
            {NPC_ATTITUDES.map(a => <option key={a} value={a}>{sceneLabel(a)}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" role="status">{found.length} {found.length === 1 ? 'NPC' : 'NPCs'}</p>
      <ul className="scenes library-list">
        {found.map(n => {
          const have = added.some(a => a.id === n.id)
          return (
            <li key={n.id} className="library-row">
              <ul className="scenes"><NpcBlock n={n} /></ul>
              <button type="button" className="account-btn" disabled={have || added.length >= LIMITS.maxNpcs} aria-label={`Add ${n.name}`} onClick={() => onAdd(npcFromLibrary(n))}>{have ? 'Added' : 'Add'}</button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
