// Buttons that turn an adventure into a Game (VTTER-72): "Play solo" for anyone on a solo-playable built-in
// adventure, "Create game" for a Game Master. Both make a private Game and open it.
import { useState } from 'react'
import { gamesApi } from './api/client.ts'
import type { AdventureRef } from './api/types.ts'
import { newGame } from './engine/game.ts'
import { navigate } from './nav.ts'

export default function StartGame({ adventure, title, canSolo, isGm }: {
  adventure: AdventureRef; title: string; canSolo: boolean; isGm: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start(solo: boolean) {
    setBusy(true)
    setError(null)
    try {
      const id = crypto.randomUUID()
      await gamesApi.save(id, newGame(solo ? `${title} (solo)` : title, adventure, solo))
      navigate(`/games/${id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!canSolo && !isGm) return null
  return (
    <>
      <span className="row-actions">
        {canSolo && <button type="button" className="account-btn" disabled={busy} onClick={() => void start(true)}>Play solo</button>}
        {isGm && <button type="button" className="account-btn" disabled={busy} onClick={() => void start(false)}>Create game</button>}
      </span>
      {error && <span className="notice error" role="alert">{error}</span>}
    </>
  )
}
