import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetHashType, CfnOutput, DockerImage, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnStage, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb'
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { buildSync } from 'esbuild'
import { AUTH_PARAMS } from './auth-stack.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Bundles api/src/lambda.ts with esbuild (from infra/node_modules) into index.mjs. */
function bundle() {
  return Code.fromAsset(path.join(repoRoot, 'api/src'), {
    // Hash the bundle, not api/src, so changes to /data (imported by sheet.ts) also redeploy.
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      image: DockerImage.fromRegistry('unused'), // required by the type; local bundling always succeeds first
      local: {
        tryBundle(outputDir: string) {
          buildSync({
            entryPoints: [path.join(repoRoot, 'api/src/lambda.ts')],
            outfile: path.join(outputDir, 'index.mjs'),
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node22',
            minify: true,
            sourcemap: true,
            // The Node.js 22 runtime ships AWS SDK v3, so it isn't bundled.
            external: ['@aws-sdk/*'],
            logLevel: 'warning',
          })
          return true
        },
      },
    },
  })
}

export interface ApiStackProps extends StackProps {
  tableName: string
  allowedOrigins: string[]
}

/** Lambda (Event Functions, on-demand) behind an API Gateway HTTP API. Routing and CORS live in api/src/handler.ts. */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const table = TableV2.fromTableName(this, 'Characters', props.tableName)

    const fn = new Function(this, 'Handler', {
      functionName: 'emberreach-api',
      code: bundle(),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: props.tableName,
        ALLOWED_ORIGINS: props.allowedOrigins.join(','),
        // Published by EmberreachAuth; CloudFormation resolves them on every deploy of this stack.
        USER_POOL_ID: StringParameter.valueForStringParameter(this, AUTH_PARAMS.userPoolId),
        USER_POOL_CLIENT_ID: StringParameter.valueForStringParameter(this, AUTH_PARAMS.userPoolClientId),
        NODE_OPTIONS: '--enable-source-maps',
      },
      logGroup: new LogGroup(this, 'HandlerLogs', {
        logGroupName: '/aws/lambda/emberreach-api',
        retention: RetentionDays.ONE_MONTH,
      }),
    })
    // Exactly what api/src/store.ts calls.
    table.grant(fn, 'dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem')

    const api = new HttpApi(this, 'Api', {
      apiName: 'emberreach-api',
      description: 'Emberreach companion API (VTTER-57)',
      // Every route and the CORS preflight go to the function; it answers OPTIONS itself.
      defaultIntegration: new HttpLambdaIntegration('Lambda', fn),
    })
    // Throttle the whole API. /characters needs a Cognito access token (VTTER-53), verified in the function.
    const stage = api.defaultStage!.node.defaultChild as CfnStage
    stage.defaultRouteSettings = { throttlingRateLimit: 10, throttlingBurstLimit: 20 }

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint })
  }
}
