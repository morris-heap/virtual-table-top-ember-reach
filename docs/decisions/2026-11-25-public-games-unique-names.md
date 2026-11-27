### 2026-11-25 — Browsing public Games, and unique Game names (VTTER-76)

**Decision:** Product rules for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

1. **A Game's name is unique per GM, not globally.** One GM cannot have two Games called *Friday Night*;
   two different GMs can. A clash is refused with a clear message, not silently renamed.
2. **The UUID stays a Game's identity.** The name is a label, so renaming a Game breaks no link and changes
   nothing about how it is stored or joined. There is no "join by name".
3. **Names collide on case and spacing, not punctuation.** *Friday Night*, *friday night* and
   *Friday&nbsp;&nbsp;Night* are the same name; *Ash & Ember* and *Ash and Ember* are different. The GM's own
   spelling is what gets stored and shown.
4. **Listing a Game is a second opt-in, separate from making it public.** Public means "anyone with the link
   can join". Listed means "it also shows on `/games` for anyone to find". A Game can be public without being
   listed; a private Game can never be listed.
5. **Anyone can browse and join**, player or GM. The list shows the Game's name, its adventure, the GM, and how
   many people and heroes are at the table, newest activity first.
6. **Party size still has no hard cap.** Past five heroes a browse row shows advice and the Join button stays
   enabled.
7. **The index keys are generic (`gsi1pk` / `gsi1sk`), not named for this query.** One shared sparse index
   serves every kind that needs cross-partition listing; each writes its own namespaced partition value
   (`game#public` here). A table allows only 20 GSIs and each one charges write capacity on every indexed
   write, so per-purpose indexes get expensive as item kinds multiply. Decided before the index shipped,
   because renaming an index key afterwards replaces the index.
8. **Existing Games were deleted, not migrated.** The three Games in the live table on 2026-11-25 were all
   private test tables, so they were removed before the rule shipped rather than back-filling reservations.
   Heroes, profiles, player IDs and adventures were untouched.

**Why:**
- A campaign can run for years, so globally unique names would let the first few hundred Games permanently
  consume every obvious name and force later GMs into variants. Per-GM scope keeps a name meaningful where it
  is actually read — in one GM's list of tables.
- Folding punctuation would reject names a GM would reasonably consider distinct, so only case and whitespace
  fold.
- Opt-in listing never publishes a table someone made public purely to share a link with a few friends.
- Counting heroes rather than members matches the 2026-11-23 decision: a turn in the Heroes' Phase belongs to
  a hero, so a spectator or a hero-less GM does not trip the advice.

**Affects:** api/ (`GET /games/public`, name reservations, 409 on a clash), app/ (`/games` browse screen, the
listing toggle on a Game page, `newGame` starts unlisted), data/game.json (`listedKey`, `browsePageMax`),
infra/ (the shared sparse `gsi1` index and its `dynamodb:Query` grant),
docs/adr/0008-public-games-and-unique-names.md, AGENTS.md. No rules text and no `data/` number changes:
`party.recommendedMax` stays 5.
