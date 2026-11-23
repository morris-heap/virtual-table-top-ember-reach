// Cache only this site's shell and fingerprinted assets. Never cache auth or API responses.
const CACHE = 'emberreach-shell-v1'
const root = new URL('./', self.location.href)
const isAsset = url => url.origin === root.origin && url.pathname.startsWith(`${root.pathname}assets/`)
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const response = await fetch(root.href, { cache: 'reload' })
    if (!response.ok) throw new Error('Unable to cache the app shell')
    const html = await response.clone().text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map(match => new URL(match[1], root)).filter(isAsset).map(url => url.href)
    await cache.addAll(assets)
    await cache.put(root.href, response)
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== root.origin) return
  // OAuth callbacks must be processed online and must never be stored in a cache.
  if (url.searchParams.has('code') || url.searchParams.has('error')) return
  if (event.request.mode === 'navigate' && url.pathname.startsWith(root.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          const cache = await caches.open(CACHE)
          await cache.put(root.href, response.clone())
        }
        return response
      } catch {
        return await caches.match(root.href) || Response.error()
      }
    })())
  } else if (isAsset(url)) {
    event.respondWith((async () => {
      // Fingerprinted same-origin assets are identical for module CORS and install requests.
      const cached = await caches.match(event.request, { ignoreVary: true })
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone())
      return response
    })())
  }
})
