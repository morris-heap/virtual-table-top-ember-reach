# Emberreach API

An AWS Lambda function (TypeScript, Node.js 22) behind an API Gateway HTTP API. It saves character sheets in the
DynamoDB table `emberreach-characters` (us-east-2). The infrastructure lives in [../infra](../infra), and
[.github/workflows/api.yml](../.github/workflows/api.yml) deploys it on every push to `main` that touches `api/`,
`infra/` or `data/`. Background: [ADR 0003](../docs/adr/0003-backend-dynamodb-lambda.md).

Live: https://7ybva8z4v3.execute-api.us-east-2.amazonaws.com (check it at `/health`). The URL is the `EmberreachApi.ApiUrl` deploy output.

## Setup

1. `npm install`
2. Sign in to AWS: `aws login --profile ember-reach` (the AWS CLI is needed only for `npm run dev`).
3. `npm run dev` runs the API at http://127.0.0.1:8787 against the real table, using that profile.
   Override with `AWS_PROFILE`, `TABLE_NAME` or `PORT`.

## Commands

| Command | What it does |
|---|---|
| `npm test` / `npm run typecheck` | Unit tests (Vitest) and type check. Run both before committing |
| `npm run dev` | Local server on the real table |
| `npm run claim -- <old-uuid> <cognito-sub> [--apply]` | Moves heroes saved under an old `X-Owner-Id` UUID to a signed-in user (dry run without `--apply`) |

## Routes

All `/characters` routes need `Authorization: Bearer <access token>` from a Cognito sign-in (VTTER-53,
[ADR 0004](../docs/adr/0004-auth-cognito.md)). The token's `sub` is the owner. No token or a bad one gets 401.
For `npm run dev`, set `USER_POOL_ID` and `USER_POOL_CLIENT_ID` (the `EmberreachAuth` outputs).

| Route | Does |
|---|---|
| `GET /health` | `{"ok":true,"db":"ok"}`, or 503 if the table is unreachable |
| `GET /characters` | Lists your heroes (id, name, level, ancestry, calling, updatedAt), newest first |
| `GET /characters/:id` | Returns one full sheet |
| `PUT /characters/:id` | Creates or replaces a sheet. Only `name` is required. Values are checked against `/data` (400 with the reason) |
| `DELETE /characters/:id` | Deletes it (204) |

Another owner's hero gets 404. If DynamoDB throttles, routes return 503 with `Retry-After: 5`.

## Layout

- `src/handler.ts`: routing, CORS, errors (pure, so it's unit-tested with an in-memory store and a fake token verifier)
- `src/auth.ts`: Cognito access-token verification (`aws-jwt-verify`)
- `src/sheet.ts`: the `CharacterSheet` shape and its validation (values from `../data/`)
- `src/store.ts`: DynamoDB reads and writes (one item per hero, key `ownerId` + `id`)
- `src/lambda.ts`: the Lambda entry point (API Gateway HTTP API events ↔ `Request`/`Response`)
- `src/dev.ts`: the local dev server
