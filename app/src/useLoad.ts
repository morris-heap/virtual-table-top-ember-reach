// Loads something from the API when a screen opens, with loading and error states and a retry.
import { useCallback, useEffect, useState } from 'react'

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { state: Loaded<T>; reload: () => void; set: (data: T) => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    load().then(
      data => live && setState({ status: 'ready', data }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    )
    return () => { live = false }
    // `load` is recreated on every render; callers list what it depends on in `deps`.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [attempt, ...deps])

  return {
    state,
    reload: useCallback(() => setAttempt(n => n + 1), []),
    set: useCallback((data: T) => setState({ status: 'ready', data }), []),
  }
}
