// Shapes the Emberreach API sends and receives (api/src/sheet.ts, profile.ts, adventure.ts).

export interface HeroSummary {
  id: string
  name: string
  level: number
  ancestry: string
  calling: string
  updatedAt: string
}

/** The shared API sheet plus public record metadata. Owner identity never leaves the API. */
export type Hero = import('../../../api/src/sheet.ts').CharacterSheet & { id: string; createdAt: string; updatedAt: string }

export interface Profile {
  /** Empty until the user sets one: show their sign-in name instead. */
  displayName: string
  gameMaster: boolean
  /** Public, shareable, never changes. For example EMBER-7K2Q9F. New IDs are 6 characters; older ones are 5. */
  playerId: string
}

/** The API accepts `private` and `friends` (VTTER-73). `public` is in the model but still refused. */
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
  /**
   * Show this Game in the public browse list (VTTER-76). Only meaningful while `visibility` is
   * public: a private Game is never listed, whatever this says.
   */
  listed: boolean
}

/** Another player as you may see them: the public player ID and display name, never an account id. */
export interface Person {
  playerId: string
  displayName: string
}

/** Your friends, requests that wait on you (`incoming`) and requests that wait on them (`outgoing`) (VTTER-73). */
export interface FriendLists {
  friends: Person[]
  incoming: Person[]
  outgoing: Person[]
}

export type GameRole = 'gm' | 'player'

export interface GameSummary extends GameDraft {
  id: string
  role: GameRole
  memberCount: number
  updatedAt: string
}

/** The hero a member brought, as the table sees it: read-only for everyone but its owner (VTTER-77). */
export type GameHero = Pick<HeroSummary, 'id' | 'name' | 'level' | 'ancestry' | 'calling'>

export interface GameMember {
  playerId: string
  displayName: string
  role: GameRole
  /** Null until they pick one, or if they deleted the hero they had chosen. */
  hero: GameHero | null
  /** True for the signed-in member, who is the only one who can change this hero. */
  mine: boolean
}

/**
 * One row of the public browse list (VTTER-76). Deliberately not a `GameSummary`: a browser is not a
 * member, so there is no `role`, and the GM appears only as a player ID and display name.
 */
export interface PublicGame {
  id: string
  name: string
  adventure: AdventureRef
  gm: { playerId: string; displayName: string }
  memberCount: number
  /** Heroes brought, which is what the party-size advice counts (VTTER-77). */
  heroCount: number
  full: boolean
  /** True when the signed-in player is already in: the UI offers Open instead of Join. */
  joined: boolean
  updatedAt: string
}

export interface PublicGamePage {
  games: PublicGame[]
  /** Pass back as `cursor` for the next page. Null at the end of the list. */
  cursor: string | null
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
