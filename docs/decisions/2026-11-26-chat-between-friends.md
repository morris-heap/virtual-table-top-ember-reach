### 2026-11-26 — Chat between friends (VTTER-109)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.3**.

1. **Friends can chat.** Two players who are friends (both sides accepted, [ADR 0009](../adr/0009-friends.md)) can send each
   other text messages from the Friends list. It is one thread per pair of friends, for arranging sessions.
2. **Plain text only.** Up to 1000 characters, no formatting, links or uploads. Messages are shown as text, never as markup.
3. **Only the two friends can read or write a thread.** A stranger, a pending request, yourself and an unknown player ID
   all get the same 404. Removing the friendship from either side stops it at once. A removed friend is not told.
4. **Messages are kept 90 days**, then deleted. There is no edit and no delete in v1, and no way to report or block
   (removing the friend is the escape hatch; a block list is the follow-up ADR 0009 already names).
5. **Slow down, not shut out:** 20 messages a minute per sender, then a clear "wait a moment".
6. **Unread shows as a dot** on the Friends link and on that friend's row, until the thread is opened.
7. **No push.** The open chat checks for new messages every 5 seconds and the dot every 30 seconds, while the tab is visible.
   Nothing is emailed or sent to a phone.
8. **Scope lock holds** (2026-11-25): this is text between friends. No voice, no video, no channels, no bots, no
   file sharing.

**Why:**
- Tables arrange their sessions in Discord and then come back. A short thread next to the friends list keeps that
  conversation where the Game is, without building a chat platform.
- The same 404 for every refusal means a stranger learns nothing about who has friends or who exists, as with shared adventures.
- Polling is enough for a few friends and needs no new API, table or stack. The live table (VTTER-87) may bring real-time
  delivery, and chat can move onto it then.
- The limits are abuse and cost caps, not game rules. They live in `data/chat.json`.

**Affects:** api/ (`chat.ts`, `chat-store.ts`, `/friends/:playerId/messages`, `unread` on `GET /friends`), app/ (`Chat.tsx`,
the Friends list and top bar), data/chat.json, infra/ (`ttl` on the table),
docs/adr/0010-friend-chat.md, CLAUDE.md, README.md. No rules text and no game numbers.
