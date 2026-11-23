import { call } from '../api/client.ts'
import { currentUser } from '../auth/session.ts'
import { ApiCharacterRepository, LocalCharacterRepository, OfflineCharacterRepository } from './repository.ts'
import { ApiError } from '../api/request.ts'

let scope: string | undefined
let repository: OfflineCharacterRepository
export function characterRepository() {
  const account = currentUser()?.sub ?? 'guest'
  if (scope !== account) {
    repository?.stop()
    scope = account
    const remote = account === 'guest' ? null : new ApiCharacterRepository((method, path, body) => {
      if (currentUser()?.sub !== account) throw new ApiError('Sign in again to sync these heroes.', 401)
      return call(method, path, body, account)
    })
    repository = new OfflineCharacterRepository(new LocalCharacterRepository(localStorage, account), remote)
    if (remote) void repository.flush()
  }
  return repository
}

export const characters = {
  list: () => characterRepository().list(),
  get: (id: string) => characterRepository().get(id),
  save: (id: string, sheet: import('./repository.ts').CharacterSheet) => characterRepository().save(id, sheet),
  remove: (id: string) => characterRepository().delete(id),
}

/** Preserve ids so retrying a partially completed upload cannot duplicate heroes. */
export async function uploadGuestHeroes() {
  if (!currentUser()) throw new ApiError('Sign in to upload heroes.', 401)
  const guest = new LocalCharacterRepository(localStorage)
  const repo = characterRepository()
  for (const hero of await guest.list()) {
    await repo.save(hero.id, hero)
    // The destination outbox is durable before removing the guest copy.
    await guest.delete(hero.id)
  }
  await repo.flush()
}
