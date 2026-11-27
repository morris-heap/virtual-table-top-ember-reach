// Read-only enemy stat blocks and NPCs of an adventure (data/adventure.json, rules/gm-guide.md §2).
import type { Enemy, Npc, Scene } from './api/types.ts'
import { sceneLabel } from './engine/adventure.ts'

export function EnemyBlock({ e }: { e: Enemy }) {
  return (
    <li className="scene">
      <div className="scene-head"><b>{e.name}</b> <span className="chip-tag">{sceneLabel(e.tier)}</span></div>
      <p>
        Defense {e.defense} · Grit {e.grit} · Attack DC {e.attackDc}{e.damage && `, ${e.damage} damage`}
        {e.willDc !== null && ` · Will DC ${e.willDc}`}{e.resolve !== null && ` · Resolve ${e.resolve}`}
        {e.moves && ` · Moves ${e.moves}`}
      </p>
      {e.traits.length > 0 && <ul>{e.traits.map(t => <li key={t}><i>Trait:</i> {t}</li>)}</ul>}
      {e.dread.length > 0 && <ul>{e.dread.map(t => <li key={t}><i>Dread:</i> {t}</li>)}</ul>}
    </li>
  )
}

export function NpcBlock({ n }: { n: Npc }) {
  return (
    <li className="scene">
      <div className="scene-head"><b>{n.name}</b> <span className="chip-tag">{sceneLabel(n.attitude)}</span>{n.role && <span className="muted">{n.role}</span>}</div>
      {n.description && <p>{n.description}</p>}
      {n.secret && <p className="muted"><i>GM only:</i> {n.secret}</p>}
    </li>
  )
}

/** Who is in a scene, by name: its NPCs, then its enemies with counts. */
export function SceneWho({ scene, enemies, npcs }: { scene: Scene; enemies: Enemy[]; npcs: Npc[] }) {
  return (
    <>
      {scene.npcs.length > 0 && <p className="muted">NPCs: {scene.npcs.map(id => npcs.find(n => n.id === id)?.name ?? id).join(', ')}</p>}
      {scene.enemies.length > 0 && (
        <p className="muted">Enemies: {scene.enemies.map(x => `${x.count} × ${enemies.find(e => e.id === x.id)?.name ?? x.id}`).join(', ')}</p>
      )}
    </>
  )
}

export default function AdventureCast({ enemies, npcs }: { enemies: Enemy[]; npcs: Npc[] }) {
  return (
    <>
      {npcs.length > 0 && (
        <section className="panel" aria-labelledby="npcs-title">
          <h2 id="npcs-title">NPCs</h2>
          <ul className="scenes">{npcs.map(n => <NpcBlock key={n.id} n={n} />)}</ul>
        </section>
      )}
      {enemies.length > 0 && (
        <section className="panel" aria-labelledby="enemies-title">
          <h2 id="enemies-title">Enemies</h2>
          <ul className="scenes">{enemies.map(e => <EnemyBlock key={e.id} e={e} />)}</ul>
        </section>
      )}
    </>
  )
}
