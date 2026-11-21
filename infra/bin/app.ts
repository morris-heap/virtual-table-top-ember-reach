// CDK app for the Emberreach API on AWS (docs/adr/0003-backend-dynamodb-lambda.md).
// Stacks:
//   EmberreachGithubDeploy  one-time: GitHub OIDC provider + the role CI assumes to deploy (deploy by hand)
//   EmberreachData          the DynamoDB table (termination protection on; the table is retained)
//   EmberreachAuth          the Cognito user pool, managed login domain and web app client (docs/adr/0004-auth-cognito.md)
//   EmberreachApi           the Lambda function + API Gateway HTTP API (CI deploys this on pushes to main)
import { App } from 'aws-cdk-lib'
import { ApiStack } from '../lib/api-stack.ts'
import { AuthStack } from '../lib/auth-stack.ts'
import { DataStack, TABLE_NAME } from '../lib/data-stack.ts'
import { GithubDeployStack } from '../lib/github-deploy-stack.ts'

const app = new App()
// The ember-reach project: one AWS account, Region fixed by the new AWS experience.
const env = { account: '913427211898', region: 'us-east-2' }

const PAGES_ORIGIN = 'https://morris-heap.github.io'
const DEV_ORIGIN = 'http://localhost:5173'
const BASE = '/virtual-table-top-ember-reach/' // the Vite base in app/vite.config.ts

// Optional Google sign-in: `-c googleClientId=…` (or "googleClientId" in cdk.json context). See infra/README.md.
const googleClientId = app.node.tryGetContext('googleClientId') as string | undefined

new GithubDeployStack(app, 'EmberreachGithubDeploy', { env, repo: 'morris-heap/virtual-table-top-ember-reach' })
new DataStack(app, 'EmberreachData', { env, terminationProtection: true })
new AuthStack(app, 'EmberreachAuth', {
  env,
  terminationProtection: true,
  domainPrefix: 'emberreach-login',
  appUrls: [`${PAGES_ORIGIN}${BASE}`, `${DEV_ORIGIN}${BASE}`],
  google: googleClientId ? { clientId: googleClientId, clientSecretName: 'emberreach/google-oauth-client-secret' } : undefined,
})
// The API finds the table by name and the Cognito ids through SSM rather than cross-stack exports,
// so the stacks deploy independently. Deploy EmberreachAuth before EmberreachApi the first time.
new ApiStack(app, 'EmberreachApi', {
  env,
  tableName: TABLE_NAME,
  allowedOrigins: [PAGES_ORIGIN, DEV_ORIGIN],
})
