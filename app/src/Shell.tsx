// The frame around every signed-in screen: brand (back to Home), the section links and the user menu, then the page.
import type { ReactNode } from 'react'
import AccountBar from './auth/AccountBar.tsx'
import type { Auth } from './auth/useAuth.ts'
import { Logo } from './Landing.tsx'
import Link from './Link.tsx'
import { useRoute } from './nav.ts'
import type { Route } from './router.ts'

type Section = 'home' | 'heroes' | 'adventures'

const SECTIONS: { section: Section; label: string; to: string }[] = [
  { section: 'home', label: 'Home', to: '/' },
  { section: 'heroes', label: 'Heroes', to: '/heroes' },
  { section: 'adventures', label: 'Adventures', to: '/adventures' },
]

/** Which top-bar link a screen belongs under, if any. */
function sectionOf(route: Route): Section | null {
  switch (route.name) {
    case 'home': case 'game': return 'home'
    case 'heroes': case 'hero': return 'heroes'
    case 'adventures': case 'adventure': case 'builtIn': return 'adventures'
    default: return null
  }
}

function TopNav() {
  const current = sectionOf(useRoute())
  return (
    <nav className="topnav" aria-label="Main">
      {SECTIONS.map(s => (
        <Link key={s.section} to={s.to} aria-current={s.section === current ? 'page' : undefined}>{s.label}</Link>
      ))}
    </nav>
  )
}

export default function Shell({ auth, wide = false, children }: { auth: Auth; wide?: boolean; children: ReactNode }) {
  return (
    <main className={wide ? 'wide' : undefined}>
      <div className="topbar">
        <Link to="/" className="brand" aria-label="Emberreach home"><Logo size={26} /><span>Emberreach</span></Link>
        {auth.state.status === 'signedIn' && <TopNav />}
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
