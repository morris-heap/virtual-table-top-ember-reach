# ADR 0004: Sign-in with Amazon Cognito (OAuth 2.0 + OIDC)

- **Status:** Accepted (2026-11-21)
- **Jira:** VTTER-53 (in VTTER-51, Backend epic)
- **Builds on:** [ADR 0003](0003-backend-dynamodb-lambda.md) (DynamoDB + Lambda)

## Context

The API scoped heroes by an `X-Owner-Id` UUID the browser made up. That kept heroes apart but wasn't
authentication: anyone who learned an id could read and overwrite those heroes. VTTER-53 asks for real login that
works from the static GitHub Pages app, so heroes follow an account across devices.

The ticket was written for the Cloudflare Worker (GitHub OAuth in the Worker, or a hosted vendor such as Clerk or
Auth0). The backend is now on AWS ([ADR 0003](0003-backend-dynamodb-lambda.md)), which has its own OIDC provider.

## Decision

- **Provider: an Amazon Cognito user pool** (`emberreach-users`, Essentials plan) in the ember-reach project,
  us-east-2, stack `EmberreachAuth`. Sign-in by email and password, self sign-up with email verification,
  optional TOTP MFA. The pool has deletion protection and is retained if its stack is deleted.
- **Single sign-on page: Cognito managed login** (v2) at `emberreach-login.auth.us-east-2.amazoncognito.com`.
  It handles sign-in, sign-up, password reset and MFA, so the app has no password forms.
- **Social sign-in (optional): Google, Microsoft and GitHub** (VTTER-62). Google uses Cognito's built-in Google
  provider. Microsoft (Entra ID) is an OIDC provider named `Microsoft`. GitHub isn't OIDC, so the `GitHub` OIDC provider
  points at a small wrapper we run (`api/src/github-oidc.ts`, Lambda + HTTP API in `EmberreachAuth`) that exchanges the
  code with GitHub and returns an ID token signed by an asymmetric KMS key. Each is turned on
  with a CDK context value (`googleClientId`, `microsoftClientId`, `githubClientId`). Its client secret lives in
  Secrets Manager (`emberreach/<provider>-oauth-client-secret`), and CloudFormation resolves it at deploy time.
  Cognito needs one exact token issuer, so Microsoft trusts a single tenant: personal Microsoft accounts by default
  (`microsoftTenantId` changes it). The app's landing page has a button per provider (`VITE_AUTH_PROVIDERS`) that
  sends `identity_provider` to skip Cognito's page. Without any context values, only email sign-in is offered.
- **Branding:** the managed login style is in code (`infra/lib/branding/`), so the sign-in pages match the app's
  dark ember look and the console branding editor isn't used.
- **Flow: OAuth 2.0 authorization code grant with PKCE (S256)**, plus `state` and an OIDC `nonce`. One public app
  client (`emberreach-web`, no client secret), scopes `openid email profile`. Callback and sign-out URLs are the
  app URL (`https://emberreach.morris-heap.com/`) and the local dev URL, both with the Vite base `/`.
  (The old GitHub Pages URL was removed when the app moved to Cloudflare, VTTER-60.)
- **App:** a small hand-written PKCE client in `app/src/auth/` (no Amplify; it's about 200 lines and tested).
  Tokens are kept in `sessionStorage`, so they go away when the tab closes; Cognito's session cookie makes the next
  sign-in one click. The access token is refreshed with the refresh token (30 days) and the refresh token is revoked
  on sign-out. The app reads the user's name and picture from the ID token. Signed-out users can still use the Test
  roller.
- **API:** every `/characters` request needs `Authorization: Bearer <access token>`. The Lambda verifies it with
  `aws-jwt-verify` (signature against the pool's JWKS, issuer, expiry, `token_use: access`, `client_id`) and uses the
  token's `sub` as `ownerId`. A missing or bad token gets 401 with `WWW-Authenticate: Bearer`. `/health` and CORS
  preflights stay open. `X-Owner-Id` is gone and CORS allows `Authorization` instead.
- **Why verify in the function and not an API Gateway JWT authorizer:** the function already owns routing and CORS,
  so `/health` and `OPTIONS` stay unauthenticated without extra routes, the same check runs in `npm run dev`, and
  it's unit-tested with an injected verifier.
- **Wiring:** `EmberreachAuth` writes the pool id and client id to SSM parameters (`/emberreach/auth/*`).
  `EmberreachApi` reads them at deploy time, so the stacks have no cross-stack exports and deploy independently,
  like the table. The app gets the domain, client id and API URL from Vite env files (`app/.env.production`), which
  hold no secrets.
- **Claiming old heroes:** `ownerId` is a string and Cognito `sub` is a UUID, so the table needs no change.
  `npm run claim` in `api/` moves a profile UUID's heroes to a user's `sub` (dry run by default).

## Consequences

- No new vendor or bill beyond AWS: Cognito Essentials is free up to 10,000 monthly active users (check current
  pricing before launch).
- The sign-in page is on an `amazoncognito.com` domain. A custom domain needs an ACM certificate in us-east-1 and a
  DNS record; that's a later change.
- An email account and a Google account with the same address are two separate users (no account linking yet).
- Tokens in `sessionStorage` can be read by any script injected into the page. Keep the app free of third-party
  scripts, and add a Content Security Policy when hosting allows it.
- After the first deploy, `VITE_AUTH_CLIENT_ID` and `VITE_API_URL` must be filled in from the stack outputs and
  committed, or the app hides sign-in.
