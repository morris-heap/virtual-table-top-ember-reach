// CDK app for the Emberreach API on AWS (docs/adr/0003-backend-dynamodb-lambda.md).
// Stacks:
//   EmberreachGithubDeploy  one-time: GitHub OIDC provider + the role CI assumes to deploy (deploy by hand)
//   EmberreachData          the DynamoDB table (termination protection on; the table is retained)
//   EmberreachApi           the Lambda function + API Gateway HTTP API (CI deploys this on pushes to main)
import { App } from 'aws-cdk-lib'
import { ApiStack } from '../lib/api-stack.ts'
import { DataStack, TABLE_NAME } from '../lib/data-stack.ts'
import { GithubDeployStack } from '../lib/github-deploy-stack.ts'

const app = new App()
// The ember-reach project: one AWS account, Region fixed by the new AWS experience.
const env = { account: '913427211898', region: 'us-east-2' }

new GithubDeployStack(app, 'EmberreachGithubDeploy', { env, repo: 'morris-heap/virtual-table-top-ember-reach' })
new DataStack(app, 'EmberreachData', { env, terminationProtection: true })
// The API finds the table by name rather than a cross-stack export, so the stacks deploy independently.
new ApiStack(app, 'EmberreachApi', {
  env,
  tableName: TABLE_NAME,
  allowedOrigins: ['https://morris-heap.github.io', 'http://localhost:5173'],
})
