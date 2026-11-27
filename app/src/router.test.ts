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
    ['/heroes', { name: 'heroes' }],
    ['/heroes/new', { name: 'hero', id: 'new' }],
    [`/heroes/${ID}`, { name: 'hero', id: ID }],
    [`/heroes/${ID.toUpperCase()}`, { name: 'hero', id: ID }],
    ['/adventures', { name: 'adventures' }],
    ['/adventures/', { name: 'adventures' }],
    ['/adventures/new', { name: 'adventure', id: 'new' }],
    [`/adventures/${ID}`, { name: 'adventure', id: ID }],
    [`/adventures/${ID.toUpperCase()}`, { name: 'adventure', id: ID }],
    ['/adventures/built-in/soot-kings-hearth', { name: 'builtIn', slug: 'soot-kings-hearth' }],
    ['/games', { name: 'games' }],
    [`/games/${ID}`, { name: 'game', id: ID }],
    [`/games/${ID.toUpperCase()}`, { name: 'game', id: ID }],
    ['/friends', { name: 'friends' }],
    ['/friends/', { name: 'friends' }],
    [`/friends/EMBER-7K2Q9F/adventures/${ID}`, { name: 'friendAdventure', playerId: 'EMBER-7K2Q9F', id: ID }],
    [`/friends/ember-7k2q9/adventures/${ID.toUpperCase()}`, { name: 'friendAdventure', playerId: 'EMBER-7K2Q9', id: ID }],
    ['/friends/EMBER-7K2Q9F/chat', { name: 'chat', playerId: 'EMBER-7K2Q9F' }],
    ['/friends/ember-7k2q9/chat', { name: 'chat', playerId: 'EMBER-7K2Q9' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route)
  })

  it.each([
    '/nope', '/profile/extra', '/heroes/123', `/heroes/${ID}/sheet`, '/adventures/123', `/adventures/${ID}/scenes`,
    '/adventures/built-in', '/adventures/built-in/Bad Slug', '/adventures/built-in/-x',
    '/games/new', `/games/${ID}/members`,
    '/friends/extra', '/friends/EMBER-7K2Q9F', `/friends/EMBER-7K2Q9F/adventures`, `/friends/EMBER-7K2Q9F/heroes/${ID}`,
    `/friends/EMBER-0O1IL/adventures/${ID}`, '/friends/EMBER-7K2Q9F/adventures/123',
    '/friends/EMBER-0O1IL/chat', '/friends/EMBER-7K2Q9F/chat/extra', '/friends/EMBER-7K2Q9F/messages',
  ])('%s is not found', path => {
    expect(parseRoute(path)).toEqual({ name: 'notFound' })
  })

  it('pathFor is the inverse of parseRoute', () => {
    for (const path of ['/', '/profile', '/roller', '/heroes', '/heroes/new', `/heroes/${ID}`, '/adventures', '/adventures/new', `/adventures/${ID}`, '/adventures/built-in/soot-kings-hearth', '/games', `/games/${ID}`, '/friends', `/friends/EMBER-7K2Q9F/adventures/${ID}`, '/friends/EMBER-7K2Q9F/chat']) {
      const route = parseRoute(path)
      if (route.name === 'notFound') throw new Error(path)
      expect(pathFor(route)).toBe(path)
    }
  })
})
