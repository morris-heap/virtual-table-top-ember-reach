# AGENTS.md — instructions for AI coding agents

This file is the **single source of agent instructions** for this repo.
Claude Code reads `CLAUDE.md`, which imports this file.
**Put every rule here, not in CLAUDE.md**, so the instructions stay in one place.

## Project

**Emberreach** (working title) is an original fantasy tabletop RPG in the classic dungeon-crawl
structure: a GM, 3–5 players, d20 Tests, ancestries, callings (classes), and levels 1–10.
The repo holds the game design (Markdown), a companion web app (`/app`, Cloudflare) and its API
(`/api`, an AWS Lambda function on DynamoDB, deployed with CDK from `/infra`). The rules files stay the source of truth for the code.

## Read before changing anything

The game's established rules live in these files. **They are the source of truth.** Read the
relevant ones before answering design questions or making edits:

| File | Contains |
|---|---|
| [README.md](README.md) | Pitch, design pillars, roadmap |
| [docs/decisions.md](docs/decisions.md) | **Locked design decisions.** Don't contradict these without the user's approval |
| [rules/core-rules.md](rules/core-rules.md) | Core mechanics: Tests, characters, callings, magic, combat, gear, advancement, open questions |
| [rules/gm-guide.md](rules/gm-guide.md) | Foe stat blocks, encounter budgets, starter adventure |
| [sheets/character-sheet.md](sheets/character-sheet.md) | Character sheet template (must match the rules) |
| [data/](data/) | Machine-readable game numbers used by the app and API (`core.json`, `character.json`, `creation.json`, `adventure.json`, `game.json`), and the built-in adventures in `data/adventures/`. Must match the rules files |
| [docs/adr/](docs/adr/) | Architecture decisions: [0001](docs/adr/0001-companion-app-stack.md) app stack, [0003](docs/adr/0003-backend-dynamodb-lambda.md) backend (replaced [0002](docs/adr/0002-backend-postgres.md)), [0004](docs/adr/0004-auth-cognito.md) sign-in, [0005](docs/adr/0005-profile-and-adventures.md) profile, player ID and private adventures, [0006](docs/adr/0006-games.md) Games, [0007](docs/adr/0007-3d-dice-tray.md) 3D dice tray |
| [docs/mockups/](docs/mockups/) | Character sheet UI mockups (view and guided-creation edit mode) for VTTER-47 |

## How we establish rules (workflow)

1. **Proposal:** new ideas go to the user first, or into *Open questions* at the end of
   `rules/core-rules.md`.
2. **Decision:** when the user approves a rule, add a dated entry to `docs/decisions.md`
   (newest at the top) **and** update the rules file it affects, in the same change.
3. **Ripple check:** when a rule changes, search for every place it's referenced and update all of them:
   the core rules, GM guide stat blocks and number tables, the character sheet, and the README.
   Numbers must agree everywhere (DCs, Grit formulas, Momentum costs, and so on).
4. **Open questions:** once a question is decided, remove it from the list and log it as a decision.
5. **Version:** rules files carry a version in their title (`v0.1`). Bump the minor version when you make
   a batch of rule changes, and note it in the decision entry.

## Design guardrails

- **Original content only.** Use genre-standard mechanics (d20, classes, hit points-style stamina,
  advantage-like modifiers) but never copy names, text, spells, monsters, settings, or trademarked
  terms from existing games (no "Dungeons & Dragons", "D&D", SRD wording, beholders, and so on).
  Use our own terms: Test, Boon/Bane, Grit, Wounds, Ember, Momentum, Dread, Calling.
- **Respect the pillars** in README.md: players roll all dice (the GM never rolls in combat),
  fail forward (success at a cost), one core roll, tactical but not fiddly.
- **Keep the terminology consistent.** Capitalize game terms (Test, Boon, Bane, Grit, Wound, Ember,
  Momentum, Dread, Strong success). Don't introduce synonyms.
- **Show the math.** When you propose balance changes, show the expected numbers
  (for example, hit chance at level 1 vs a typical Defense).

## Writing style

- Markdown, using tables for stats. Keep rules text short and in the imperative, addressed to the player as "you".
- Mark placeholders clearly: *(to be written for v0.x)*.
- Use relative links between docs.

## Git and Jira

- Default branch `main`. Commit only when the user asks. Branch from an up-to-date `main` and open a PR;
  merging to `main` deploys (the app to Cloudflare, the API to AWS).
