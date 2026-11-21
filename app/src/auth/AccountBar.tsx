// Header account controls inside the app (VTTER-53): avatar, name, saved-hero count and Sign out when signed in;
// Sign in when browsing as a guest. Renders nothing when sign-in isn't configured.
import type { Auth } from './useAuth.ts'

export default function AccountBar({ auth }: { auth: Auth }) {
  const { state } = auth
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
      <button type="button" className="account-btn" onClick={auth.signOut}>Sign out</button>
    </div>
  )
}
