// The player's profile (VTTER-71): display name, public player ID, and the Game Master switch.
import { useEffect, useState, type FormEvent } from 'react'
import { profileApi } from './api/client.ts'
import type { Profile as ProfileData } from './api/types.ts'
import type { Auth } from './auth/useAuth.ts'
import { DISPLAY_NAME_MAX } from './engine/friends.ts'
import Link from './Link.tsx'
import Shell, { LoadState } from './Shell.tsx'
import { useLoad } from './useLoad.ts'

type Saving = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string }

// Exported for component tests: the form takes the profile as a prop, so a test
// can render it without the network. The page itself still uses it directly.
export function ProfileForm({ profile, signInName, onSaved }: { profile: ProfileData; signInName: string; onSaved: (p: ProfileData) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [saving, setSaving] = useState<Saving>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  // Forget "Saved" after a moment so it doesn't linger next to new edits.
  useEffect(() => {
    if (saving.status !== 'saved') return
    const t = setTimeout(() => setSaving({ status: 'idle' }), 2500)
    return () => clearTimeout(t)
  }, [saving])

  async function save(patch: Partial<Pick<ProfileData, 'displayName' | 'gameMaster' | 'findable'>>) {
    setSaving({ status: 'saving' })
    try {
      onSaved(await profileApi.update(patch))
      setSaving({ status: 'saved' })
    } catch (e) {
      setSaving({ status: 'error', message: (e as Error).message })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save({ displayName: displayName.trim() })
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(profile.playerId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the ID is selectable on screen.
    }
  }

  return (
    <>
      <section className="panel" aria-labelledby="who-title">
        <h2 id="who-title">You</h2>
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Display name</span>
            <input value={displayName} maxLength={DISPLAY_NAME_MAX} placeholder={signInName} onChange={e => setDisplayName(e.target.value)} />
            <small className="muted">Shown to other players. Leave it empty to use “{signInName}”.</small>
          </label>
          <div className="form-actions">
            <button type="submit" className="account-btn primary" disabled={saving.status === 'saving' || displayName.trim() === profile.displayName}>
              Save name
            </button>
            <span role="status" className="muted">
              {saving.status === 'saving' && 'Saving…'}
              {saving.status === 'saved' && 'Saved'}
            </span>
          </div>
        </form>

        <div className="field">
          <span>Player ID</span>
          <div className="id-row">
            <code className="player-id">{profile.playerId}</code>
            <button type="button" className="account-btn" onClick={() => void copyId()}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <small className="muted">Share this so friends can find you. It never changes.</small>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={profile.findable === true}
            disabled={saving.status === 'saving'}
            onChange={e => void save({ findable: e.target.checked })}
          />
          <span>Let people find me by my display name</span>
        </label>
        <p className="muted">
          Off by default. When it is on, another player who types your whole display name in Add a friend sees it and your player ID,
          and nothing else.
          {profile.findable === true && profile.displayName === '' && ' You have no display name yet, so no one can find you until you set one.'}
        </p>
      </section>

      <section className="panel" aria-labelledby="gm-title">
        <h2 id="gm-title">Game Master</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={profile.gameMaster}
            disabled={saving.status === 'saving'}
            onChange={e => void save({ gameMaster: e.target.checked })}
          />
          <span>I'm a Game Master</span>
        </label>
        <p className="muted">
          Turns on GM tools: sharing the adventures you write and creating Games from them. Everyone can write adventures;
          they stay private until you share them. <Link to="/">Back to your adventures</Link>
        </p>
      </section>

      <section className="panel" aria-labelledby="friends-title">
        <h2 id="friends-title">Friends</h2>
        <p className="muted">
          Friends find you by your player ID (or, if you allow it above, your display name), and can read the adventures you share with them.{' '}
          <Link to="/friends">Open your friends list</Link>
        </p>
      </section>

      {saving.status === 'error' && <p className="notice error" role="alert">{saving.message}</p>}
    </>
  )
}

export default function Profile({ auth, name }: { auth: Auth; name: string }) {
  const profile = useLoad(profileApi.get)
  return (
    <Shell auth={auth}>
      <header>
        <p className="eyebrow">Settings</p>
        <h1>Profile</h1>
      </header>
      {profile.state.status !== 'ready'
        ? <LoadState state={profile.state} reload={profile.reload} what="your profile" />
        : <ProfileForm profile={profile.state.data} signInName={name} onSaved={profile.set} />}
    </Shell>
  )
}
