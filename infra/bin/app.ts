// CDK app for the Emberreach API on AWS (docs/adr/0003-backend-dynamodb-lambda.md).
// Stacks:
//   EmberreachGithubDeploy  one-time: GitHub OIDC provider + the role CI assumes to deploy (deploy by hand)
//   EmberreachData          the DynamoDB table and the private portrait bucket (termination protection on; both retained)
//   EmberreachAuth          the Cognito user pool, managed login domain and web app client (docs/adr/0004-auth-cognito.md)
//   EmberreachApi           the Lambda function + API Gateway HTTP API (CI deploys this on pushes to main)
import { App } from 'aws-cdk-lib'
import { ApiStack } from '../lib/api-stack.ts'
import { AuthStack } from '../lib/auth-stack.ts'
import { DataStack, PORTRAIT_BUCKET_NAME, TABLE_NAME } from '../lib/data-stack.ts'
import { GithubDeployStack } from '../lib/github-deploy-stack.ts'

const app = new App()
// The ember-reach project: one AWS account, Region fixed by the new AWS experience.
const env = { account: '913427211898', region: 'us-east-2' }

// The app is served at https://emberreach.morris-heap.com/ (Cloudflare Worker custom domain; VTTER-60).
const APP_ORIGIN = 'https://emberreach.morris-heap.com'
const DEV_ORIGIN = 'http://localhost:5173'
const BASE = '/' // the Vite base in app/vite.config.ts

// Optional social sign-in. Each is on when its client id is in cdk.json context (or `-c name=…`), and its
// client secret is in Secrets Manager under the name below. See infra/README.md.
const ctx = (key: string) => (app.node.tryGetContext(key) as string | undefined) || undefined
const googleClientId = ctx('googleClientId')
const microsoftClientId = ctx('microsoftClientId')
const githubClientId = ctx('githubClientId')

new GithubDeployStack(app, 'EmberreachGithubDeploy', {
  env,
  repo: 'morris-heap/virtual-table-top-ember-reach',
  // The repo uses GitHub's immutable OIDC subjects (owner and repo ids in the sub claim).
  immutableSubPrefix: 'repo:morris-heap@359005383/virtual-table-top-ember-reach@1465011793',
})
new DataStack(app, 'EmberreachData', { env, terminationProtection: true, allowedOrigins: [APP_ORIGIN, DEV_ORIGIN] })
new AuthStack(app, 'EmberreachAuth', {
  env,
  terminationProtection: true,
  domainPrefix: 'emberreach-login',
  appUrls: [`${APP_ORIGIN}${BASE}`, `${DEV_ORIGIN}${BASE}`],
  google: googleClientId ? { clientId: googleClientId, clientSecretName: 'emberreach/google-oauth-client-secret' } : undefined,
  microsoft: microsoftClientId
    ? { clientId: microsoftClientId, clientSecretName: 'emberreach/microsoft-oauth-client-secret', tenantId: ctx('microsoftTenantId') }
    : undefined,
  github: githubClientId ? { clientId: githubClientId, clientSecretName: 'emberreach/github-oauth-client-secret' } : undefined,
})
// The API finds the table by name and the Cognito ids through SSM rather than cross-stack exports,
// so the stacks deploy independently. Deploy EmberreachAuth before EmberreachApi the first time.
new ApiStack(app, 'EmberreachApi', {
  env,
  tableName: TABLE_NAME,
  portraitBucketName: PORTRAIT_BUCKET_NAME,
  allowedOrigins: [APP_ORIGIN, DEV_ORIGIN],
})