- Work is tracked in Jira project **VTTER** (VTT Ember Reach) at morris-heap.atlassian.net.
  Name branches `VTTER-<n>-short-slug`, and mention the VTTER key(s) in commit messages and PR titles.
  (Older history uses the previous project key, KAN.)
- Current epics: VTTER-46 UI / UX (VTTER-47 Character Sheet UI, VTTER-71 Home, Profile and private adventures,
  then VTTER-72 Games and VTTER-73 friends list), VTTER-51 Backend
  (VTTER-53 Cognito login done; VTTER-55 portraits done (API and the upload UI on the hero sheet); VTTER-56 app ↔ API still to do).
- Write commit messages in the imperative and say which rules changed (for example "Rebalance Hexer Grit to 8 + 3/level").

## Companion app (`/app`)

Vite + React + TypeScript static site, served at https://emberreach.morris-heap.com/ by a Cloudflare Worker with static
assets (`app/wrangler.jsonc`). Cloudflare Workers Builds deploys it from `main` (build `npm ci && npm test && npm run build`
in `app/`, then `npx wrangler deploy`); `.github/workflows/app.yml` checks pull requests. The domain `morris-heap.com` and its DNS are at Cloudflare. See [docs/adr/0001-companion-app-stack.md](docs/adr/0001-companion-app-stack.md).

- **PR previews:** each pull request gets a Cloudflare preview build (`npx wrangler preview`), which posts a `*.workers.dev`
  Preview URL on the PR. Sign-in doesn't work there (the preview origin isn't a Cognito callback URL).
- **Root `wrangler.toml` is a workaround, not a duplicate:** Cloudflare's preview builds ignore the dashboard's root
  directory, build command and Preview command, and run from the repo root. The root file builds `app/` and uploads
  `app/dist`. Keep its `name`, `compatibility_date` and assets settings in step with `app/wrangler.jsonc`, and don't
  delete it until Cloudflare fixes preview builds (VTTER-67). Both files need a `previews` block.

- **Screens and routing:** signed-in players get Home (Games, plus their newest heroes and adventures), Heroes (`/heroes`,
  `/heroes/new`, `/heroes/<id>`), Adventures (`/adventures`, the editor, built-ins), Games, Profile and the Test roller (which also holds the 3D **Dice tray** tab, VTTER-79, lazy-loaded from `app/src/dice/`).
  The top bar links Home, Heroes and Adventures. Routes are a pure table in `app/src/router.ts` (hand-rolled, no router library), and `/` must stay Home because
  it is the Cognito redirect. Calls to the API go through `app/src/api/client.ts` and never send a user id.
  Built-in adventures are `data/adventures/*.json`, listed in `app/src/adventures/builtIn.ts` **and** in `api/src/game.ts`
  (`BUILT_IN_IDS`), so add both when you add one. Games (VTTER-72, `/games/:id`) are created from an adventure on Home,
  and each member brings one of their own heroes (VTTER-77). The
  friends list is VTTER-73. **Party size has no hard cap**: `data/core.json` `party.recommendedMax` (5) is advice, so
  warn, never block. The warning counts **heroes**, not members, because each hero adds a turn to the Heroes' Phase.
