# ADR 0005: Profile, player ID and private adventures

- **Status:** Accepted (2026-11-22)
- **Jira:** VTTER-71 (in VTTER-46, UI / UX). Follow-ups: VTTER-72 Games, VTTER-73 friends list.

## Context

After sign-in the app went straight to the Test roller. We want a Home screen (Heroes and Adventures), a Profile
page, and a way for any player to write adventures. Adventures will later be shared with friends or made public, and
people will play them together in a **Game** (the table: members, a GM, an adventure and heroes). None of that
sharing exists yet, so this change only has to avoid painting us into a corner.

## Decision

- **Same table, more item kinds.** Profiles and adventures live in the one table (`emberreach-characters`,
  renamed `vtter-game` on 2026-11-25 by VTTER-94), in the owner's partition,
  next to the heroes. Heroes were originally a bare UUID sort key with no `kind`; VTTER-98 moved them to
  `hero#<uuid>` with `kind: 'hero'`, so every kind now follows the same shape:

  | Item | `ownerId` | `id` | `kind` |
  |---|---|---|---|
  | Hero | user's `sub` | `hero#<uuid>` | `hero` |
  | Profile | user's `sub` | `profile` | `profile` |
  | Adventure | user's `sub` | `adv#<uuid>` | `adventure` |
  | Player ID lookup | `_player` | `<playerId>` | `player-lookup` |

  Both the hero and adventure lists are a `Query` with `begins_with(id, '<prefix>')` and no
  `FilterExpression`. A DynamoDB filter runs *after* the read, so filtering would charge read capacity
  for every other kind in the partition and then discard it. No new table, no new IAM action, and no
  construct-id changes.
- **The `<kind>#<id>` prefix is storage only.** It never leaves the API. Each read path strips the prefix
  and the `kind` attribute on the way out — `toHero`, `toAdventure` and `toGame` in `api/src/store.ts` and
  `api/src/game-store.ts` — so callers always see a bare id. That matters because the bare id is what the
  app puts in a URL, what a member pointer stores as `heroId` ([ADR 0006](0006-games.md)), and what keys
  the S3 portrait object.

  In DynamoDB the sort key **is** the `id` attribute, so a prefixed key means the stored `id` is prefixed;
  there is no second, unprefixed copy. **Read an item through its strip helper, never straight from a
  `GetItem`/`Query` result**, or the prefixed form leaks into a response or a URL. A new item kind gets a
  prefix, a `kind`, and a strip helper of its own.
- **Routes** (all need sign-in, owner from the verified token): `GET|PUT /profile`, `GET /adventures`,
  `GET|PUT|DELETE /adventures/:uuid`. A user can only reach their own items, because the owner is part of the key.
- **Player ID.** A short public id such as `EMBER-7K2Q9F` (no `0 O 1 I L`), created on the first `GET /profile` and
  never changed. It is not the Cognito `sub`, which stays private. Uniqueness comes from a lookup item that is claimed
  with a conditional `UpdateItem` (`attribute_not_exists`), retried with a new id on collision. If two first requests
  race, the loser deletes its claim and returns the winner's profile. Friends (VTTER-73) and Games (VTTER-72) will find
  people through this id. New IDs are **6 characters** (31^6 = 887 million); the 5-character IDs handed out before
  stay valid for ever, because a player ID never changes, so both lengths are accepted on input
  (2026-11-25, see [decisions](../decisions.md)).
- **Everyone writes adventures, private by default.** There is no Game Master gate on authoring. The Game Master
  flag on the profile unlocks GM features: sharing an adventure and, with Games, creating a Game from one.
  The flag is stored in the profile item, not in Cognito, so it is a preference and not a permission. Anything that
  must be enforced (who may read a shared adventure or join a Game) will be checked from membership data, never from
  this flag.
- **Visibility is in the model now, only `private` is live.** An adventure has `visibility`:
  `private | friends | public` (`data/adventure.json`). The API accepts only `liveVisibilities` (`private`) and
  answers 400 for the others, so nothing can be shared by accident before reads by other users are designed.
  *Update 2026-11-26 (VTTER-73, [ADR 0009](0009-friends.md)): `friends` is now live too, so `liveVisibilities` is
  `private` and `friends`. `public` is still refused.*
- **Built-in adventures** ship with the app in `data/adventures/*.json` (first: *The Soot King's Hearth*, from
  `rules/gm-guide.md` §5). They are read-only, open to everyone, and shaped so a solo player can be walked through
  them later.
- **Games, not Groups.** A Game is public or private and is created by a GM from the GM view by picking an adventure.
  Groups were considered and dropped: a Game is the table.
- **Party size has no hard cap.** `data/core.json` has `party.min` 1 and `party.recommendedMax` 5. Beyond 5, rounds
  slow down, so the app will warn but never block.
- **App routing is hand-rolled.** Five screens, with `parseRoute`/`pathFor` as pure functions (`app/src/router.ts`)
  and a small History API hook (`app/src/nav.ts`). It avoids a dependency, and the route table is unit-tested without
  a DOM. The Cognito redirect stays `/`, which is Home. The Worker's SPA fallback was already on.

## Alternatives considered

- **A second table for adventures and profiles:** cleaner separation, but a new stack resource, new IAM and a second
  thing to back up, for data that is always read by owner. Revisit when shared reads (by game, by friend) need their
  own indexes.
- **Cognito groups or a custom attribute for Game Master:** would put the flag in the token, but a user choosing to be
  a GM is a preference, and changing it would need a Cognito call and a new sign-in.
- **Using the `sub` as the public id:** simple, but it is the key to every item the user owns, so it should not be
  shown or shared.
- **react-router:** fine, but 15 kB and a dependency for five routes.

## Consequences

- Every kind in the owner's partition is keyed `<kind>#<id>` and carries a `kind`, so a new kind needs
  both, plus a strip helper so the prefix stays storage-only.
- Reads by anyone but the owner (friends, Games, public) need their own design and ADRs: a lookup from player ID to
  owner, membership items, and probably a GSI. The `_player` lookup is the first step.
- `UpdateItem` conditional writes cover everything here, so the function's IAM actions are unchanged.
- Deleting a profile does not release its player ID. There is no account deletion yet.
