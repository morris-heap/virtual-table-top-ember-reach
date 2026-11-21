// Header account controls (VTTER-53): Sign in when signed out; avatar, name, saved-hero count and Sign out
// when signed in. Renders nothing until sign-in is configured. The Test roller works either way.
import { useEffect, useState } from 'react'
import { apiUrl, authConfig } from './config.ts'
import type { User } from './oauth.ts'
import { completeSignIn, getAccessToken, signIn, signOut } from './session.ts'

type State =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: User; heroes?: number | 'error' }

async function countHeroes(): Promise<number | 'error' | undefined> {
  if (!apiUrl || !authConfig) return undefined
  const token = await getAccessToken(authConfig)
  if (!token) return 'error'
  try {
    const res = await fetch(`${apiUrl}/characters`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return 'error'
    return ((await res.json()) as { characters: unknown[] }).characters.length
  } catch {
    return 'error'
  }
}

export default function AccountBar() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!authConfig) return
    let live = true
    completeSignIn(authConfig)
      .then(async user => {
        if (!live) return
        if (!user) return setState({ status: 'signedOut' })
        setState({ status: 'signedIn', user })
        const heroes = await countHeroes()
        if (live) setState({ status: 'signedIn', user, heroes })
      })
      .catch((e: Error) => live && setState({ status: 'signedOut', error: e.message }))
    return () => { live = false }
  }, [])

  if (!authConfig) return null
  const cfg = authConfig

  if (state.status === 'loading') return <div className="account" aria-busy="true">Checking sign-in…</div>

  if (state.status === 'signedOut') {
    return (
      <div className="account">
        {state.error && <span className="account-error" role="alert">{state.error}</span>}
        <button type="button" className="account-btn primary" onClick={() => void signIn(cfg)}>Sign in</button>
      </div>
    )
  }

  const { user, heroes } = state
  return (
    <div className="account">
      {user.picture
        ? <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
        : <span className="avatar" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>}
      <span className="account-name">
        <b>{user.name}</b>
        {heroes !== undefined && (
          <small>{heroes === 'error' ? 'Saved heroes unavailable' : `${heroes} saved hero${heroes === 1 ? '' : 'es'}`}</small>
        )}
      </span>
      <button type="button" className="account-btn" onClick={() => void signOut(cfg)}>Sign out</button>
    </div>
  )
}