- Commands (run in `app/`): `npm install`, `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
  **Run test, lint and build before you commit app changes.**
- **End-to-end tests** (`app/e2e/`, Playwright) run against the **deployed** app with `npm run e2e`, not on pull
  requests: they sign a throwaway user up through the real Cognito managed login, so they need the `ember-reach`
  AWS profile. `e2e/throwaway-user.ts` deletes the Cognito user **and** its profile and `_player` rows afterwards;
  deleting only the user would leave an orphaned player ID holding its slot. Override the target with
  `E2E_BASE_URL`. Keep them serial (`workers: 1`): each one writes to the real table.
- Game logic goes in `app/src/engine/` as pure functions with an injectable RNG, and every rule gets unit tests.
- **Game numbers come from `/data/*.json`, never hard-coded.** When a rule's numbers change,
  update `rules/*.md` **and** `/data` in the same change (this is part of the ripple check above).
- Vite `base` is `/`. Still use relative or base-aware paths (`import.meta.env.BASE_URL`) for assets.

## API (`/api`) and infrastructure (`/infra`)

An AWS Lambda function (Node.js 22) behind an API Gateway HTTP API, storing heroes in the DynamoDB table
`emberreach-characters`. Everything is in the ember-reach project, Region **us-east-2**. See
[docs/adr/0003-backend-dynamodb-lambda.md](docs/adr/0003-backend-dynamodb-lambda.md).
The CDK app in `infra/` defines it. `.github/workflows/api.yml` deploys `EmberreachData` and `EmberreachApi` on pushes to `main`
through GitHub OIDC (role `emberreach-github-deploy`, environment `aws`).

- Commands in `api/`: `npm test`, `npm run typecheck`, `npm run dev` (local server on the real table).
  Commands in `infra/`: `npm run typecheck`, `npm run synth`, `npm run diff`, `npx cdk deploy <Stack>`.
  **Run the API test and typecheck, and the infra typecheck and synth, before you commit API or infra changes.**
- AWS access is the CLI profile `ember-reach` (`aws login --profile ember-reach`). There are no AWS keys in `.env`,
  GitHub or code, so keep it that way: CI uses OIDC and the function uses its role.
- One item per hero: key `ownerId` + `id`. Sheet fields are item attributes, and lists are native DynamoDB lists and maps,
  never JSON strings. The same partition also holds the profile (`id: profile`), adventures (`id: adv#<uuid>`) and the
  player ID lookup (`ownerId: _player`) ([ADR 0005](docs/adr/0005-profile-and-adventures.md)), plus Games (`id: game#<uuid>`
  under the GM), a member pointer per player (`id: gm#<uuid>`, which also holds that member's `heroId`) and a Game lookup (`ownerId: _game`)
  ([ADR 0006](docs/adr/0006-games.md)). **Every Game read goes through the caller's member pointer**, so keep it that way and
  never return Cognito ids. Every non-hero item has a
  `kind` attribute, which the hero list filters on, so give any new item kind one. Adventures are private to their owner:
  the API accepts only the visibilities in `data/adventure.json` `liveVisibilities`. The player ID is public, and the Cognito
  `sub` never leaves the API. Allowed values come from `/data/character.json` and `/data/core.json`. Single-hero reads are
  strongly consistent (a read right after a save or delete must be fresh), so keep `ConsistentRead`.
- Portraits are in a private S3 bucket (stack `EmberreachData`), reached only through signed URLs that `/characters/:id/portrait`
  hands to the hero's owner ([ADR 0003](docs/adr/0003-backend-dynamodb-lambda.md)). Never make the bucket public or return
  an object key.
- The function's role gets only the DynamoDB and S3 actions `api/src/store.ts` and `api/src/portrait-store.ts` use. If you add a call, add its action in
  `infra/lib/api-stack.ts`.
- Don't rename CDK construct ids in `infra/lib/data-stack.ts`. That replaces the table. Always `cdk diff` first.
- Sign-in is Cognito (stack `EmberreachAuth`, [ADR 0004](docs/adr/0004-auth-cognito.md)): OAuth 2.0 code + PKCE from the app,
  and the API verifies the access token (`api/src/auth.ts`) and uses its `sub` as `ownerId`. Never trust an owner id from the
  request. Keep the app client public (no secret), and keep `/health` and CORS preflights unauthenticated.
- Don't rename construct ids in `infra/lib/auth-stack.ts` either: replacing the user pool deletes every account.
- Keep only test data in the table and test users in the pool, and clean up anything you create when testing.
- On Windows, run Vitest from a path that starts with an uppercase drive letter (`C:\…`). A lowercase `c:\…`
  working directory makes every test file that imports a local module fail with
  "Cannot read properties of undefined (reading 'config')". CI (Linux) isn't affected.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

Where this guidance conflicts with the project's own instructions, the project's instructions take precedence.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - You CAN create AWS WAF and Cloudwatch Logs resources in us-east-1 when there are global resources (like a global WAF instance) that require a connection to dependencies in us-east-1. You should not use these for any other reason, because resources in the selected Region will provide lower cost (due to no cross-Region traffic), increased availability (due to no cross-Region traffic), and easier manageability (due to not needing to look in another Region). When you need to do an inventory of resources, you need to look in both the selected Region and us-east-1 for Cloudwatch Logs or WAF resources.
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- For any AWS task or question — building, configuring, migrating, debugging, or operating a service, writing SDK code, authoring CDK/CloudFormation, or answering how a service works — first call `aws___search_documentation` with topic `agent_skills` and load the matching skill with `aws___retrieve_skill`. Do this even when you believe you know the answer: skills carry current service behavior that your training may not. Prefer the skill's guidance over general knowledge. Skip it only for work that does not involve AWS.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

**Saved help_level: LOW** (chosen 2026-11-21). Don't ask again unless the user wants to change it.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user’s request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion
<!-- END AWS Agent Toolkit rules -->
