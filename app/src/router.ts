// The app's few screens, as pure functions so they are unit-testable. The browser side is in nav.tsx.
// The Cognito sign-in returns to the site root, so `/` must stay the home screen (auth/session.ts).

export type Route =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'roller' }
  /** A user-written adventure, or `new` for the blank editor. */
  | { name: 'adventure'; id: string }
  /** A built-in adventure, read-only. */
  | { name: 'builtIn'; slug: string }
  | { name: 'notFound' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9][a-z0-9-]*$/

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  const [first, second, third] = parts
  if (parts.length === 1 && first === 'profile') return { name: 'profile' }
  if (parts.length === 1 && first === 'roller') return { name: 'roller' }
  if (first === 'adventures') {
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
    case 'adventure': return `/adventures/${route.id}`
    case 'builtIn': return `/adventures/built-in/${route.slug}`
  }
}
