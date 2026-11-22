// AWS Lambda entry point (API Gateway HTTP API, payload format 2.0). Turns the event into a fetch
// Request, runs the pure handler, and turns the Response back into an API Gateway result.
// See docs/adr/0003-backend-dynamodb-lambda.md.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { cognitoVerifier } from './auth.ts'
import { handle, type Deps } from './handler.ts'
import { DynamoAdventureStore, DynamoCharacterStore, DynamoProfileStore } from './store.ts'

export function toRequest(event: APIGatewayProxyEventV2): Request {
  const { domainName } = event.requestContext
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const method = event.requestContext.http.method
  const headers = new Headers()
  for (const [k, v] of Object.entries(event.headers ?? {})) if (v !== undefined) headers.set(k, v)
  const hasBody = event.body !== undefined && method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body!, 'base64') : event.body) : undefined
  return new Request(`https://${domainName}${event.rawPath}${query}`, { method, headers, body })
}

export async function toResult(res: Response): Promise<APIGatewayProxyStructuredResultV2> {
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: await res.text(),
    isBase64Encoded: false,
  }
}

export function makeHandler(deps: Deps) {
  return async (event: APIGatewayProxyEventV2) => toResult(await handle(toRequest(event), deps))
}

// Created once per execution environment and reused across invocations.
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
const table = process.env.TABLE_NAME ?? 'emberreach-characters'
const deps: Deps = {
  store: new DynamoCharacterStore(db, table),
  profiles: new DynamoProfileStore(db, table),
  adventures: new DynamoAdventureStore(db, table),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  verifyToken: cognitoVerifier(process.env.USER_POOL_ID, process.env.USER_POOL_CLIENT_ID),
}

export const handler = makeHandler(deps)
