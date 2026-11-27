import { describe, expect, it } from 'vitest'
import gameData from '../../../data/game.json'
import type { Friend, GameMember } from '../api/types.ts'
import { HEARTBEAT_MS, onlineFirst, presenceText, withOnline } from './presence.ts'

const member = (playerId: string, online = false): GameMember => ({
  playerId, displayName: '', role: 'player', hero: null, mine: false, online, friend: false,
})
const friend = (playerId: string, online: boolean, game: Friend['game'] = null): Friend => ({ playerId, displayName: '', online, game })

describe('heartbeat', () => {
  it('comes from data/game.json and beats well inside the online window, so one missed beat is not offline', () => {
    expect(HEARTBEAT_MS).toBe(gameData.presence.heartbeatSeconds * 1000)
    expect(HEARTBEAT_MS * 2).toBeLessThanOrEqual(gameData.presence.onlineSeconds * 1000)
  })
})

describe('withOnline', () => {
  it('sets exactly the listed players online and the rest offline', () => {
    const out = withOnline([member('A', true), member('B'), member('C')], ['B'])
    expect(out.map(m => m.online)).toEqual([false, true, false])
  })
  it('keeps the same objects when nothing changed', () => {
    const roster = [member('A', true), member('B')]
    const out = withOnline(roster, ['A'])
    expect(out[0]).toBe(roster[0])
    expect(out[1]).toBe(roster[1])
  })
})

describe('onlineFirst', () => {
  it('puts online friends first and keeps the order within each group', () => {
    const list = [friend('A', false), friend('B', true), friend('C', false), friend('D', true)]
    expect(onlineFirst(list).map(f => f.playerId)).toEqual(['B', 'D', 'A', 'C'])
  })
})

describe('presenceText', () => {
  it('names the Game only when the API sent it', () => {
    expect(presenceText(friend('A', false))).toBe('Offline')
    expect(presenceText(friend('A', true))).toBe('In a Game')
    expect(presenceText(friend('A', true, { id: 'g', name: 'Friday' }))).toContain('Friday')
  })
})
