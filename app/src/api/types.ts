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

/** Where a Game's adventure comes from: one that ships with the app, or one of the GM's own. */
export interface AdventureRef {
  source: 'builtin' | 'own'
  id: string
}

export interface GameDraft {
  name: string
  adventure: AdventureRef
  visibility: 'private' | 'public'
  /** One player on a built-in adventure: no GM, no invites. */
  solo: boolean
}

export type GameRole = 'gm' | 'player'

export interface GameSummary extends GameDraft {
  id: string
  role: GameRole
  memberCount: number
  updatedAt: string
}

export interface GameMember {
  playerId: string
  displayName: string
  role: GameRole
}

export interface Game extends GameDraft {
  id: string
  role: GameRole
  members: GameMember[]
  /** The GM's own adventure, readable by every member. Null for a built-in one. */
  adventureContent: Adventure | null
  createdAt: string
  updatedAt: string
}
