import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addToast, clearToasts, dismissToast, DEFAULT_DURATION, ERROR_DURATION, getToasts, MAX_TOASTS,
  removeToast, showToast, subscribeToasts, type Toast,
} from './toast.ts'

afterEach(clearToasts)

describe('addToast', () => {
  it('defaults to an info toast with the standard duration', () => {
    const [t] = addToast([], { title: 'Hi' }, 1)
    expect(t).toMatchObject({ id: 1, kind: 'info', title: 'Hi', duration: DEFAULT_DURATION })
  })

  it('keeps errors up longer, unless a duration is given', () => {
    expect(addToast([], { title: 'x', kind: 'error' }, 1)[0].duration).toBe(ERROR_DURATION)
    expect(addToast([], { title: 'x', kind: 'error', duration: 0 }, 1)[0].duration).toBe(0)
  })

  it('drops the oldest toast past the limit', () => {
    let list: Toast[] = []
    for (let i = 1; i <= MAX_TOASTS + 2; i++) list = addToast(list, { title: `t${i}` }, i)
    expect(list).toHaveLength(MAX_TOASTS)
    expect(list[0].id).toBe(3)
    expect(list.at(-1)!.id).toBe(MAX_TOASTS + 2)
  })
})

describe('removeToast', () => {
  it('removes only the named toast', () => {
    const list = addToast(addToast([], { title: 'a' }, 1), { title: 'b' }, 2)
    expect(removeToast(list, 1).map(t => t.id)).toEqual([2])
  })
})

describe('the shared store', () => {
  it('shows, notifies and dismisses', () => {
    const listener = vi.fn()
    const off = subscribeToasts(listener)
    const id = showToast({ title: 'Hello' })
    expect(getToasts().map(t => t.id)).toEqual([id])
    dismissToast(id)
    expect(getToasts()).toHaveLength(0)
    expect(listener).toHaveBeenCalledTimes(2)
    off()
  })

  it('does not notify when dismissing a toast that is already gone', () => {
    const id = showToast({ title: 'Hello' })
    dismissToast(id)
    const listener = vi.fn()
    const off = subscribeToasts(listener)
    dismissToast(id)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})
