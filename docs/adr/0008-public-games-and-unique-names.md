# ADR 0008: Browsing public Games, and unique Game names

- **Status:** Accepted (2026-11-25)
- **Jira:** VTTER-76 (in VTTER-46, UI / UX). Extends [ADR 0006](0006-games.md).

## Context

[ADR 0006](0006-games.md) made a Game public or private, but a public Game can only be joined by its link:
there is no list to browse. The `_game` lookup maps a Game id to its GM, which answers "where does this id live"
and nothing else, so finding Games needs an index.

Separately, a Game's `name` is free text today. Two Games can carry the same name, which makes a browse list
ambiguous ("which *Friday Night* is this?") and makes a name useless for talking about a table.

## Decision

### 1. A Game is identified by its UUID; its name is unique per GM

- **The UUID stays the identity.** It is the key (`game#<uuid>`), the join link, and what every pointer
  references. Nothing about the name changes how a Game is stored or reached, so a rename is cheap and
  breaks no link.
- **A name is unique within one GM's Games**, not globally. A GM cannot have two Games called
  *Friday Night*; two different GMs can.
- **Enforced by a reservation item in the GM's own partition:**

  | Item | `ownerId` | `id` | `kind` | Holds |
  |---|---|---|---|---|
  | Name reservation | the GM's `sub` | `name#<normalized>` | `game-name` | `gameId` |

  Written with `attribute_not_exists`, the same pattern the player ID uses (`_player`, [ADR 0005](0005-profile-and-adventures.md)).
  A taken name answers **409**. Creating claims the name; renaming claims the new one and then releases the
  old; deleting a Game releases it.
- **Normalization for comparison only:** fold case and collapse runs of whitespace. *Friday Night*,
  *friday night* and *Friday&nbsp;&nbsp;Night* therefore collide. The GM's original spelling is what gets
  stored on the Game and displayed. Punctuation and accents are **not** stripped: *Ash & Ember* and
  *Ash and Ember* are different names, because folding them would reject names a GM would reasonably
  consider distinct.

**Why per GM, not global.** A campaign can run for years, so a globally unique name would let one table hold
*Friday Night* permanently and force every later GM to invent a variant. The obvious names would be gone
within the first few hundred Games. Per-GM scope keeps names meaningful where they are actually used — in one
GM's list of tables — at the cost of a name alone not identifying a Game across the app. That is why the UUID,
not the name, stays the identity and the link.

**No migration was needed.** The three pre-existing Games (all private, all test tables) were deleted from the
live table on 2026-11-25, before this rule shipped, so every Game that has ever existed under it claims its
name. There are no unreserved legacy names and therefore no window where a new Game can take a name an older
one is already using. Heroes, profiles, player IDs and adventures were left untouched: a Game only ever
referenced a hero, so no sheet was affected.

### 2. A sparse GSI lists public Games

| | |
|---|---|
| Index name | `PublicGames` |
| Partition key | `listed` (string) |
| Sort key | `updatedAt` (string) |
| Projection | the browse-row fields only |

- **Sparse and opt-in.** `listed` is written **only** for a Game that is public *and* whose GM chose to list it.
  Anything else — every private Game, and a public Game shared by link only — simply has no `listed`
  attribute and so is absent from the index. "Private Games never appear" is then a property of the data,
  not a filter the API has to remember to apply.
- **`listed` is a constant** (`"public"`), so all listed Games share one partition and sort by `updatedAt`,
  giving "most recently active first" and cursor pagination for free. At this scale one partition is right;
  if listing ever grows enough to make it hot, the key can become a bucket (for example `public#<shard>`)
  without changing the API.
- **The projection carries only what a browse row shows** (name, adventure ref, member count, GM's player ID
  and display name, `updatedAt`). A Cognito `sub` is never projected, so the index cannot leak one.

**Adding a GSI does not replace the table.** It is an additive update, and `cdk diff` must confirm that before
deploy. The `Characters` construct id is untouched.

### 3. The browse route and its cursor

`GET /games/public?cursor=&limit=` returns one page, newest activity first. It needs a signed-in caller like
every other route, but **no membership**: not being a member is the point of browsing.

- **Rows are built field by field** (`browseRow` in `api/src/handler.ts`), never spread from an index row.
  An index row carries the base table keys, and `ownerId` there is the GM's Cognito `sub`. The GM goes out
  as a player ID and display name only.
- **The cursor carries `updatedAt` alone**, base64url-encoded, and the next page resumes with
  `updatedAt < :cursor`. A GSI's own `LastEvaluatedKey` could not be used as a cursor: it contains the
  base-table keys, so handing it to a client would publish the GM's `sub`. An unusable cursor starts from
  the top rather than failing the browse.
- **A cursor is offered only when the page was full.** A short page is the end of the list.
- **Each row says whether the caller already joined**, so the UI shows *Open* instead of *Join* without a
  request per row. `heroCount` is also returned, because the party-size advice counts heroes, not members
  ([2026-11-23 decision](../decisions.md)).

### 4. Listing is a second opt-in in the UI

A GM's Game page has **Public** (anyone with the link can join) and, nested under it, **List it on Browse
games**. A Game can therefore be public-by-link without being advertised. Turning off Public leaves `listed`
meaningless, and the API drops it: `parseGame` only honours `listed` while `visibility` is public, so a
private Game can never reach the index even if a client sends `listed: true`.

Players and GMs alike reach the list at `/games`, linked from Home. Past the recommended party size the row
shows advice and the Join button stays enabled — the warning never blocks (no hard cap on party size).

## Consequences

- **A rename is now two writes** (claim the new name, release the old), and they are not atomic. The claim
  happens first, so a crash between them leaves an extra reservation pointing at the Game: harmless, and the
  next successful rename or delete clears it. The reverse order could hand the name to someone else mid-rename.
- **A GM hitting a name they already used gets a 409**, which the app should turn into "You already have a
  Game called that" rather than a raw error. A GM has at most 20 Games, so this is a real and recoverable
  mistake, not an edge case.
- **Listing is opt-in, so the browse list starts empty.** No Game is listed until a GM asks for it. Opt-in is
  the right default regardless: it never publishes a table someone made public only to share a link with a
  few friends.
- **The index needs `dynamodb:Query` on the index ARN**, which is a separate grant from the table's own. It is
  added in `infra/lib/api-stack.ts` alongside the existing actions.
- Name uniqueness is per GM, so the app cannot offer "join by name". Joining stays by link or from the browse
  list, both of which carry the UUID.

## Alternatives considered

- **Globally unique names:** makes a name a true identifier and allows "join *Friday Night*", but long-running
  campaigns permanently consume the good names. Rejected above.
- **Partition the index by adventure id:** supports "public Games running this adventure", but browsing
  everything then needs a query per adventure. The constant partition can be extended with this later as a
  filter rather than the primary key.
- **A `public` boolean on the index instead of a sparse `listed`:** every Game would land in the index and the
  API would filter private ones out on read. One forgotten filter leaks private Games, and the index pays for
  rows nobody can see. A sparse attribute makes the guarantee structural.
- **Enforce uniqueness by querying the GM's Games before writing:** no extra item, but a read-then-write races,
  so two parallel creates can both pass. The conditional write cannot.
