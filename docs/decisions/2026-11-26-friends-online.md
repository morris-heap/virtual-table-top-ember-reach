### 2026-11-26 — Friends show when they are online (VTTER-73)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay as they are.

1. **A friend shows as online while they have the app open and visible** (amended 2026-11-27: it first meant a Game page
   only, so a friend signed in elsewhere read Offline). Every page sends a heartbeat every 25 seconds, a Game page to
   `PUT /games/:id/presence` and any other to `PUT /presence`, and a player counts as online for 70 seconds after their
   last one. A hidden tab sends nothing and lapses.
2. **Presence is for mutual friends only**, checked on both sides, so someone who removed you never shows, and neither
   does a pending request. A player ID is public, so presence must never follow from typing someone's ID.
3. **At a table, every member sees who else is online.** They already see each other's names and heroes.
4. **A friend's Game is named only if you are a member of it too.** Otherwise the row says "Online", so a private
   Game's name never reaches an outsider.
5. **Home shows a "Friends online" panel**, only when someone is, with a link in and a Chat button.
6. **Scope lock holds** (2026-11-25): this is a dot, not a live table. Nothing is pushed, and the real-time table
   (VTTER-87) should replace the heartbeat rather than add to it.

**Why:**
- Chat (2026-11-26) lets friends arrange a session. Knowing who is already at the table is what turns that into
  "join me".
- A heartbeat needs no new table, index or IAM action, and a stale beat reads as offline with no cleanup.
- The first version of this (a second friends system) was dropped when the friends list merged first. Only the presence
  half was kept, on top of the merged friends and chat.

**Affects:** api/ (`presence.ts`, `presence-store.ts`, `PUT /games/:id/presence`, `online` on roster rows and friend rows,
`mutualWith` on the friend store), app/ (the Game roster, the Friends list, a Home panel), data/game.json (`presence`),
docs/adr/0012-presence.md, CLAUDE.md, README.md. No rules text and no game numbers.
