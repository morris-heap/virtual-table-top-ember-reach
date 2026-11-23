import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSheet } from '../../../api/src/sheet.ts'
import { ApiError, request } from '../api/request.ts'
import { ApiCharacterRepository, LocalCharacterRepository, OfflineCharacterRepository, exportHero, importHero, type CharacterRepository } from './repository.ts'

const id = '07d4aa30-1872-4329-a58c-f65830eb5c25'
const sheet = parseSheet({ name: 'Ash' })
const hero = { ...sheet, id, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
function storage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}
function setup() {
  const fetcher = vi.fn<typeof fetch>()
  const token = vi.fn(async (force?: boolean) => force ? 'fresh' : 'old')
  const api = new ApiCharacterRepository(<T>(method: string, path: string, body?: unknown) => request<T>(`https://example.test${path}`, method, token, body, fetcher))
  return { fetcher, token, api }
}
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers })
afterEach(() => { vi.useRealTimers() })

describe('API character repository', () => {
  it('saves the shared sheet using only the bearer token for identity', async () => {
    const { fetcher, api } = setup()
    fetcher.mockResolvedValue(response(hero))
    expect(await api.save(id, sheet)).toEqual(hero)
    expect(fetcher).toHaveBeenCalledWith(`https://example.test/characters/${id}`, expect.objectContaining({
      method: 'PUT', headers: { Authorization: 'Bearer old', 'Content-Type': 'application/json' }, body: JSON.stringify(sheet),
    }))
  })
  it('lists heroes returned for the authenticated account', async () => {
    const { fetcher, api } = setup()
    fetcher.mockResolvedValue(response({ characters: [hero] }))
    expect(await api.list()).toEqual([hero])
  })
  it('forces one refresh on 401 and retries with the new access token', async () => {
    const { fetcher, token, api } = setup()
    fetcher.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(hero))
    expect(await api.get(id)).toEqual(hero)
    expect(token.mock.calls).toEqual([[false], [true]])
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer fresh' })
  })
  it('asks for sign-in after a second 401 without looping', async () => {
    const { fetcher, api } = setup()
    fetcher.mockImplementation(async () => response({}, 401))
    await expect(api.get(id)).rejects.toMatchObject({ status: 401, message: 'Your session expired. Sign in again.' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('does not fetch again when refresh has expired', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 401))
    await expect(request('/characters', 'GET', async force => force ? null : 'old', undefined, fetcher)).rejects.toMatchObject({ status: 401 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('preserves 404 and the validation message', async () => {
    const { fetcher, api } = setup()
    fetcher.mockResolvedValueOnce(response({ error: 'Character not found' }, 404))
      .mockResolvedValueOnce(response({ error: 'name must be 1-80 characters' }, 400))
    await expect(api.get(id)).rejects.toMatchObject({ status: 404 })
    await expect(api.save(id, sheet)).rejects.toMatchObject({ status: 400, message: 'name must be 1-80 characters' })
  })
  it('reads Retry-After seconds and dates', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { fetcher, api } = setup()
    fetcher.mockResolvedValueOnce(response({}, 503, { 'Retry-After': '12' }))
      .mockResolvedValueOnce(response({}, 503, { 'Retry-After': 'Thu, 01 Jan 2026 00:00:30 GMT' }))
    await expect(api.get(id)).rejects.toMatchObject({ status: 503, retryAfter: 12000 })
    await expect(api.get(id)).rejects.toMatchObject({ retryAfter: 30000 })
  })
  it('accepts an empty delete response', async () => {
    const { fetcher, api } = setup()
    fetcher.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(api.delete(id)).resolves.toBeUndefined()
  })
})

describe('durable offline storage and sync', () => {
  it('supports local CRUD, backup round trips, and account isolation', async () => {
    const disk = storage(), a = new LocalCharacterRepository(disk, 'a'), b = new LocalCharacterRepository(disk, 'b')
    await a.save(id, sheet)
    expect(await a.list()).toHaveLength(1)
    expect(await b.list()).toEqual([])
    expect(importHero(exportHero(await a.get(id)))).toEqual(sheet)
    expect(() => importHero('{"name":""}')).toThrow('name')
    await a.delete(id)
    await expect(a.get(id)).rejects.toMatchObject({ status: 404 })
  })
  it('debounces repeated edits and sends only the latest sheet', async () => {
    vi.useFakeTimers()
    const { fetcher, api } = setup()
    fetcher.mockResolvedValue(response({ ...hero, name: 'Latest' }))
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), api, () => true)
    await repo.save(id, sheet)
    await vi.advanceTimersByTimeAsync(300)
    await repo.save(id, { ...sheet, name: 'Latest' })
    await vi.advanceTimersByTimeAsync(599)
    expect(fetcher).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).name).toBe('Latest')
    expect(repo.state.message).toBe('Saved')
  })
  it('keeps saves through reload while offline, then syncs them', async () => {
    vi.useFakeTimers()
    const disk = storage(), { fetcher, api } = setup()
    const first = new OfflineCharacterRepository(new LocalCharacterRepository(disk), api, () => false)
    await first.save(id, sheet); first.stop()
    expect(first.state.message).toBe('Offline, will retry')
    const second = new OfflineCharacterRepository(new LocalCharacterRepository(disk), api, () => true)
    fetcher.mockResolvedValue(response(hero))
    await second.flush()
    expect(await second.local.get(id)).toEqual(hero)
    expect(second.local.entries()[id].pending).toBeUndefined()
  })
  it('honors 503 Retry-After even when another edit or manual retry occurs', async () => {
    vi.useFakeTimers()
    const { fetcher, api } = setup()
    fetcher.mockResolvedValueOnce(response({}, 503, { 'Retry-After': '10' })).mockResolvedValueOnce(response(hero))
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), api, () => true)
    await repo.save(id, sheet)
    await vi.advanceTimersByTimeAsync(600)
    expect(repo.state.message).toBe('Offline, will retry')
    await repo.save(id, { ...sheet, name: 'Edited' }); await repo.flush()
    await vi.advanceTimersByTimeAsync(9999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('falls back on fetch failure but does not hide 404 or 400', async () => {
    vi.useFakeTimers()
    const local = new LocalCharacterRepository(storage()); await local.save(id, sheet)
    const { fetcher, api } = setup()
    const repo = new OfflineCharacterRepository(local, api, () => true)
    fetcher.mockRejectedValueOnce(new TypeError('offline'))
    expect((await repo.get(id)).name).toBe('Ash')
    fetcher.mockResolvedValueOnce(response({}, 404))
    await expect(repo.get(id)).rejects.toMatchObject({ status: 404 })
    fetcher.mockResolvedValueOnce(response({ error: 'name is invalid' }, 400))
    await repo.save(id, sheet)
    await vi.advanceTimersByTimeAsync(5000)
    expect(repo.state.error).toMatchObject({ status: 400, message: 'name is invalid' })
    expect(local.entries()[id].pending).toBe('save')
    repo.stop()
  })
  it('does not erase an edit made during a save', async () => {
    vi.useFakeTimers()
    let finish!: (value: typeof hero) => void
    const remote: CharacterRepository = { list: async () => [], get: async () => hero, delete: async () => {},
      save: vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
        .mockImplementation(async (_id, data) => ({ ...hero, ...data })) }
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), remote, () => true)
    await repo.save(id, sheet)
    const pending = repo.flush()
    await repo.save(id, { ...sheet, name: 'Newer' })
    finish(hero); await pending
    expect((await repo.local.get(id)).name).toBe('Newer')
    expect(repo.local.entries()[id].pending).toBe('save')
    await vi.advanceTimersByTimeAsync(600)
    expect(repo.local.entries()[id].pending).toBeUndefined()
  })
  it('persists delete tombstones and treats remote 404 as already deleted', async () => {
    vi.useFakeTimers()
    const local = new LocalCharacterRepository(storage()); await local.save(id, sheet)
    const { fetcher, api } = setup()
    const repo = new OfflineCharacterRepository(local, api, () => true)
    await repo.delete(id)
    expect(await local.list()).toEqual([])
    fetcher.mockResolvedValue(response({}, 404))
    await repo.flush()
    expect(local.entries()).toEqual({}); repo.stop()
  })
  it('retries a newer edit when an older in-flight save fails validation', async () => {
    vi.useFakeTimers()
    let fail!: (error: Error) => void
    const remote: CharacterRepository = { list: async () => [], get: async () => hero, delete: async () => {},
      save: vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
        .mockImplementation(async (_id, data) => ({ ...hero, ...data })) }
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), remote, () => true)
    await repo.save(id, sheet)
    const pending = repo.flush()
    await repo.save(id, { ...sheet, name: 'Corrected' })
    await vi.advanceTimersByTimeAsync(600)
    fail(new ApiError('name was rejected', 400)); await pending
    await vi.advanceTimersByTimeAsync(600)
    expect(repo.local.entries()[id].pending).toBeUndefined()
    expect((await repo.local.get(id)).name).toBe('Corrected')
  })
  it('caches full sheets from another device for offline use', async () => {
    const { fetcher, api } = setup()
    fetcher.mockResolvedValueOnce(response({ characters: [hero] })).mockResolvedValueOnce(response(hero))
    let online = true
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), api, () => online)
    expect(await repo.list()).toHaveLength(1)
    online = false
    expect(await repo.get(id)).toEqual(hero)
  })
  it('reports storage failures instead of claiming Saved', async () => {
    const local = new LocalCharacterRepository({ getItem: () => null, setItem: () => { throw new Error('Storage full') } })
    await expect(local.save(id, sheet)).rejects.toThrow('Storage full')
  })
  it('does not silently overwrite malformed local storage', async () => {
    const local = new LocalCharacterRepository({ getItem: () => 'broken', setItem: vi.fn() })
    await expect(local.save(id, sheet)).rejects.toThrow()
  })
  it('preserves 401 as an actionable error with the queued hero intact', async () => {
    vi.useFakeTimers()
    const { fetcher, api } = setup()
    fetcher.mockImplementation(async () => response({}, 401))
    const repo = new OfflineCharacterRepository(new LocalCharacterRepository(storage()), api, () => true)
    await repo.save(id, sheet); await repo.flush()
    expect(repo.state.error).toBeInstanceOf(ApiError)
    expect(repo.state.message).toContain('Sign in again')
    expect(repo.local.entries()[id].pending).toBe('save'); repo.stop()
  })
})
