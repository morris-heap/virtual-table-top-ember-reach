// Header account controls inside the app (VTTER-53, VTTER-71): a user menu with Settings and Sign out when signed in;
// Sign in when browsing as a guest. Renders nothing when sign-in isn't configured.
import { useEffect, useRef, useState } from 'react'
import Link from '../Link.tsx'
import type { Auth } from './useAuth.ts'

export default function AccountBar({ auth }: { auth: Auth }) {
  const { state } = auth
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  // Close the menu on a click elsewhere or on Escape (giving the focus back to the button).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (state.status === 'disabled') return null
  if (state.status === 'loading') return <div className="account" aria-busy="true">Checking sign-in…</div>

  if (state.status === 'signedOut') {
    return (
      <div className="account">
        <span>Browsing as a guest</span>
        <button type="button" className="account-btn primary" onClick={auth.signIn}>Sign in</button>
      </div>
    )
  }

  const { user } = state
  return (
    <div className="account menu-wrap" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {user.picture
          ? <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
          : <span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>}
        <b className="account-name-text">{user.name}</b>
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}>Settings</Link>
          <button type="button" role="menuitem" onClick={auth.signOut}>Sign out</button>
        </div>
      )}
    </div>
  )
}
