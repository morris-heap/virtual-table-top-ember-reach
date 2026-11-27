// How many friends have chat messages waiting, for the dot on the Friends link (VTTER-109, ADR 0010).
// Polls the friends list while the tab is visible. A screen that marks a thread read calls `announceRead()`
// so the dot clears now instead of at the next poll.
// A friend whose chat goes from read to unread also gets a toast (VTTER-118), unless that chat is open
// or it is the first poll, when anything already waiting is not new.
import { useEffect, useRef, useState } from 'react'
import { friendsApi } from './api/client.ts'
import { newlyUnread, POLL_SECONDS, unreadCount, unreadIds } from './engine/chat.ts'
import { showToast } from './engine/toast.ts'

const READ_EVENT = 'emberreach:chat-read'

export function announceRead() {
  window.dispatchEvent(new Event(READ_EVENT))
}

/** `openChat` is the player ID of the chat on screen, if any. */
export function useUnread(enabled: boolean, openChat?: string): number {
  const [count, setCount] = useState(0)
  const openChatRef = useRef(openChat)
  useEffect(() => { openChatRef.current = openChat }, [openChat])

  useEffect(() => {
    if (!enabled) return
    let live = true
    let previous: Set<string> | null = null
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      // Wrapped so a missing or failing API leaves the dot as it was, instead of throwing out of an effect.
      Promise.resolve().then(() => friendsApi.list()).then(
        lists => {
          if (!live) return
          for (const f of newlyUnread(previous, lists.friends, openChatRef.current)) {
            showToast({ title: `New message from ${f.displayName}`, to: `/friends/${f.playerId}/chat` })
          }
          previous = unreadIds(lists.friends)
          setCount(unreadCount(lists.friends))
        },
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
