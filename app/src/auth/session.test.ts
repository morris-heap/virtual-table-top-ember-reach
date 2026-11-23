import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { currentUser, getAccessToken } from './session.ts'

const cfg = { domain: 'login.example.test', clientId: 'client', redirectUri: 'https://app.example.test/' }
const idToken = `x.${btoa(JSON.stringify({ sub: 'account-a', name: 'Tester' }))}.x`
let data: Map<string, string>
beforeEach(() => {
  data = new Map([['emberreach.auth.tokens', JSON.stringify({ accessToken: 'old', idToken, refreshToken: 'refresh', expiresAt: Date.now() + 3600000 })]])
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
it('forces refresh for a rejected token even when its expiry is in the future', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', id_token: idToken, expires_in: 3600 })))
  vi.stubGlobal('fetch', fetcher)
  expect(await getAccessToken(cfg)).toBe('old')
  expect(fetcher).not.toHaveBeenCalled()
  expect(await getAccessToken(cfg, true)).toBe('new')
  expect(fetcher.mock.calls[0][1].body.get('grant_type')).toBe('refresh_token')
})
it('shares concurrent refreshes', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', id_token: idToken })))
  vi.stubGlobal('fetch', fetcher)
  expect(await Promise.all([getAccessToken(cfg, true), getAccessToken(cfg, true)])).toEqual(['new', 'new'])
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('retains the account identity when refresh is unreachable or revoked', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('{}', { status: 400 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(getAccessToken(cfg, true)).rejects.toMatchObject({ status: 0 })
  expect(currentUser()?.sub).toBe('account-a')
  expect(await getAccessToken(cfg, true)).toBeNull()
  expect(currentUser()?.sub).toBe('account-a')
})
it('does not restore tokens if the user signs out during refresh', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
  const pending = getAccessToken(cfg, true)
  data.clear()
  finish(new Response(JSON.stringify({ access_token: 'new', id_token: idToken })))
  expect(await pending).toBeNull()
  expect(currentUser()).toBeNull()
})
