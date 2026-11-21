# Emberreach infrastructure (AWS CDK)

Deploys the API to the ember-reach AWS project, account `913427211898`, Region **us-east-2**.
Background: [ADR 0003](../docs/adr/0003-backend-dynamodb-lambda.md) (API) and [ADR 0004](../docs/adr/0004-auth-cognito.md) (sign-in).

| Stack | Contains | Deployed by |
|---|---|---|
| `EmberreachData` | DynamoDB table `emberreach-characters` (deletion protection, PITR, retained) | CI on `main` (rarely changes) |
| `EmberreachAuth` | Cognito user pool `emberreach-users` (retained), managed login domain `emberreach-login`, public app client `emberreach-web`, optional Google sign-in, SSM parameters with the pool and client ids | CI on `main` |
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
4. `npx cdk deploy EmberreachGithubDeploy EmberreachData EmberreachAuth EmberreachApi --profile ember-reach`
   (`EmberreachAuth` must exist before `EmberreachApi`, which reads its SSM parameters).
5. Note the `EmberreachApi.ApiUrl` output and check `<ApiUrl>/health`.
6. Put `EmberreachAuth.UserPoolClientId` in `VITE_AUTH_CLIENT_ID` and the API URL in `VITE_API_URL` in
   `app/.env.production` and `app/.env.development`, and commit them (they aren't secrets).

After that, CI deploys `EmberreachData`, `EmberreachAuth` and `EmberreachApi` on pushes to `main`.

## Google sign-in (optional)

1. In Google Cloud Console, create an OAuth client (type *Web application*) with the authorized redirect URI
   `https://emberreach-login.auth.us-east-2.amazoncognito.com/oauth2/idpresponse` and JavaScript origin
   `https://emberreach-login.auth.us-east-2.amazoncognito.com`.
2. Store the client secret without putting it on the command line:
   `aws secretsmanager create-secret --name emberreach/google-oauth-client-secret --secret-string file://secret.txt --profile ember-reach`,
   then delete `secret.txt`.
3. Add `"googleClientId": "<id>.apps.googleusercontent.com"` to `context` in `cdk.json` (the id is public) and deploy
   `EmberreachAuth`. The managed login page then shows *Continue with Google*.

## Rules

- Don't rename construct ids in `lib/data-stack.ts`: it would replace (and empty) the table. The same goes for
  `lib/auth-stack.ts`: replacing the user pool deletes every account.
- The function's role only gets the DynamoDB actions `api/src/store.ts` uses. Add new ones in `lib/api-stack.ts`.
- No AWS keys anywhere: CI uses OIDC and the function uses its role.
