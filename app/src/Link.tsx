// A link that moves between screens without reloading the page. New-tab clicks still work normally.
import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './nav.ts'
import { pathFor, type Route } from './router.ts'

export default function Link({ to, onClick, ...rest }: { to: Exclude<Route, { name: 'notFound' }> | string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = typeof to === 'string' ? to : pathFor(to)
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    // Let the browser handle new-tab clicks and anything we didn't claim.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  return <a {...rest} href={href} onClick={handle} />
}
