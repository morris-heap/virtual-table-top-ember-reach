# ADR 0013: Finding a player by display name

- **Status:** Accepted (2026-11-27)
- **Jira:** VTTER-108 (in VTTER-46, UI / UX). Builds on [ADR 0009](0009-friends.md) (mutual friends and player IDs),
  [ADR 0005](0005-profile-and-adventures.md) (profile and player ID) and
  [ADR 0008](0008-public-games-and-unique-names.md) (the shared sparse `gsi1` index).

## Context

Adding a friend needs their player ID, which means asking them for it first. A player would rather type the name they
already know. But display names are not unique, they are not secret from the people who know them, and a search box is
also a way to walk the whole player list. The table has no name index, and the Cognito `sub` must never leave the API.

## Decision

- **Opt-in, off by default.** A profile has `findable` (a boolean). A player is found by name only after turning on
  *Let people find me by my display name* on their Profile. A profile with no `findable` reads as off, so nobody is
  published by an upgrade.
- **What a result reveals:** the display name and the player ID, field by field, and nothing else. Both are already
  what a friend request shows. No `sub`, no index key, no Game, no presence, no hero.
- **Matching is the whole name, never a prefix.** Case and runs of spaces fold, punctuation does not (the same rule as
  Game names, [ADR 0008](0008-public-games-and-unique-names.md)). A prefix search would let a caller list players by
  typing `a`, `b`, `c`.
- **At most `search.maxResults` (10) matches**, never the caller. Names are not unique, so the app lists every match
  with its player ID and the player picks one. A match who is already a friend or has a request is labelled as such.
- **Rate limit: `search.perMinute` (12) searches per player per minute**, then a 429 with `Retry-After`. It reuses the
  chat limiter's shape: an item `(ratelimit#<player>, search#<minute>)` with `kind: ratelimit`, a conditional
  `UpdateItem` that refuses once the cap is reached, and a `ttl` so the table cleans it up.
- **Storage: the shared sparse `gsi1`, not a new index and not a lookup item.** A findable player with a name writes
  `gsi1pk = player#name` and `gsi1sk = <folded name>#<player ID>` on their own profile item. `%` and `#` are escaped in
  the folded name, so the first `#` always ends it and a search for `ash` (the prefix `ash#`) can never match
  `ash#smith`. A search is one `Query` with `begins_with(gsi1sk, '<folded name>#')`. Turning it off, clearing the name
  or deleting the profile removes the row.
- **The index projection is unchanged.** A profile row has none of the Game attributes it projects, so it carries only
  the keys, which include the owner's `sub`. The API uses the
  `sub` to read the profiles in one `BatchGetItem` and then returns only the player ID and display name. A stale row
  (someone who renamed or opted out between the two) is dropped because the profile has the last word.
- **Keeping the index right:** a change to the name or to `findable` reads the profile first and writes only if
  `updatedAt` is still what it read, retrying once. A `gameMaster`-only change touches no index attributes and reads
  nothing.
- **Route:** `GET /players?name=`, signed in, owner taken from the token. It needs no new IAM action: `Query` on `gsi1`,
  `BatchGetItem` and `UpdateItem` are already granted.

## Consequences

- **One partition holds every findable player**, like `game#public`. Reads are capped at 11 index rows per search
  and the cap is per player, so this is fine at this scale. If it ever gets hot, shard the `gsi1pk` value
  (`player#name#<shard>`) without changing the API.
- **A very common name has more than 10 matches** and the extra ones can't be reached by name. The player asks for the
  player ID instead, which keeps working. The result cap is what stops enumeration, so it isn't raised.
- **The rate limit is per signed-in player, not per address.** Someone with many accounts gets many allowances, but each
  search still only returns players who opted in, by whole name.
- **Existing players are not findable** until they opt in.

## Alternatives considered

- **Prefix search:** friendlier to type, but a caller can list every findable player in a few queries.
- **A lookup item per name** (like `_player`): needs its own write path and clean-up on rename, and a name that
  several players share has to hold a list. `gsi1` gives that for free.
- **A new GSI for names:** each index charges write capacity on every write and the table allows 20. `gsi1` is meant
  for this ([ADR 0008](0008-public-games-and-unique-names.md)).
- **Everyone findable, with an opt-out:** an upgrade would publish every existing name without asking.
