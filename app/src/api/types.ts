// Shapes the Emberreach API sends and receives (api/src/sheet.ts, profile.ts, adventure.ts).

export interface HeroSummary {
  id: string
  name: string
  level: number
  ancestry: string
  calling: string
  updatedAt: string
}

export interface Profile {
  /** Empty until the user sets one: show their sign-in name instead. */
  displayName: string
  gameMaster: boolean
  /** Public, shareable, never changes. For example EMBER-7K2Q9. */
  playerId: string
}

/** Only `private` is accepted by the API for now (sharing comes with VTTER-72/73). */
export type Visibility = 'private' | 'friends' | 'public'

export interface Scene {
  /** Stable id chosen by the app, unique within the adventure. */
  id: string
  title: string
  type: string
  text: string
  foes: string[]
}

export interface AdventureDraft {
  title: string
  summary: string
  levelMin: number
  levelMax: number
  visibility: Visibility
  scenes: Scene[]
  hooks: string[]
}

export interface Adventure extends AdventureDraft {
  id: string
  updatedAt: string
}

export type AdventureSummary = Pick<Adventure, 'id' | 'title' | 'summary' | 'levelMin' | 'levelMax' | 'visibility' | 'updatedAt'>
