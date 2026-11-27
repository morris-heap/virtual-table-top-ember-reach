# ADR 0009: Friends

- **Status:** Accepted (2026-11-26)
- **Jira:** VTTER-73 (in VTTER-46, UI / UX). Builds on [ADR 0005](0005-profile-and-adventures.md) (player ID, adventure
  visibility) and [ADR 0006](0006-games.md) (invites).

## Context

A player can share a player ID, but nothing yet lets two players know each other or lets an author share an adventure
with chosen people. The ticket asks for a Steam-style friends list: requests by player ID, accept or decline, remove, and
the `friends` adventure visibility taking effect. It also leaves the rules for `public` visibility to this ticket.

## Decision

- **Same table, one more item kind**, with no new table, no new index and no new IAM action (only Get, BatchGet, Query,
  Update and Delete). Each player holds their own side of a friendship:

  | Item | `ownerId` | `id` | `kind` | Holds |
  |---|---|---|---|---|
  | Friend (my side) | my `sub` | `friend#<other's sub>` | `friend` | `status`, `updatedAt` |

  `status` is `outgoing` (I asked), `incoming` (they asked) or `accepted`. "My friends and requests" is one `Query` on my
  partition with `begins_with(id, 'friend#')` and no filter. The other player's `sub` is storage only, the same as an
  adventure's owner: the handler turns it into a player ID and display name before anything leaves the API.
- **Names come from one `BatchGetItem` of the profiles**, never a `GetItem` per row, because a list can hold 170 rows.
- **Routes** (all need sign-in; the caller is the verified token's `sub`): `GET /friends`,
  `PUT /friends/:playerId` (ask, or accept if they already asked), `DELETE /friends/:playerId` (decline, cancel or
  remove), `GET /friends/:playerId/adventures` and `GET /friends/:playerId/adventures/:id`.
- **A request is two writes, not a transaction.** Mine goes first (`outgoing`), then theirs (`incoming`). A write that
  would turn an `accepted` side back into a request is refused by a condition, so a request racing an acceptance can't
  undo it. Sending again repairs a request whose second write was lost.
- **Reading a friend's adventure needs both sides `accepted`.** The API reads my side and theirs (`areFriends`). Because of
  that, removing either side revokes access immediately, even if the second delete never happens, and a one-sided
  `accepted` left behind by a half-finished removal grants nothing. Asking again from that stale side drops it first and
  sends a fresh request.
- **Every refusal on those two routes is the same 404**: not a friend, a pending request, an unknown player ID, an
  adventure that is private, or one that doesn't exist. A stranger learns nothing. The adventure record carries its
  owner's `sub`, so the handler strips `ownerId` before it responds.
- **Visibility.** `data/adventure.json` `liveVisibilities` becomes `private` and `friends`. `public` stays refused with a
  400. The Game Master switch gates the picker in the app (ADR 0005, 2026-11-22), but the API doesn't check the flag: it is
  a preference, and the real check is friendship.
- **Limits** are in `data/friends.json`: 100 friends, 20 requests waiting on others and 50 waiting on you. They are abuse
  caps, not game rules. The incoming cap stops one player filling someone else's partition with requests.
- **Invite a friend to a Game** is a picker on the Game page for the GM. It calls the existing
  `PUT /games/:id/members/:playerId`, so a friend is added right away, like any invite ([ADR 0006](0006-games.md)).
  Nothing in the API checks friendship for an invite.

## Consequences

- **No blocking.** A player who declines can be asked again, up to the cap of 50 waiting requests. A block list is the
  follow-up if it becomes a problem.
- **A removal isn't announced.** The other player's list updates the next time they load it.
- **Friends can read but not copy** an adventure. Copying one into your own adventures is a possible later ticket.
- **Account deletion isn't built**, so a deleted account would leave its friend items behind. They are harmless: both sides
  must be `accepted` to read anything, and the missing profile drops the row from the list.
- **`public` adventures** need listing and discovery rules, and a lookup from adventure id to owner for link reading
  (like `_game`). They are deliberately not here.

## Alternatives considered

- **One shared item per friendship** (`ownerId: friend#<a>#<b>`): a single write, but "my friends" then needs a reverse
  index or a scan, and the table's one general index is for listing across partitions, not per-user lists.
- **One-way following** (no accept): simpler, but anyone could add you and read what you share, which makes `friends`
  mean nothing.
- **Gating invites on friendship:** it would stop a GM adding a player by ID, which works today and which tables rely on.
