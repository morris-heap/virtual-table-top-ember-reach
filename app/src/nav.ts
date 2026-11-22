// Browser side of routing: history-based navigation and a hook that follows the URL. The pure part is router.ts.
import { useMemo, useSyncExternalStore } from 'react'
import { parseRoute, type Route } from './router.ts'

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

/** The current screen. Updates on Link clicks, `navigate()` and the browser's back and forward buttons. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname, () => '/')
  return useMemo(() => parseRoute(pathname), [pathname])
}
