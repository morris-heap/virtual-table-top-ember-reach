// Chooses the screen (VTTER-59): the landing page for signed-out visitors, Home and its screens for signed-in
// players (VTTER-71), and the Test roller as a guest when a visitor picks "Try the Test roller" (kept for this tab only).
import { useEffect, useState } from 'react'
import AdventureEditor from './AdventureEditor.tsx'
import Adventures from './Adventures.tsx'
import AdventureView from './AdventureView.tsx'
import BrowseGames from './BrowseGames.tsx'
import Chat from './Chat.tsx'
import FriendAdventure from './FriendAdventure.tsx'
import Friends from './Friends.tsx'
import GamePage from './GamePage.tsx'
import HeroPage from './HeroPage.tsx'
import Heroes from './Heroes.tsx'
import Home from './Home.tsx'
import Landing, { Logo } from './Landing.tsx'
import { navigate, useRoute } from './nav.ts'
import Profile from './Profile.tsx'
import Roller from './Roller.tsx'
import { useAuth, type Auth } from './auth/useAuth.ts'
import Link from './Link.tsx'

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

/** An address that matches no screen goes back to Home. */
function GoHome() {
  useEffect(() => navigate('/', { replace: true }), [])
  return null
}

/** The screens for a signed-in player (VTTER-71). */
function SignedIn({ auth, name }: { auth: Auth; name: string }) {
  const route = useRoute()
  switch (route.name) {
    case 'home': return <Home auth={auth} name={name} />
    case 'profile': return <Profile auth={auth} name={name} />
    case 'roller': return <Roller auth={auth} onHome={() => navigate('/')} />
    case 'heroes': return <Heroes auth={auth} />
    case 'hero': return <HeroPage auth={auth} id={route.id} />
    case 'adventures': return <Adventures auth={auth} />
    case 'adventure': return <AdventureEditor auth={auth} id={route.id} />
    case 'builtIn': return <AdventureView auth={auth} slug={route.slug} />
    case 'games': return <BrowseGames auth={auth} />
    case 'game': return <GamePage auth={auth} id={route.id} />
    case 'friends': return <Friends auth={auth} />
    case 'chat': return <Chat auth={auth} playerId={route.playerId} />
    case 'friendAdventure': return <FriendAdventure auth={auth} playerId={route.playerId} id={route.id} />
    case 'notFound': return <GoHome />
  }
}

export default function App() {
  const auth = useAuth()
  const route = useRoute()
  const [guest, setGuest] = useState(readGuest)

  const enterGuest = () => { writeGuest(true); setGuest(true); window.scrollTo(0, 0) }
  const leaveGuest = () => { writeGuest(false); setGuest(false); window.scrollTo(0, 0) }

  if (auth.state.status !== 'loading' && auth.state.status !== 'signedIn') {
    if (route.name === 'heroes') return <Heroes auth={auth} />
    if (route.name === 'hero') return <HeroPage auth={auth} id={route.id} />
  }

  switch (auth.state.status) {
    case 'disabled': // no accounts configured: straight to the roller
      return <><Link to="/heroes">Your local heroes</Link><Roller auth={auth} /></>
    case 'signedIn':
      return <SignedIn auth={auth} name={auth.state.user.name} />
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
        : <><Landing auth={auth} onGuest={enterGuest} /><p className="fine"><Link to="/heroes">Create or open local heroes without signing in</Link></p></>
  }
}
