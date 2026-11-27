// Import an adventure from a .json file. It only fills the editor; nothing is saved until the author presses Save.
import { useState, type ChangeEvent } from 'react'
import type { AdventureDraft } from './api/types.ts'
import { parseImport } from './engine/adventureImport.ts'

export default function AdventureImport({ hasContent, onImport }: { hasContent: boolean; onImport: (d: AdventureDraft) => void }) {
  const [errors, setErrors] = useState<string[]>([])
  const [note, setNote] = useState('')

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const result = parseImport(await file.text())
    if (!result.ok) { setErrors(result.errors); setNote(''); return }
    if (hasContent && !window.confirm('Replace what is in the editor with this adventure?')) return
    setErrors([])
    setNote(`Imported ${file.name}. Check it over, then save.`)
    onImport(result.draft)
  }

  return (
    <section className="panel" aria-labelledby="import-title">
      <h2 id="import-title">Import</h2>
      <label className="field">
        <span>Adventure file (.json)</span>
        <input type="file" accept=".json,application/json" onChange={e => void onFile(e)} />
      </label>
      {errors.length > 0 && (
        <div className="notice error" role="alert">
          <b>Can't import that file:</b>
          <ul>{errors.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <p role="status" className="muted">{note}</p>
    </section>
  )
}
