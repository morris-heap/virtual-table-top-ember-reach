// The app's few screens, as pure functions so they are unit-testable. The browser side is in nav.tsx.
// The Cognito sign-in returns to the site root, so `/` must stay the home screen (auth/session.ts).

export type Route =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'roller' }
  /** All your heroes. */
  | { name: 'heroes' }
  /** One of your heroes, or `new` to make one. */
  | { name: 'hero'; id: string }
  /** Built-in adventures and the ones you wrote. */
  | { name: 'adventures' }
  /** A user-written adventure, or `new` for the blank editor. */
  | { name: 'adventure'; id: string }
  /** A built-in adventure, read-only. */
  | { name: 'builtIn'; slug: string }
  /** A Game you are in, or one you were sent the link to (VTTER-72). */
  | { name: 'game'; id: string }
  | { name: 'notFound' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9][a-z0-9-]*$/

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  const [first, second, third] = parts
  if (parts.length === 1 && first === 'profile') return { name: 'profile' }
  if (parts.length === 1 && first === 'roller') return { name: 'roller' }
  if (parts.length === 1 && first === 'heroes') return { name: 'heroes' }
  if (first === 'heroes' && parts.length === 2 && (second === 'new' || UUID.test(second))) return { name: 'hero', id: second.toLowerCase() }
  if (first === 'games' && parts.length === 2 && UUID.test(second)) return { name: 'game', id: second.toLowerCase() }
  if (first === 'adventures') {
    if (parts.length === 1) return { name: 'adventures' }
    if (parts.length === 2 && (second === 'new' || UUID.test(second))) return { name: 'adventure', id: second.toLowerCase() }
    if (parts.length === 3 && second === 'built-in' && SLUG.test(third)) return { name: 'builtIn', slug: third }
  }
  return { name: 'notFound' }
}

export function pathFor(route: Exclude<Route, { name: 'notFound' }>): string {
  switch (route.name) {
    case 'home': return '/'
    case 'profile': return '/profile'
    case 'roller': return '/roller'
    case 'heroes': return '/heroes'
    case 'hero': return `/heroes/${route.id}`
    case 'adventures': return '/adventures'
    case 'adventure': return `/adventures/${route.id}`
    case 'builtIn': return `/adventures/built-in/${route.slug}`
    case 'game': return `/games/${route.id}`
  }
}
