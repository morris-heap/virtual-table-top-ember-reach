// Sign-in state for the whole app (VTTER-53, VTTER-59). Finishes a pending sign-in on load, then reports
// whether the visitor is signed in, and once they are, how many heroes they've saved.
import { useCallback, useEffect, useState } from 'react'
import { apiUrl, authConfig } from './config.ts'
import type { SocialProvider, User } from './oauth.ts'
import { completeSignIn, getAccessToken, signIn, signOut } from './session.ts'

export type AuthState =
  | { status: 'disabled' } // sign-in isn't configured (no Cognito client id): the app runs without accounts
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: User; heroes?: number | 'error' }

export interface Auth {
  state: AuthState
  signIn: () => void
  signUp: () => void
  signInWith: (provider: SocialProvider) => void
  signOut: () => void
}

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

export function useAuth(): Auth {
  const [state, setState] = useState<AuthState>(authConfig ? { status: 'loading' } : { status: 'disabled' })

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

  return {
    state,
    signIn: useCallback(() => { if (authConfig) void signIn(authConfig) }, []),
    signUp: useCallback(() => { if (authConfig) void signIn(authConfig, 'signup') }, []),
    signInWith: useCallback((p: SocialProvider) => { if (authConfig) void signIn(authConfig, 'signin', p) }, []),
    signOut: useCallback(() => { if (authConfig) void signOut(authConfig) }, []),
  }
}
