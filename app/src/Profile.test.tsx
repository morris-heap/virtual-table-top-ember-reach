// The Profile page must show the player ID exactly as the API returns it.
//
// This is the PR-safe half of the player ID coverage. It renders the real
// component with a fake profile, so it needs no network, no browser and no AWS
// access. It cannot prove the deployed API *generates* 6-character IDs -- that
// is what app/e2e/player-id.spec.ts does against the live deploy (VTTER-83).
// What it does prove is that whatever the API returns reaches the screen
// unaltered: not truncated, not reformatted, and with no leading or trailing
// space that would break a copy-and-paste invite.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileForm } from './Profile.tsx'
import type { Profile } from './api/types.ts'

const profile = (playerId: string): Profile => ({ displayName: '', gameMaster: false, playerId })

function show(playerId: string) {
  render(<ProfileForm profile={profile(playerId)} signInName="Kit" onSaved={vi.fn()} />)
  return screen.getByText(playerId)
}

// Vitest does not auto-clean between tests here, and Testing Library queries the
// whole document, so a leftover render would make queries ambiguous.
afterEach(cleanup)

describe('Profile player ID', () => {
  it('shows a 6-character ID exactly as the API returned it', () => {
    const el = show('EMBER-7K2Q9F')
    expect(el).toBeVisible()
    // Rendered verbatim: a trimmed or re-cased ID would not match an invite.
    expect(el.textContent).toBe('EMBER-7K2Q9F')
  })

  it('shows the older 5-character IDs too', () => {
    // A player ID never changes (ADR 0005), so accounts created before VTTER-82
    // still have 5 characters and must keep displaying correctly.
    expect(show('EMBER-7K2Q9').textContent).toBe('EMBER-7K2Q9')
  })

  it('does not truncate the longer ID', () => {
    // Guards the failure this pairs with: a fixed-width field or a slice(0, 11)
    // left over from 5-character IDs would silently drop the last character,
    // and the shortened ID would fail every invite.
    const el = show('EMBER-NQVRXW')
    expect(el.textContent).toHaveLength('EMBER-'.length + 6)
    expect(el.textContent?.endsWith('W')).toBe(true)
  })

  it('offers the ID for copying', () => {
    // Players share the ID by copying it, so the control must be present.
    show('EMBER-7K2Q9F')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
  })
})
