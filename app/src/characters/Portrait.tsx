// A hero's portrait: shown in View, and uploaded, replaced or removed in Edit (VTTER-55).
import { useRef, useState } from 'react'
import { useLoad } from '../useLoad.ts'
import { characterRepository } from './current.ts'
import { PORTRAIT_ACCEPT, portraitApi } from './portrait.ts'

export default function Portrait({ heroId, signedIn, editable }: { heroId: string; signedIn: boolean; editable: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const loaded = useLoad(() => (signedIn ? portraitApi.url(heroId) : Promise.resolve(null)), [heroId, signedIn])
  const url = loaded.state.status === 'ready' ? loaded.state.data : null
  const shownError = error || (loaded.state.status === 'error' ? loaded.state.message : '')

  async function run(job: () => Promise<void>) {
    setBusy(true); setError('')
    try { await job(); loaded.reload() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  // A new hero is saved on this device first; the portrait needs it on the server.
  const upload = (file: File) => run(async () => { await characterRepository().flush(); await portraitApi.upload(heroId, file) })
  const remove = () => run(() => portraitApi.remove(heroId))

  return (
    <div className="cs-portrait-wrap">
      <div className="cs-portrait" aria-label="Character portrait">
        {signedIn && url
          ? <img className="cs-portrait-img" src={url} alt="" />
          : (
            <div className="cs-portrait-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
              <span>{signedIn ? 'No portrait yet' : 'Sign in to add a portrait'}</span>
            </div>
          )}
      </div>
      {editable && signedIn && (
        <div className="cs-portrait-actions">
          <input ref={input} type="file" hidden accept={PORTRAIT_ACCEPT} aria-label="Portrait image"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
          <button type="button" className="account-btn" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Working…' : url ? 'Replace portrait' : 'Upload portrait'}
          </button>
          {url && <button type="button" className="account-btn danger" disabled={busy} onClick={() => void remove()}>Remove</button>}
          <small className="cs-portrait-note">PNG, JPEG or WebP, up to 1 MB. Only you can see it.</small>
        </div>
      )}
      {shownError && <p className="notice error" role="alert">{shownError}</p>}
    </div>
  )
}
