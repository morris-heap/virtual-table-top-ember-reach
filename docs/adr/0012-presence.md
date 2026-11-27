# ADR 0012: Presence, who is online

- **Status:** Accepted (2026-11-26)
- **Jira:** VTTER-73 (in VTTER-46, UI / UX). Builds on [ADR 0009](0009-friends.md) (mutual friends, the shared 404),
  [ADR 0006](0006-games.md) (member pointers) and [ADR 0010](0010-friend-chat.md) (the friend rows it adds to).

## Context

Players want to know when a friend is at the table, so they can say hello or join them. There is no live shared table
yet (VTTER-87), so there is no socket to read presence from. A first version of this (a second friends system with its
own store) was dropped when the friends list and chat merged first. This builds only the presence part, on top of those.

## Decision

- **Presence is a heartbeat, not a connection.** While a Game page is open and the tab is visible, the app sends
  `PUT /games/:id/presence` every `presence.heartbeatSeconds` (25, in `data/game.json`). The API checks the caller is a
  member, writes **their own** presence item, and answers with the player IDs online at that table.
- **One item per player, overwritten:** `ownerId` = the player, `id: presence#current`, `kind: presence`, `gameId` and
  `seenAt` (epoch ms). No new table, no new index, no TTL and no cleanup job: a stale `seenAt` simply reads as offline.
  A player is online while their last beat is newer than `presence.onlineSeconds` (70) **and**, when asking about a
  table, named that Game. The beat is under half the window, so one missed beat does not flicker the dot. A hidden tab
  sends nothing and lapses.
- **Reads are one `BatchGetItem` of the players concerned**, never a `GetItem` each, and strongly consistent.
- **Who sees whom:**
  - **At a table**, every member sees which others are online (`online` on each roster row). They already see each
    other's names and heroes.
  - **On the friends list**, presence is for **mutual friends only**. The API reads the other side of each friendship
    (`mutualWith`, one `BatchGetItem`), because a player ID is public and my own side can be stale: if a friend removed
    me and the second delete never happened, I must not keep seeing when they are online.
  - **A friend's Game is named only if the viewer is a member of it too.** Otherwise the row says "In a Game", so a private
    Game's name never reaches an outsider.
- **No new IAM actions:** the role already has `UpdateItem` and `BatchGetItem` ([ADR 0003](0003-backend-dynamodb-lambda.md)).
- **The app** shows a dot next to each member at a table, a dot and a line on each friend ("Offline", "In a Game", or the
  Game's name with an Open link), and a **Friends online** panel on Home that appears only when someone is online. The
  Friends screen and the Home panel re-read the friends list every heartbeat while the tab is visible. Chat stays one
  click away from an online friend.

## Consequences

- **A dot can be about a minute late.** The window is 70 seconds, the beat is 25, and the lists refresh every 25.
- **Cost.** A heartbeat is one write per open player every 25 seconds. `GET /friends` now also does one `BatchGetItem` for
  mutual sides and one for presence, and reads the caller's own Games only when a friend is online. The unread dot
  ([ADR 0010](0010-friend-chat.md)) calls `GET /friends` every 30 seconds, so it carries this cost too.
- **No opt-out yet.** A mutual friend can see that you are online. A "show me as offline" switch and a block list are
  follow-ups. Removing the friend ends it for both.
- **Heartbeats are a stopgap.** VTTER-87 (a live table) should replace them rather than add to them.
- **A friend with a Game open elsewhere shows online.** It is the same signal, deliberately coarse.

## Alternatives considered

- **Presence from the friend row itself** (a timestamp on each `friend#` item). It would be written to up to 100 items
  on every beat. One item per player is one write.
- **Showing presence to anyone you added.** A player ID is public, so that would let a stranger watch someone's comings and
  goings. Mutual only, checked on both sides.
- **WebSockets or Server-Sent Events.** Real-time, but a new surface to secure and pay for, for a dot. The live table is the
  place for that.
