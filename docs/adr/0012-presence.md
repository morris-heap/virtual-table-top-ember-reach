# ADR 0012: Presence at the table

- Status: accepted (2026-11-26, VTTER-73)
- Builds on: [ADR 0006](0006-games.md) (Games and member pointers), [ADR 0009](0009-friends.md) (mutual friends)

## Context

Friends exist ([ADR 0009](0009-friends.md)), but a player can't tell when a friend is at the table. There is no
live shared table yet (VTTER-87), so there is no socket to read presence from.

## Decision

### Presence is a heartbeat, not a connection

While a Game page is open and the tab is visible, the app sends `PUT /games/:id/presence` every
`presence.heartbeatSeconds` (25, in `data/game.json`). The API checks the caller is a member, writes **their own**
presence item, and answers with the player IDs online at that Game. A player counts as online while their last
beat is newer than `presence.onlineSeconds` (70) **and** it named that Game. The beat is under half the window,
so one missed beat does not flicker the dot. A hidden tab sends nothing and lapses.

One item per player in their own partition of `vtter-game`: `(me, presence#current)`, `kind: presence`, with
`gameId` and `seenAt` (epoch ms), overwritten by each beat. No TTL and no cleanup job: a stale `seenAt` simply
reads as offline. It is read with one `BatchGetItem` of up to a Game's members (20) or a player's friends.
A separate `PresenceStore` holds it, so friends and chat are untouched.

### Who sees what

- **At a table**, every member sees which others are online, and which members are the viewer's **accepted**
  friends (a pending request is not a friend). They already see each other's names and heroes. A member who is
  not yet a friend has an **Add friend** button, which sends the same request as the Friends page.
- **On the friends list and Home**, presence is for accepted friends only. A player ID is public, so a
  one-sided or pending request must never reveal when someone is online.
- **A friend's Game is named only if the viewer is a member of it too**, so a private Game's name never
  reaches an outsider. Otherwise the row says "In a Game". A friend with a Game open elsewhere shows online.

## Consequences

- No new IAM actions (`UpdateItem` and `BatchGetItem` are already granted), no new index, no table change.
- **Known limits.** There is no opt-out of presence yet. A heartbeat is a write per open player, so VTTER-87
  (a live table) should replace it rather than add to it. The Friends page and Home read presence once
  when they load and don't refresh.
