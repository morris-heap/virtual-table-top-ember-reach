// API Gateway HTTP API (payload format 2.0) events to fetch Requests and back. Shared by the Lambda entry points.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'

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
