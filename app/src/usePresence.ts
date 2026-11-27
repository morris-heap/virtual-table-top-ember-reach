// While a Game page is open and visible, tell the API every few seconds that this player is here, and
// pass back who else is (VTTER-73). The API takes the player from the token, so this can only ever mark you.
import { useEffect, useRef } from 'react'
import { gamesApi, presenceApi } from './api/client.ts'
import { HEARTBEAT_MS } from './engine/presence.ts'

export function usePresence(gameId: string, onOnline: (playerIds: string[]) => void) {
  // The newest callback, so the timer never has to restart when the roster changes.
  const latest = useRef(onOnline)
  useEffect(() => { latest.current = onOnline })

  useEffect(() => {
    let live = true
    async function beat() {
      // A hidden tab is not "at the table": skip the beat and let the dot lapse.
      if (document.visibilityState === 'hidden') return
      try {
        const { online } = await gamesApi.heartbeat(gameId)
        if (live) latest.current(online)
      } catch {
        // Presence is a nicety. A failed beat is just a missed one, and the next one tries again.
      }
    }
    void beat()
    const timer = setInterval(() => void beat(), HEARTBEAT_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void beat() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [gameId])
}

/**
 * Everywhere except a Game page: tell the API this player has the app open and visible, so friends see them as
 * online (ADR 0012). A Game page beats for its own Game instead, so the two never fight over the same item.
 */
export function useAppPresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const beat = () => {
      if (document.visibilityState === 'hidden') return
      presenceApi.heartbeat().catch(() => { /* a missed beat; the next one tries again */ })
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [enabled])
}
