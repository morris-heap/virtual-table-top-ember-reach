import { parseSheet, type CharacterSheet } from '../../../api/src/sheet.ts'
import type { Hero, HeroSummary } from '../api/types.ts'
import { ApiError } from '../api/request.ts'

export type { CharacterSheet }
export interface CharacterRepository {
  list(): Promise<HeroSummary[]>
  get(id: string): Promise<Hero>
  save(id: string, sheet: CharacterSheet): Promise<Hero>
  delete(id: string): Promise<void>
}

export type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>
export class ApiCharacterRepository implements CharacterRepository {
  private call: Call
  constructor(call: Call) { this.call = call }
  async list() { return (await this.call<{ characters: HeroSummary[] }>('GET', '/characters')).characters }
  get(id: string) { return this.call<Hero>('GET', `/characters/${encodeURIComponent(id)}`) }
  save(id: string, sheet: CharacterSheet) { return this.call<Hero>('PUT', `/characters/${encodeURIComponent(id)}`, sheet) }
  delete(id: string) { return this.call<void>('DELETE', `/characters/${encodeURIComponent(id)}`) }
}

type Entry = { hero: Hero; pending?: 'save' | 'delete' }
export class LocalCharacterRepository implements CharacterRepository {
  private storage: Pick<Storage, 'getItem' | 'setItem'>
  private key: string
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, scope = 'guest') {
    this.storage = storage
    this.key = `emberreach.heroes.v1.${scope}`
  }
  entries(): Record<string, Entry> {
    const raw = this.storage.getItem(this.key)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Local hero storage is damaged. Export your backup before continuing.')
    return data
  }
  put(id: string, entry?: Entry) {
    const entries = this.entries()
    if (entry) entries[id] = entry
    else delete entries[id]
    this.storage.setItem(this.key, JSON.stringify(entries))
  }
  async list() { return Object.values(this.entries()).filter(e => e.pending !== 'delete').map(e => e.hero) }
  async get(id: string) {
    const entry = this.entries()[id]
    if (!entry || entry.pending === 'delete') throw new ApiError('Character not found', 404)
    return entry.hero
  }
  async save(id: string, sheet: CharacterSheet, pending?: 'save') {
    const now = new Date().toISOString()
    const hero = { ...parseSheet(sheet), id, createdAt: this.entries()[id]?.hero.createdAt ?? now, updatedAt: now }
    this.put(id, { hero, ...(pending ? { pending } : {}) })
    return hero
  }
  async delete(id: string) { this.put(id) }
}

export type SaveState = { message: string; error?: Error }
/** Durable outbox. A repository belongs to one account for its entire lifetime. */
export class OfflineCharacterRepository implements CharacterRepository {
  readonly local: LocalCharacterRepository
  private remote: CharacterRepository | null
  private online: () => boolean
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private revision = 0
  private retryAt = 0
  private stopped = false
  private listeners = new Set<() => void>()
  state: SaveState = { message: 'Saved' }
  constructor(local: LocalCharacterRepository, remote: CharacterRepository | null, online = () => navigator.onLine) {
    this.local = local; this.remote = remote; this.online = online
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.state
  private report(message: string, error?: Error) {
    this.state = { message, error }; this.listeners.forEach(fn => fn())
  }
  private schedule(ms: number) {
    if (this.stopped) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, Math.max(ms, this.retryAt - Date.now()))
  }
  stop() { this.stopped = true; clearTimeout(this.timer) }
  async list() {
    if (!this.remote || !this.online()) return this.local.list()
    try {
      const remote = await this.remote.list()
      await Promise.all(remote.map(async summary => {
        if (this.local.entries()[summary.id]?.pending) return
        const cached = this.local.entries()[summary.id]?.hero
        if (cached?.updatedAt === summary.updatedAt) return
        let hero: Hero
        try { hero = await this.remote!.get(summary.id) }
        catch (e) { if (e instanceof ApiError && e.status === 404) return; throw e }
        if (!this.local.entries()[summary.id]?.pending) this.local.put(summary.id, { hero })
      }))
      const entries = this.local.entries()
      const merged = new Map(remote.map(h => [h.id, h]))
      for (const [id, entry] of Object.entries(entries)) {
        if (entry.pending === 'delete') merged.delete(id)
        else if (entry.pending === 'save') merged.set(id, entry.hero)
        else if (!merged.has(id)) this.local.put(id)
      }
      return [...merged.values()]
    } catch (error) {
      if (!this.fallback(error)) { this.report((error as Error).message, error as Error); throw error }
      return this.local.list()
    }
  }
  async get(id: string) {
    if (!this.remote || !this.online() || this.local.entries()[id]?.pending) return this.local.get(id)
    try {
      const hero = await this.remote.get(id)
      // Do not replace an edit made while the request was in flight.
      if (!this.local.entries()[id]?.pending) this.local.put(id, { hero })
      return this.local.get(id)
    } catch (error) {
      if (!this.fallback(error)) throw error
      return this.local.get(id)
    }
  }
  private fallback(error: unknown) {
    if (!(error instanceof ApiError) || ![0, 503].includes(error.status)) return false
    this.report('Offline, will retry')
    this.retryAt = Date.now() + error.retryAfter
    this.schedule(error.retryAfter)
    return true
  }
  async save(id: string, sheet: CharacterSheet) {
    const hero = await this.local.save(id, sheet, this.remote ? 'save' : undefined)
    if (this.remote) {
      this.revision++
      this.report(this.online() && Date.now() >= this.retryAt ? 'Saving…' : 'Offline, will retry')
      this.schedule(600)
    } else this.report('Saved on this device')
    return hero
  }
  async delete(id: string) {
    const hero = await this.local.get(id)
    if (!this.remote) return this.local.delete(id)
    this.local.put(id, { hero, pending: 'delete' }); this.revision++
    this.report('Offline, will retry')
    this.schedule(0)
  }
  flush(): Promise<void> {
    if (this.running) return this.running
    this.running = this.sync().catch(error => this.report((error as Error).message, error as Error))
      .finally(() => { this.running = undefined })
    return this.running
  }
  private async sync() {
    if (!this.remote || this.stopped) return
    if (Date.now() < this.retryAt) { this.schedule(this.retryAt - Date.now()); return }
    if (!this.online()) { this.report('Offline, will retry'); this.schedule(5000); return }
    const revision = this.revision
    for (const [id, entry] of Object.entries(this.local.entries())) {
      if (this.stopped) return
      if (!entry.pending) continue
      try {
        let saved: Hero | undefined
        if (entry.pending === 'delete') {
          try { await this.remote.delete(id) }
          catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e }
        } else saved = await this.remote.save(id, entry.hero)
        if (JSON.stringify(this.local.entries()[id]) === JSON.stringify(entry)) {
          this.local.put(id, saved ? { hero: saved } : undefined)
        }
      } catch (error) {
        if (this.fallback(error)) return
        if (error instanceof ApiError && error.status === 400 && JSON.stringify(this.local.entries()[id]) !== JSON.stringify(entry)) {
          this.schedule(600)
          return
        }
        this.report((error as Error).message, error as Error)
        return
      }
    }
    if (revision !== this.revision) this.schedule(600)
    else this.report('Saved')
  }
}

export function importHero(json: string): CharacterSheet { return parseSheet(JSON.parse(json)) }
export function exportHero(hero: CharacterSheet): string { return JSON.stringify(parseSheet(hero), null, 2) }
