### 2026-11-26 — A friends list, and sharing adventures with friends (VTTER-73)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.3**.

1. **A friendship is mutual and needs an answer.** One player asks by player ID, the other accepts or declines. Asking
   someone who has already asked you accepts. Either player can end it at any time, and the other is not told.
2. **Adventure visibility `friends` is live.** A friend can list and read it, read-only. Everyone else gets a 404, the
   same 404 as "no such adventure", so a stranger can't tell what exists. **`public` stays off**: it is still in the
   model and the API still refuses it. Public adventures need discovery and listing rules, which the scope lock
   (2026-11-25) keeps away from a content marketplace. Public *Games* (2026-11-25) are unchanged.
3. **Access needs both sides of the friendship.** Removing it from either side stops reading at once.
4. **The Game Master switch still gates sharing in the app** (2026-11-22): the visibility picker is enabled for a Game
   Master. The API does not check the flag, because it is a preference and not a permission (ADR 0005).
5. **A GM can invite a friend from the friends list.** It adds them right away, the same as typing their player ID.
   There is no pending invite: the picker is a convenience, not consent.
6. **Abuse caps, not game rules** (`data/friends.json`): 100 friends, 20 requests waiting on others, 50 waiting on you.
   There is no blocking yet, so a declined request can be sent again, up to the cap.

**Why:**
- Mutual and accepted is the Steam model the ticket asked for, and it means no one is added to a list without a say.
- Checking both sides means a lost write can't leave a removed friend with access.
- Keeping `public` off avoids deciding listing and discovery before there is a need, and before the scope lock is tested.

**Affects:** data/ (`friends.json`, `adventure.json` `liveVisibilities`), api/ (`/friends` routes, `friend` item kind),
app/ (Friends screen, shared adventure view, editor visibility picker, Game page friend picker),
docs/adr/0009-friends.md, CLAUDE.md, README.md. No rules text and no game numbers.
