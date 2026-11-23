# ADR 0006: Games

- **Status:** Accepted (2026-11-22)
- **Jira:** VTTER-72 (in VTTER-46, UI / UX). Builds on [ADR 0005](0005-profile-and-adventures.md). Follow-ups: VTTER-73 friends list.

## Context

A **Game** is the table people play an adventure from: a GM, some players, and one adventure. A GM creates one from the
Home screen by picking an adventure (built-in, or one of their own). Anyone can also start a **solo** Game on a built-in
adventure, with no GM. This change is the data, the API and the screens for creating, joining and leaving Games. Playing
the scenes themselves, and choosing heroes, come later.

## Decision

- **Same table, three more item kinds**, with no new table and no new IAM action (only Get, Query, Update, Delete):

  | Item | `ownerId` | `id` | `kind` | Holds |
  |---|---|---|---|---|
  | Game | the GM's `sub` | `game#<uuid>` | `game` | name, adventure ref, visibility, solo, `memberIds` (string set, includes the GM) |
  | Member pointer | each member's `sub` (GM too) | `gm#<uuid>` | `membership` | `gmId`, `gameId` |
  | Game lookup | `_game` | `<uuid>` | `game-lookup` | `gmId` |

- **Membership is the access check, on every read.** A Game sits in the GM's partition, so a member reaches it through
  their own pointer item: `getForMember` reads the pointer, then the Game. No pointer means 404 (not 403, so a private
  Game's existence isn't confirmed). Removing someone deletes the pointer first, which is what revokes access, and then
  drops them from the roster. Deleting a Game deletes the Game first, then every pointer and the lookup.
- **Routes:** `GET /games`, `GET|PUT|DELETE /games/:uuid`, `PUT|DELETE /games/:uuid/members/:playerId`. The owner is from
  the verified token, as always. Cognito ids never leave the API: members are shown as player ID and display name.
- **Who may do what.**
  - Create or change a Game: its GM. A table with other people needs the Game Master flag on the profile. A **solo**
    Game doesn't, but it must use a built-in adventure, be private, and takes no one else.
  - A Game made from the GM's own adventure reads that adventure through the Game, so members see it without any
    sharing of the adventure itself. Adventures stay private.
  - Invite: the GM, by player ID. Leave: any player. Remove a player: the GM. The GM can't leave, only delete.
- **Public or private.** Private is invitation only. **Public means anyone with the link can join**, as themselves. The link is
  the Game's UUID, so the `_game` lookup is what lets someone who isn't a member find the GM's partition. There is no
  browse list of public Games yet: that needs an index and is a follow-up.
- **Limits** are in `data/game.json`: 80 characters of name, 20 people per Game (an abuse cap, not a game rule), 20 Games per
  GM and 50 per player. The party size of 5 is advice only: the app shows a warning past `core.party.recommendedMax`
  and never blocks. The member cap is a conditional write (`size(memberIds) < :max`), so two joins at once can't pass it.
- **Game ids are the client's UUID.** A new Game whose id already belongs to another GM is refused with 409, so nobody can
  repoint another Game's join link by reusing its id.

## Consequences

- **An invite adds the player immediately.** There is no accept step, so a GM could add someone who didn't ask. Players can leave
  at any time, a GM needs the GM flag, and a GM is capped at 20 Games. A real invite (pending until accepted) belongs with the
  friends list in VTTER-73.
- **Two writes aren't atomic** (roster and pointer). Both orders are safe: a pointer without a roster entry is repaired by
  retrying the same call, and a roster entry without a pointer gives that person no access. Using `TransactWriteItems`
  would need a new IAM action, which isn't worth it at this size.
- A deleted GM account leaves its Games behind. Account deletion isn't built yet.
- Heroes in a Game, turn order and playing scenes are not here. Maps (VTTER-74) and chapters (VTTER-75) will hang off the
  adventure, so a Game keeps pointing at an adventure by `{source, id}` and not at a copy.

## Alternatives considered

- **A roster item per member under the Game** (`ownerId: game#<uuid>`): lets us list members with one Query, but then the
  Game needs its own partition and every member list needs a reverse index for "my Games".
- **Putting the whole Game in each member's partition:** reads are trivial, but every rename and setting change fans out.
- **Join codes instead of links:** friendlier to read out loud, and a possible addition on top of the lookup item.
