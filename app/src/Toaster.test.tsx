import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toaster from './Toaster.tsx'
import { clearToasts, showToast } from './engine/toast.ts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  act(() => clearToasts())
  cleanup()
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a toast with its title and body', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Kit', body: 'Ready when you are' }) })
    expect(screen.getByRole('status')).toHaveTextContent('Kit')
    expect(screen.getByRole('status')).toHaveTextContent('Ready when you are')
  })

  it('announces an error as an alert', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Nope', kind: 'error' }) })
    expect(screen.getByRole('alert')).toHaveTextContent('Nope')
  })

  it('closes itself after its duration', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Bye', duration: 1000 }) })
    expect(screen.getByText('Bye')).toBeVisible()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('Bye')).toBeNull()
  })

  it('stays while the pointer is over it', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Hold', duration: 1000 }) })
    fireEvent.mouseEnter(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Hold')).toBeVisible()
    fireEvent.mouseLeave(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('Hold')).toBeNull()
  })

  it('stays until dismissed when the duration is 0', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Sticky', duration: 0 }) })
    act(() => { vi.advanceTimersByTime(60000) })
    fireEvent.click(screen.getByRole('button', { name: /dismiss: sticky/i }))
    expect(screen.queryByText('Sticky')).toBeNull()
  })

  it('links to a path when one is given', () => {
    render(<Toaster />)
    act(() => { showToast({ title: 'Open it', to: '/games/abc' }) })
    expect(screen.getByRole('link', { name: /open it/i })).toHaveAttribute('href', '/games/abc')
  })
})
