import { describe, expect, it } from 'vitest'
import { parseRoute, pathFor } from './router.ts'

const ID = '44444444-4444-4444-8444-444444444444'

describe('parseRoute', () => {
  it.each([
    ['/', { name: 'home' }],
    ['', { name: 'home' }],
    ['/profile', { name: 'profile' }],
    ['/profile/', { name: 'profile' }],
    ['/roller', { name: 'roller' }],
    ['/adventures/new', { name: 'adventure', id: 'new' }],
    [`/adventures/${ID}`, { name: 'adventure', id: ID }],
    [`/adventures/${ID.toUpperCase()}`, { name: 'adventure', id: ID }],
    ['/adventures/built-in/soot-kings-hearth', { name: 'builtIn', slug: 'soot-kings-hearth' }],
    [`/games/${ID}`, { name: 'game', id: ID }],
    [`/games/${ID.toUpperCase()}`, { name: 'game', id: ID }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route)
  })

  it.each([
    '/nope', '/profile/extra', '/adventures', '/adventures/123', `/adventures/${ID}/scenes`,
    '/adventures/built-in', '/adventures/built-in/Bad Slug', '/adventures/built-in/-x',
    '/games', '/games/new', `/games/${ID}/members`,
  ])('%s is not found', path => {
    expect(parseRoute(path)).toEqual({ name: 'notFound' })
  })

  it('pathFor is the inverse of parseRoute', () => {
    for (const path of ['/', '/profile', '/roller', '/adventures/new', `/adventures/${ID}`, '/adventures/built-in/soot-kings-hearth', `/games/${ID}`]) {
      const route = parseRoute(path)
      if (route.name === 'notFound') throw new Error(path)
      expect(pathFor(route)).toBe(path)
    }
  })
})
