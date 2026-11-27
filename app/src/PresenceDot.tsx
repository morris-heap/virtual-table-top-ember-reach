// A small dot for "is here now" (VTTER-73). Colour is never the only signal: it also has a text label for screen readers.
export default function PresenceDot({ online }: { online: boolean }) {
  return <span className={`presence-dot ${online ? 'online' : 'offline'}`} role="img" aria-label={online ? 'Online now' : 'Offline'} />
}
