# Emberreach — a tabletop RPG (working title)

A fantasy tabletop roleplaying game in the classic dungeon-crawl structure:
a Game Master (the **Warden of Tales**, or just GM) runs the world, 3–5 players run heroes,
and the group explores ruins, fights monsters, and levels up over a campaign.

**Status:** v0.4 rules. Nothing has been playtested yet.

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
| [CLAUDE.md](CLAUDE.md) | Instructions for AI agents (other agents are pointed here by [AGENTS.md](AGENTS.md)) |
| [docs/decisions.md](docs/decisions.md) | Log of locked design decisions |
| [rules/core-rules.md](rules/core-rules.md) | Core rules: the roll, characters, combat, magic, advancement |
| [rules/gm-guide.md](rules/gm-guide.md) | Running the game: foes, encounter building, a starter adventure |
| [sheets/character-sheet.md](sheets/character-sheet.md) | Printable/fillable character sheet template |
| [app/](app/) | Online companion app, live at https://emberreach.morris-heap.com/ |
| [api/](api/) | Companion API (AWS Lambda + DynamoDB, us-east-2) for saved characters |
| [infra/](infra/) | AWS CDK app that deploys the API and its table |
| [data/](data/) | Game numbers and built-in adventures as JSON, shared by the app and API and checked against the rules |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [docs/mockups/](docs/mockups/) | UI mockups (character sheet, dice tray, map editor) |
| [docs/map-model/](docs/map-model/README.md) | The layered map object model: what a map is made of |

## Roadmap

- **v0.1 (this pass):** core rules, 6 callings, 5 ancestries, 8 foes, a one-shot adventure.
- **v0.2:** settle the v0.1 open questions (done), first playtest, then rebalance the numbers (Grit, damage, Difficulty bands).
- **Before any public release:** run a formal trademark search on the name "Emberreach".
- **v0.3:** the Kilnheart, a seventh Calling (done).
- **v0.4:** Terrain: Difficult and Impassable zones (done). Still to come: levels 6–10 talents, more spells,
  magic items, a second adventure.
- **Digital companion (in progress):** the Test roller and Momentum tracker are live. The API for saved
  characters and sign-in (Cognito, VTTER-53) are live. Signed-in players get a Home with their heroes and
  adventures, a profile with a player ID and a Game Master switch, and can write private adventures (VTTER-71).
  They can start a solo Game on a built-in adventure, and a Game Master can run a public or private Game for friends
  (VTTER-72, up to 5 heroes recommended). A friends list by player ID (VTTER-73) lets players share adventures with
  friends and lets a Game Master invite from it, and friends can chat to arrange a session (VTTER-109). Next: the character sheet with guided creation (VTTER-47).
- **Later:** the side-based combat tracker, a live shared table with a shared roll log, rolling straight from
  the sheet, hex maps built on the [layered map model](docs/map-model/README.md) with a GM layer and fog of war,
  print layout, art direction.
- **Scope (locked 2026-11-25):** the app automates *our* rules deeply; it is not a general VTT platform.
  No dynamic lighting, 3D terrain, user scripting, system builder for other games, marketplace or built-in
  video. Fog of war is in (amended 2026-11-26), as a GM setting. Joining a GM's Game is always free.
  See [docs/decisions.md](docs/decisions.md).

## Working with AI agents

Agent instructions live in one file, [CLAUDE.md](CLAUDE.md), which imports the
decisions log. [AGENTS.md](AGENTS.md) is a stub pointing at it, so agents that look
for that conventional path still find the rules. When we agree on a rule, it goes into
[docs/decisions.md](docs/decisions.md) and the matching rules file in the same commit.
Agents are told to read those files before making changes.

## Open design questions

See the end of [rules/core-rules.md](rules/core-rules.md#open-questions).
