// Local dev server: `npm run dev` → http://127.0.0.1:8787, against the real DynamoDB table using your
// AWS CLI profile (AWS_PROFILE, default ember-reach). Not deployed. Set USER_POOL_ID and USER_POOL_CLIENT_ID
// (EmberreachAuth outputs) so it accepts the app's access tokens.
import { createServer } from 'node:http'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { cognitoVerifier } from './auth.ts'
import { handle } from './handler.ts'
import { DynamoCharacterStore } from './store.ts'

const PORT = Number(process.env.PORT ?? 8787)
process.env.AWS_PROFILE ??= 'ember-reach'
process.env.AWS_REGION ??= 'us-east-2'

const store = new DynamoCharacterStore(
  DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } }),
  process.env.TABLE_NAME ?? 'emberreach-characters',
)
const allowedOrigins = ['http://localhost:5173', 'https://morris-heap.github.io']
const verifyToken = cognitoVerifier(process.env.USER_POOL_ID, process.env.USER_POOL_CLIENT_ID)

createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0
  const out = await handle(
    new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }),
    { store, allowedOrigins, verifyToken },
  )
  res.writeHead(out.status, Object.fromEntries(out.headers.entries()))
  res.end(Buffer.from(await out.arrayBuffer()))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Emberreach API on http://127.0.0.1:${PORT} (profile ${process.env.AWS_PROFILE}, table ${process.env.TABLE_NAME ?? 'emberreach-characters'})`)
})
