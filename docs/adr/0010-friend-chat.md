# ADR 0010: Chat between friends

- **Status:** Accepted (2026-11-26)
- **Jira:** VTTER-109 (in VTTER-46, UI / UX). Builds on [ADR 0009](0009-friends.md) (friendship, the shared 404) and
  [ADR 0003](0003-backend-dynamodb-lambda.md) (one table, Lambda behind an HTTP API).

## Context

Friends can share adventures and invite each other to a Game, but they can't talk, so they arrange sessions somewhere
else. The ask is small: let friends message each other so they can coordinate. The app is not a general VTT and has
no voice or video (scope lock, 2026-11-25), so this is text between two friends and nothing more.

## Decision

- **Same table, two more item kinds**, no new table, no new index, and no new IAM action (only `Query` and `UpdateItem`,
  which the role already has: `UpdateItem` creates an item that doesn't exist, so no `PutItem` is needed).

  | Item | `ownerId` | `id` | `kind` | Holds |
  |---|---|---|---|---|
  | Message | `chat#<lowSub>#<highSub>` | `msg#<ISO time>#<8 hex>` | `message` | `from`, `text`, `createdAt`, `ttl` |
  | Send counter | `ratelimit#<sub>` | `min#<minute>` | `ratelimit` | `count`, `ttl` |

  The two ids are sorted, so both friends use the same partition whichever of them writes. A thread is one `Query` with a
  key condition (`begins_with` for the newest page, `<` for older, `>` for newer) and no filter. The message `id` starts
  with an ISO time, so it sorts by time and is also the cursor the app sends back.
- **Unread is on the friend items, not in the thread.** A send sets `lastMessageAt` on the receiver's `friend#` item and
  `lastReadAt` on the sender's. Opening a thread sets `lastReadAt` for the reader. A friend row is unread when
  `lastMessageAt` is later than `lastReadAt`. `GET /friends` already reads those items, so it returns `unread` with no
  extra query. Both writes have a condition that the item exists, so a removed friendship is never recreated.
- **Routes** (all need sign-in; the caller is the verified token's `sub`):
  `GET /friends/:playerId/messages[?before=<id>|?after=<id>]`, `POST /friends/:playerId/messages` (`{ text }`) and
  `POST /friends/:playerId/messages/read`.
- **Access is `areFriends`, checked before every call**, and every refusal is the same 404 as in ADR 0009: a stranger, a
  pending request, yourself, an unknown player ID. Removing either side of the friendship ends access at once.
- **A message leaves the API as `{ id, mine, text, createdAt }`.** The sender's `sub` is storage only, the same as an
  adventure's owner, so `from` and the partition key never go out. The cursor is validated against the id's exact shape
  before it reaches a key.
- **Plain text.** The API trims the text, folds line endings, and refuses empty text, text over the limit, and control
  characters other than a newline. The app renders it as text (`white-space: pre-wrap`), never as markup.
- **Limits** are in `data/chat.json`: 1000 characters, pages of 50, 90 days, 20 sends a minute. The counter item is
  incremented by a conditional `UpdateItem` that is refused once the cap is reached, which becomes a 429 with
  `Retry-After`. They are abuse and cost caps, not game rules.
- **Expiry is the table's TTL.** The data stack turns on `timeToLiveAttribute: 'ttl'`. That is an in-place update (confirm
  with `cdk diff`; the construct id stays `Characters`). Items without a `ttl` are never touched. DynamoDB deletes expired
  items some time after they expire, so the API doesn't depend on the deletion: a read still returns a message that has
  expired but not yet been removed.
- **Delivery is polling.** The open thread asks for `after=<newest id>` every 5 seconds, and the Friends link checks
  `GET /friends` every 30 seconds, only while the tab is visible. There is no push, no email and no new service.

## Consequences

- **A reply takes up to about 5 seconds**, and the dot up to 30. That is fine for arranging a session and would not be for a
  fast back-and-forth. The live table (VTTER-87) may add real-time delivery; chat can move onto it then.
- **The unread dot costs a `GET /friends` every 30 seconds** per open tab (one `Query` and one `BatchGetItem`).
- **History survives a removal.** Removing a friend doesn't delete the thread, so if you become friends again within 90
  days the old messages come back. They expire by themselves.
- **Not private from the operator.** Messages are stored as plain text and are readable by whoever runs the table. They
  aren't end-to-end encrypted. Don't treat chat as a place for secrets.
- **No edit, delete, report or block.** A player who is bothered can remove the friend, which ends the thread for both.
  A block list is the follow-up ADR 0009 already names.
- **A lost second write is harmless.** A send is a counter write, the message write, then two marker writes, not a
  transaction. If a marker write is lost the message still exists and the next poll shows it. Only the dot can be late.
- **Account deletion isn't built**, so a deleted account's threads would sit until they expire. Reading them still needs a
  friendship, and the missing profile drops the friend from every list.

## Alternatives considered

- **A copy of each message in each player's partition.** "My messages" would need no pair key, but it is two writes that can
  drift, it doubles storage, and the unread count would still need its own marker.
- **WebSockets** (an API Gateway WebSocket API, a connection table, a stack). Real-time, but a new surface to secure and
  pay for, to save a few seconds between two friends.
- **Unread as a count in the thread.** It needs a read-modify-write on every send and every open. Two timestamps on
  items we already read are cheaper and can't drift into a negative number.
- **Chat per Game.** A natural follow-up that can reuse this store with the Game id as the thread key. It is left out here
  because a Game's members aren't all friends, and it needs its own rules for who can read it.
