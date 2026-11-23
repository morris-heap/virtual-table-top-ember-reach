# Emberreach — a tabletop RPG (working title)

A fantasy tabletop roleplaying game in the classic dungeon-crawl structure:
a Game Master (the **Warden of Tales**, or just GM) runs the world, 3–5 players run heroes,
and the group explores ruins, fights monsters, and levels up over a campaign.

**Status:** v0.2 rules. Nothing has been playtested yet.

## The pitch

A hundred years ago the Sun Forge cracked. Now embers fall from the sky, and wherever one lands
it can grow into a town's hearth or a monster's heart. The **Reach** is the wild frontier
between the last lit cities. Heroes are **Ember-bearers**: people with a spark in them
who can carry light into the dark and bring treasure back.

## Design pillars

1. **Fast to learn, deep to master.** One core roll covers everything. A new player
   should be making characters and rolling dice within 15 minutes.
2. **Players roll the dice.** The GM never rolls in combat. Heroes roll to hit *and* to dodge,
   so every roll is a player's moment and the GM is free to narrate.
3. **Fail forward.** A near-miss means you succeed at a cost, so you rarely get "nothing happens."
4. **Tactical, not fiddly.** Combat has real choices (positioning, Momentum, combos)
   without a grid being required.
5. **Heroes get hurt, rarely die.** Grit absorbs hits. Wounds have lasting bite.
   Death is possible, but it's a choice the table sees coming.

## Repository layout

| Path | Contents |
|---|---|
| [AGENTS.md](AGENTS.md) | Instructions for AI agents (Codex reads this, and Claude reads it via [CLAUDE.md](CLAUDE.md)) |
| [docs/decisions.md](docs/decisions.md) | Log of locked design decisions |
| [rules/core-rules.md](rules/core-rules.md) | Core rules: the roll, characters, combat, magic, advancement |
| [rules/gm-guide.md](rules/gm-guide.md) | Running the game: foes, encounter building, a starter adventure |
| [sheets/character-sheet.md](sheets/character-sheet.md) | Printable/fillable character sheet template |
| [app/](app/) | Online companion app, live at https://emberreach.morris-heap.com/ |
| [api/](api/) | Companion API (AWS Lambda + DynamoDB, us-east-2) for saved characters |
| [infra/](infra/) | AWS CDK app that deploys the API and its table |
| [data/](data/) | Game numbers and built-in adventures as JSON, shared by the app and API and checked against the rules |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [docs/mockups/](docs/mockups/) | UI mockups (character sheet) |

## Roadmap

- **v0.1 (this pass):** core rules, 6 callings, 5 ancestries, 8 foes, a one-shot adventure.
- **v0.2:** settle the v0.1 open questions (done), first playtest, then rebalance the numbers (Grit, damage, Difficulty bands).
- **Before any public release:** run a formal trademark search on the name "Emberreach".
- **v0.3:** levels 6–10 talents, more spells, magic items, a second adventure.
- **Digital companion (in progress):** the Test roller and Momentum tracker are live. The API for saved
  characters and sign-in (Cognito, VTTER-53) are live. Signed-in players get a Home with their heroes and
  adventures, a profile with a player ID and a Game Master switch, and can write private adventures (VTTER-71).
  Next: the character sheet with guided creation (VTTER-47), Games to play an adventure from (VTTER-72, solo or
  with friends, up to 5 heroes recommended) and a friends list (VTTER-73).
- **Later:** initiative tracker, a shared table, print layout, art direction.

## Working with AI agents

Claude Code and Codex share one instruction file, [AGENTS.md](AGENTS.md). `CLAUDE.md` imports it
along with the decisions log, so the two agents can't drift apart. When we agree on a rule, it goes into
[docs/decisions.md](docs/decisions.md) and the matching rules file in the same commit.
Both agents are told to read those files before making changes.

## Open design questions

See the end of [rules/core-rules.md](rules/core-rules.md#open-questions).
