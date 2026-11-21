// Chooses the screen (VTTER-59): the landing page for signed-out visitors, the app for signed-in users,
// and the app as a guest when a visitor picks "Try the Test roller" (kept for this tab only).
import { useState } from 'react'
import Landing, { Logo } from './Landing.tsx'
import Roller from './Roller.tsx'
import { useAuth } from './auth/useAuth.ts'

const GUEST = 'emberreach.guest'

function readGuest(): boolean {
  try {
    return sessionStorage.getItem(GUEST) === '1'
  } catch {
    return false
  }
}

function writeGuest(on: boolean) {
  try {
    if (on) sessionStorage.setItem(GUEST, '1')
    else sessionStorage.removeItem(GUEST)
  } catch {
    // Storage blocked: guest mode still works until the page reloads.
  }
}

export default function App() {
  const auth = useAuth()
  const [guest, setGuest] = useState(readGuest)

  const enterGuest = () => { writeGuest(true); setGuest(true); window.scrollTo(0, 0) }
  const leaveGuest = () => { writeGuest(false); setGuest(false); window.scrollTo(0, 0) }

  switch (auth.state.status) {
    case 'disabled': // no accounts configured: straight to the roller
    case 'signedIn':
      return <Roller auth={auth} />
    case 'loading':
      return (
        <div className="splash" role="status" aria-live="polite">
          <Logo size={56} />
          <span>Lighting the forge…</span>
        </div>
      )
    case 'signedOut':
      // A failed sign-in returns to the landing page so its error shows next to the buttons.
      return guest && !auth.state.error
        ? <Roller auth={auth} onHome={leaveGuest} />
        : <Landing auth={auth} onGuest={enterGuest} />
  }
}
