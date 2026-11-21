# Emberreach infrastructure (AWS CDK)

Deploys the API to the ember-reach AWS project, account `913427211898`, Region **us-east-2**.
Background: [ADR 0003](../docs/adr/0003-backend-dynamodb-lambda.md).

| Stack | Contains | Deployed by |
|---|---|---|
| `EmberreachData` | DynamoDB table `emberreach-characters` (deletion protection, PITR, retained) | CI on `main` (rarely changes) |
| `EmberreachApi` | Lambda `emberreach-api`, HTTP API (throttled 10 req/s, burst 20), log group (30 days) | CI on `main` |
| `EmberreachGithubDeploy` | GitHub OIDC provider and the role `emberreach-github-deploy` | By hand, once |

## Commands (run in `infra/`)

| Command | What it does |
|---|---|
| `npm run typecheck` | Type check |
| `npm run synth` | Builds the templates and the Lambda bundle (no AWS access needed) |
| `npm run diff` | Shows what a deploy would change. **Always run this before deploying by hand** |
| `npx cdk deploy <Stack>` | Deploys a stack with your `ember-reach` profile |

Set `AWS_PROFILE=ember-reach` (or pass `--profile ember-reach`) for anything that talks to AWS.

## First-time setup (once per account)

1. Activate the AWS project's plan in AWS Settings. Until then every service returns `SubscriptionRequired`.
2. `aws login --profile ember-reach`
3. `npx cdk bootstrap aws://913427211898/us-east-2 --profile ember-reach`
4. `npx cdk deploy EmberreachGithubDeploy EmberreachData EmberreachApi --profile ember-reach`
5. Note the `EmberreachApi.ApiUrl` output and check `<ApiUrl>/health`.

After that, CI deploys `EmberreachData` and `EmberreachApi` on pushes to `main`.

## Rules

- Don't rename construct ids in `lib/data-stack.ts`: it would replace (and empty) the table.
- The function's role only gets the DynamoDB actions `api/src/store.ts` uses. Add new ones in `lib/api-stack.ts`.
- No AWS keys anywhere: CI uses OIDC and the function uses its role.
