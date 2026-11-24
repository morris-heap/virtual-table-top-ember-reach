// The circled "?" next to a field. Opens a short help card tailored to the hero, with a link to the rules.
// Only one card is open at a time, and Esc or ✕ closes it.
import { useEffect, useId, useState } from 'react'
import { helpFor } from '../engine/help.ts'
import type { CharacterSheet } from '../engine/sheet.ts'

/** Closes whichever card is open, so opening a new one never leaves two on screen. */
let closeOpenCard: (() => void) | null = null

export default function Help({ topic, sheet, label }: { topic: string; sheet: CharacterSheet; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const help = open ? helpFor(topic, sheet) : null

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    closeOpenCard?.()
    closeOpenCard = close
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (closeOpenCard === close) closeOpenCard = null
    }
  }, [open])

  return (
    <span className="cs-help">
      <button type="button" className={`cs-q${open ? ' open' : ''}`} aria-label={`Help: ${label}`} aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen(o => !o)}>?</button>
      {help && (
        <span className="cs-pop" id={id} role="region" aria-label={`${help.title} help`}>
          <span className="cs-pop-head">
            <strong>{help.title}</strong>
            <button type="button" className="cs-pop-close" aria-label="Close help" onClick={() => setOpen(false)}>✕</button>
          </span>
          {help.forLine && <span className="cs-for">{help.forLine}</span>}
          {help.paragraphs.map(p => <p key={p}>{p}</p>)}
          {help.math && <code className="cs-math">{help.math}</code>}
          <a href={help.rule.href} target="_blank" rel="noreferrer">Read more: {help.rule.label} →</a>
        </span>
      )}
    </span>
  )
}
