// How many friends have chat messages waiting, for the dot on the Friends link (VTTER-109, ADR 0010).
// Polls the friends list while the tab is visible. A screen that marks a thread read calls `announceRead()`
// so the dot clears now instead of at the next poll.
import { useEffect, useState } from 'react'
import { friendsApi } from './api/client.ts'
import { POLL_SECONDS, unreadCount } from './engine/chat.ts'

const READ_EVENT = 'emberreach:chat-read'

export function announceRead() {
  window.dispatchEvent(new Event(READ_EVENT))
}

export function useUnread(enabled: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      // Wrapped so a missing or failing API leaves the dot as it was, instead of throwing out of an effect.
      Promise.resolve().then(() => friendsApi.list()).then(
        lists => { if (live) setCount(unreadCount(lists.friends)) },
        () => {},
      )
    }
    refresh()
    const timer = setInterval(refresh, POLL_SECONDS.unread * 1000)
    window.addEventListener(READ_EVENT, refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener(READ_EVENT, refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled])

  return count
}
