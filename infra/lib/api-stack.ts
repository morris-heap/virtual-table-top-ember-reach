import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnStage, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Architecture, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { AUTH_PARAMS } from './auth-stack.ts'
import { GSI1 } from './data-stack.ts'
import { bundle } from './bundle.ts'

export interface ApiStackProps extends StackProps {
  tableName: string
  portraitBucketName: string
  allowedOrigins: string[]
}

/** Lambda (Event Functions, on-demand) behind an API Gateway HTTP API. Routing and CORS live in api/src/handler.ts. */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const table = TableV2.fromTableName(this, 'Characters', props.tableName)

    const fn = new Function(this, 'Handler', {
      functionName: 'emberreach-api',
      code: bundle('lambda.ts'),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: props.tableName,
        PORTRAIT_BUCKET: props.portraitBucketName,
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
    // Querying a GSI needs its own ARN: the table grant above does not cover index/*. Query only,
    // because an index is read-only (VTTER-76, ADR 0008).
    fn.addToRolePolicy(new PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [`${table.tableArn}/index/${GSI1}`],
    }))

    // Exactly what api/src/portrait-store.ts calls. ListBucket makes a missing portrait a 404 instead of a 403.
    fn.addToRolePolicy(new PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [`arn:${this.partition}:s3:::${props.portraitBucketName}/*`],
    }))
    fn.addToRolePolicy(new PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [`arn:${this.partition}:s3:::${props.portraitBucketName}`],
    }))

    // Exactly what api/src/portrait-store.ts calls. ListBucket makes a missing portrait a 404 instead of a 403.
    fn.addToRolePolicy(new PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [`arn:${this.partition}:s3:::${props.portraitBucketName}/*`],
    }))
    fn.addToRolePolicy(new PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [`arn:${this.partition}:s3:::${props.portraitBucketName}`],
    }))

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
