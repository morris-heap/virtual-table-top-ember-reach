import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseSheet } from '../../../api/src/sheet.ts'
import { LocalCharacterRepository } from './repository.ts'

const mocks = vi.hoisted(() => ({ user: null as { sub: string } | null, call: vi.fn() }))
vi.mock('../auth/session.ts', () => ({ currentUser: () => mocks.user }))
vi.mock('../api/client.ts', () => ({ call: mocks.call }))
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); mocks.user = null; mocks.call.mockReset()
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('offers guest heroes without automatically uploading them and uploads only on request', async () => {
  const { characterRepository, uploadGuestHeroes } = await import('./current.ts')
  const guest = new LocalCharacterRepository(localStorage)
  await guest.save('hero-id', parseSheet({ name: 'Guest' }))
  mocks.user = { sub: 'a' }
  mocks.call.mockImplementation(async (_method, _path, sheet) => ({ ...sheet, id: 'hero-id', createdAt: 'now', updatedAt: 'now' }))
  characterRepository()
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.call).not.toHaveBeenCalled()
  await uploadGuestHeroes()
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(mocks.call.mock.calls[0][1]).toBe('/characters/hero-id')
  expect(await guest.list()).toEqual([])
  expect((await characterRepository().local.list())[0].name).toBe('Guest')
})
it('never sends the previous account outbox through a new account', async () => {
  const { characterRepository } = await import('./current.ts')
  mocks.user = { sub: 'a' }
  const old = characterRepository()
  await old.save('hero-id', parseSheet({ name: 'Private' }))
  mocks.user = { sub: 'b' }
  const next = characterRepository()
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(await next.local.list()).toEqual([])
  expect(old.local.entries()['hero-id'].pending).toBe('save')
})
