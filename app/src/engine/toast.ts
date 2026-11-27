// A tiny toast store: pure state plus a module-level instance, so any code can call showToast().
// The clock and timers live in Toaster.tsx; this file only decides what is on screen.

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  /** Where clicking the toast goes (an in-app path, for example `/games/<id>`). */
  to?: string
  /** Milliseconds until it closes itself. 0 keeps it until dismissed. */
  duration: number
}

export type ToastInput = Partial<Pick<Toast, 'kind' | 'body' | 'to' | 'duration'>> & { title: string }

/** Most toasts on screen at once: a newer one pushes the oldest off. */
export const MAX_TOASTS = 4
export const DEFAULT_DURATION = 6000
/** Errors stay a little longer, because they ask the reader to do something. */
export const ERROR_DURATION = 10000

export function addToast(list: readonly Toast[], input: ToastInput, id: number): Toast[] {
  const kind = input.kind ?? 'info'
  const toast: Toast = {
    id,
    kind,
    title: input.title,
    body: input.body,
    to: input.to,
    duration: input.duration ?? (kind === 'error' ? ERROR_DURATION : DEFAULT_DURATION),
  }
  return [...list, toast].slice(-MAX_TOASTS)
}

export function removeToast(list: readonly Toast[], id: number): Toast[] {
  return list.filter(t => t.id !== id)
}

// --- the shared instance ---

let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

const emit = () => listeners.forEach(l => l())

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const getToasts = (): readonly Toast[] => toasts

/** Show a toast and return its id. */
export function showToast(input: ToastInput): number {
  const id = nextId++
  toasts = addToast(toasts, input, id)
  emit()
  return id
}

export function dismissToast(id: number): void {
  const next = removeToast(toasts, id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

/** Test helper: empty the store. */
export function clearToasts(): void {
  toasts = []
  emit()
}
