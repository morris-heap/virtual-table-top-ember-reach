// Shows the toasts from engine/toast.ts in the corner. Mount it once, in main.tsx.
// A toast closes itself after its duration, but not while the pointer or keyboard focus is on it.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { dismissToast, getToasts, subscribeToasts, type Toast } from './engine/toast.ts'
import Link from './Link.tsx'

function ToastItem({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || toast.duration <= 0) return
    const timer = setTimeout(() => dismissToast(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [paused, toast.id, toast.duration])

  const text = (
    <>
      <strong>{toast.title}</strong>
      {toast.body && <span>{toast.body}</span>}
    </>
  )

  return (
    <li
      className={`toast ${toast.kind}`}
      // Errors interrupt a screen reader; everything else waits its turn.
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.to
        ? <Link to={toast.to} className="toast-text" onClick={() => dismissToast(toast.id)}>{text}</Link>
        : <div className="toast-text">{text}</div>}
      <button type="button" className="toast-close" aria-label={`Dismiss: ${toast.title}`} onClick={() => dismissToast(toast.id)}>×</button>
    </li>
  )
}

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts)
  if (toasts.length === 0) return null
  return (
    <ul className="toaster" aria-label="Notifications">
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </ul>
  )
}
