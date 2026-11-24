import { describe, expect, it } from 'vitest'
import { parseSheet, ValidationError } from '../src/sheet.ts'

const attack = (a: unknown) => parseSheet({ name: 'Ash', attacks: [a] }).attacks[0]

describe('attacks', () => {
  it('keeps to hit and damage as text, plus properties and a note', () => {
    expect(attack({ name: 'Dagger', toHit: '+3', damage: 'd6 + 1', properties: 'Throwable (near)', notes: 'Family blade' }))
      .toEqual({ name: 'Dagger', toHit: '+3', damage: 'd6 + 1', properties: 'Throwable (near)', notes: 'Family blade' })
  })

  it('leaves everything but the name blank by default', () => {
    expect(attack({ name: 'Shove' })).toEqual({ name: 'Shove', toHit: '', damage: '', properties: '', notes: '' })
  })

  it('limits the text lengths', () => {
    expect(() => attack({ name: 'A', toHit: 'x'.repeat(41) })).toThrow(ValidationError)
    expect(() => attack({ name: 'A', properties: 'x'.repeat(301) })).toThrow(/attacks\[0\]\.properties/)
  })

  describe('heroes saved with a numeric testBonus', () => {
    it('turns the bonus into text', () => {
      expect(attack({ name: 'Bolt', testBonus: 5, damage: '1d10', notes: 'Fire, far' }))
        .toEqual({ name: 'Bolt', toHit: '+5', damage: '1d10', properties: '', notes: 'Fire, far' })
      expect(attack({ name: 'Club', testBonus: -1 }).toHit).toBe('-1')
      expect(attack({ name: 'Rock', testBonus: 0 }).toHit).toBe('')
    })
    it('prefers the new field when both are present', () => {
      expect(attack({ name: 'A', toHit: '+2', testBonus: 9 }).toHit).toBe('+2')
    })
    it('still rejects a bad old bonus', () => {
      expect(() => attack({ name: 'A', testBonus: 99 })).toThrow(/testBonus/)
    })
  })
})
