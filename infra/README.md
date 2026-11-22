# Emberreach infrastructure (AWS CDK)

Deploys the API to the ember-reach AWS project, account `913427211898`, Region **us-east-2**.
Background: [ADR 0003](../docs/adr/0003-backend-dynamodb-lambda.md) (API) and [ADR 0004](../docs/adr/0004-auth-cognito.md) (sign-in).

| Stack | Contains | Deployed by |
|---|---|---|
| `EmberreachData` | DynamoDB table `emberreach-characters` (deletion protection, PITR, retained) | CI on `main` (rarely changes) |
| `EmberreachAuth` | Cognito user pool `emberreach-users` (retained), managed login domain `emberreach-login` with the Emberreach branding (`lib/branding/`), public app client `emberreach-web`, optional Google, Microsoft and GitHub sign-in (with the GitHub OIDC wrapper), SSM parameters with the pool and client ids | CI on `main` |
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

## Sign-in page branding

The managed login pages (sign-in, sign-up, password reset, MFA) use the Emberreach dark theme from
[`lib/branding/settings.ts`](lib/branding/settings.ts): colors, the ember background (`background.svg`), the logo on the
form (`logo.svg`), the app favicon, and button icons for the OIDC providers. Change it there and deploy `EmberreachAuth`.
Don't edit the style in the console's branding editor: the next deploy overwrites it.

## Social sign-in (optional)

Each provider is off until its client id is in `cdk.json` `context` and its client secret is in Secrets Manager.
All three use the same redirect URI: `https://emberreach-login.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`.

Store each secret without putting it on the command line:
`aws secretsmanager create-secret --name <secret name> --secret-string file://secret.txt --profile ember-reach`,
then delete `secret.txt`. Client ids are public, so commit them in `cdk.json`.

After a deploy, add the provider to `VITE_AUTH_PROVIDERS` in `app/.env.production` and `app/.env.development`
(for example `Google,Microsoft,GitHub`) so the landing page shows its button. The managed login page shows it either way.

| Provider | Context key | Secret name |
|---|---|---|
| Google | `googleClientId` | `emberreach/google-oauth-client-secret` |
| Microsoft | `microsoftClientId` (and optional `microsoftTenantId`) | `emberreach/microsoft-oauth-client-secret` |
| GitHub | `githubClientId` | `emberreach/github-oauth-client-secret` |

### Google

1. In Google Cloud Console, create an OAuth client (type *Web application*) with the authorized redirect URI
   `https://emberreach-login.auth.us-east-2.amazoncognito.com/oauth2/idpresponse` and JavaScript origin
   `https://emberreach-login.auth.us-east-2.amazoncognito.com`.
2. Store the client secret without putting it on the command line:
   `aws secretsmanager create-secret --name emberreach/google-oauth-client-secret --secret-string file://secret.txt --profile ember-reach`,
   then delete `secret.txt`.
3. Add `"googleClientId": "<id>.apps.googleusercontent.com"` to `context` in `cdk.json` (the id is public) and deploy
   `EmberreachAuth`. The managed login page then shows *Continue with Google*.

### Microsoft

1. In the Microsoft Entra admin center (or Azure portal), go to **App registrations → New registration**.
   For *Supported account types*, pick **Personal Microsoft accounts only**. Add a **Web** redirect URI (above).
2. Under **Certificates & secrets**, add a client secret and store its *Value* as `emberreach/microsoft-oauth-client-secret`.
   Entra secrets expire (24 months at most): put a reminder in the calendar to rotate it.
3. Under **API permissions**, keep `openid`, `email`, `profile` (Microsoft Graph, delegated).
4. Add `"microsoftClientId": "<Application (client) ID>"` to `cdk.json` context and deploy `EmberreachAuth`.

Cognito checks the token issuer exactly, and Microsoft's multi-tenant `common` and `organizations` endpoints return a
different issuer for each tenant. So the stack trusts one tenant: by default the personal-accounts tenant
(`9188040d-6c67-4c5b-b112-36a304b66dad`: Outlook, Hotmail, Live, Xbox). Work or school accounts can't sign in with it.
To use one organization's accounts instead, set `"microsoftTenantId": "<tenant id>"` and register the app for that tenant.

### GitHub

GitHub's OAuth isn't OpenID Connect (no ID token, discovery or JWKS), so Cognito can't use it directly. With
`githubClientId` set, the stack also deploys a small OIDC wrapper ([`api/src/github-oidc.ts`](../api/src/github-oidc.ts)):
the Lambda `emberreach-github-oidc` behind its own HTTP API, whose URL is the issuer (output `EmberreachAuth.GithubOidcIssuer`).
It sends Cognito's authorize request on to GitHub, exchanges the code, and returns GitHub's access token with an ID token it
signs using an asymmetric KMS key (the private key never leaves KMS; about $1 a month). The GitHub client secret stays in
Cognito's provider settings: Cognito sends it with each token call and the wrapper only forwards it to GitHub.

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. Homepage `https://emberreach.morris-heap.com/`,
   authorization callback URL = the redirect URI (above). (Create it under an organization to share ownership.)
2. **Generate a new client secret** and store it as `emberreach/github-oauth-client-secret`.
3. Add `"githubClientId": "<Client ID>"` to `cdk.json` context and deploy `EmberreachAuth`.

The account's email comes from GitHub's verified addresses (the primary one if verified). A GitHub account with no verified
email can't sign in, because the user pool requires an email. `sub` is GitHub's numeric user id.

## Rules

- Don't rename construct ids in `lib/data-stack.ts`: it would replace (and empty) the table. The same goes for
  `lib/auth-stack.ts`: replacing the user pool deletes every account.
- The function's role only gets the DynamoDB actions `api/src/store.ts` uses. Add new ones in `lib/api-stack.ts`.
- No AWS keys anywhere: CI uses OIDC and the function uses its role.
