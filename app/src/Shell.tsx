// The frame around every signed-in screen: brand (back to Home) and the user menu, then the page.
import type { ReactNode } from 'react'
import AccountBar from './auth/AccountBar.tsx'
import type { Auth } from './auth/useAuth.ts'
import { Logo } from './Landing.tsx'
import Link from './Link.tsx'

export default function Shell({ auth, wide = false, children }: { auth: Auth; wide?: boolean; children: ReactNode }) {
  return (
    <main className={wide ? 'wide' : undefined}>
      <div className="topbar">
        <Link to="/" className="brand" aria-label="Emberreach home"><Logo size={26} /><span>Emberreach</span></Link>
        <AccountBar auth={auth} />
      </div>
      {children}
    </main>
  )
}

/** A line shown while a list loads, or with a retry when it didn't. */
export function LoadState({ state, reload, what }: {
  state: { status: 'loading' } | { status: 'error'; message: string }
  reload: () => void
  what: string
}) {
  if (state.status === 'loading') return <p className="muted" role="status">Loading {what}…</p>
  return (
    <p className="notice error" role="alert">
      {state.message} <button type="button" className="link-btn" onClick={reload}>Try again</button>
    </p>
  )
}
