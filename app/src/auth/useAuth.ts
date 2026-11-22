// Sign-in state for the whole app (VTTER-53, VTTER-59). Finishes a pending sign-in on load, then reports
// whether the visitor is signed in. The Home screen loads the signed-in user's heroes itself (VTTER-71).
import { useCallback, useEffect, useState } from 'react'
import { authConfig } from './config.ts'
import type { User } from './oauth.ts'
import { completeSignIn, signIn, signOut } from './session.ts'

export type AuthState =
  | { status: 'disabled' } // sign-in isn't configured (no Cognito client id): the app runs without accounts
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; user: User }

export interface Auth {
  state: AuthState
  signIn: () => void
  signUp: () => void
  signOut: () => void
}

export function useAuth(): Auth {
  const [state, setState] = useState<AuthState>(authConfig ? { status: 'loading' } : { status: 'disabled' })

  useEffect(() => {
    if (!authConfig) return
    let live = true
    completeSignIn(authConfig)
      .then(user => {
        if (live) setState(user ? { status: 'signedIn', user } : { status: 'signedOut' })
      })
      .catch((e: Error) => live && setState({ status: 'signedOut', error: e.message }))
    return () => { live = false }
  }, [])

  return {
    state,
    signIn: useCallback(() => { if (authConfig) void signIn(authConfig) }, []),
    signUp: useCallback(() => { if (authConfig) void signIn(authConfig, 'signup') }, []),
    signOut: useCallback(() => { if (authConfig) void signOut(authConfig) }, []),
  }
}
