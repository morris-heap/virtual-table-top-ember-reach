// The layer tree (docs/mockups/map-editor.html): every object nested under the one it sits on (`on`).
import { childrenOf, effectiveProps, KIND_LABELS, objectLabel, propertyDef, typeDef, type MapDoc, type MapObject } from '../engine/mapModel.ts'

/** The tags a row shows: GM-only, and the properties that act now. */
function tags(o: MapObject) {
  const now = Object.keys(effectiveProps(o)).filter(p => propertyDef(p)?.acts === 'now')
  return { gm: !!o.gmOnly, now }
}

function kindLine(o: MapObject) {
  const kind = KIND_LABELS[o.kind]
  if (o.kind === 'route') return `${kind} · ${o.line ?? 'fill'}`
  if (o.kind === 'entity' || o.kind === 'static') return `${kind} · ${typeDef(o.type)?.label ?? o.type}`
  return o.name ? `${kind} · ${typeDef(o.type)?.label ?? o.type}` : kind
}

function Branch({ map, parent, selectedId, onSelect, depth }: {
  map: Pick<MapDoc, 'objects'>; parent: string | null; selectedId: string | null; onSelect(id: string): void; depth: number
}) {
  const kids = childrenOf(map, parent)
  if (!kids.length || depth > 12) return null
  return (
    <ul role={depth ? 'group' : 'tree'} aria-label={depth ? undefined : 'Layers'}>
      {kids.map(o => {
        const t = tags(o)
        const selected = o.id === selectedId
        return (
          <li key={o.id} role="treeitem" aria-selected={selected}>
            <button type="button" className={`layer${selected ? ' sel' : ''}`} onClick={() => onSelect(o.id)}>
              <span className="layer-name">{objectLabel(o)}</span>
              <small>{kindLine(o)}</small>
              {t.now.map(p => <span key={p} className="map-tag now">{p}</span>)}
              {t.gm && <span className="map-tag gm">GM</span>}
            </button>
            <Branch map={map} parent={o.id} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          </li>
        )
      })}
    </ul>
  )
}

export default function LayerTree({ map, selectedId, onSelect }: { map: Pick<MapDoc, 'objects'>; selectedId: string | null; onSelect(id: string): void }) {
  if (!map.objects.length) return <p className="muted">No objects yet. Pick a kind and a type, then press Add.</p>
  // Objects whose `on` points at nothing on the map still show, at the top level.
  const ids = new Set(map.objects.map(o => o.id))
  const orphans = map.objects.filter(o => o.on && !ids.has(o.on))
  return (
    <div className="map-tree">
      <Branch map={map} parent={null} selectedId={selectedId} onSelect={onSelect} depth={0} />
      {orphans.length > 0 && (
        <ul aria-label="Not on any layer">
          {orphans.map(o => (
            <li key={o.id}><button type="button" className="layer" onClick={() => onSelect(o.id)}>{objectLabel(o)} <small>sits on a missing object</small></button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
