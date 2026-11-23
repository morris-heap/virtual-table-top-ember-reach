import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Auth } from '../auth/useAuth.ts'
import { characterRepository, characters, uploadGuestHeroes } from './current.ts'
import { importHero, LocalCharacterRepository } from './repository.ts'

export default function HeroTools({ auth, reload }: { auth: Auth; reload: () => void }) {
  const repo = characterRepository()
  const save = useSyncExternalStore(repo.subscribe, repo.snapshot)
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void new LocalCharacterRepository(localStorage).list().then(heroes => setCount(heroes.length)).catch(e => setMessage(e.message))
  }, [])
  async function upload() {
    setBusy(true)
    try { await uploadGuestHeroes(); setCount(0); setMessage('Local heroes added to your account. Pending uploads will retry automatically.'); reload() }
    catch (e) { setMessage((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="panel">
    <p role="status">{save.message}</p>
    {save.error && 'status' in save.error && save.error.status === 401 && <button className="account-btn" onClick={auth.signIn}>Sign in again</button>}
    {auth.state.status === 'signedIn' && count > 0 && <p>{count} local {count === 1 ? 'hero' : 'heroes'} on this device.{' '}
      <button className="account-btn" disabled={busy} onClick={() => void upload()}>Upload local heroes</button></p>}
    <label className="field"><span>Import hero backup (JSON)</span><input type="file" accept=".json,application/json" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      setBusy(true)
      try {
        if (file.size > 256 * 1024) throw new Error('Choose a hero backup smaller than 256 KB.')
        await characters.save(crypto.randomUUID(), importHero(await file.text()))
        setMessage('Hero imported.'); reload()
      } catch (error) { setMessage((error as Error).message) }
      finally { setBusy(false) }
    }} /></label>
    {message && <p role="status">{message}</p>}
  </div>
}
