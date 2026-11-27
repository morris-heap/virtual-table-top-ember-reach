// Local dev server: `npm run dev` → http://127.0.0.1:8787, against the real DynamoDB table using your
// AWS CLI profile (AWS_PROFILE, default ember-reach). Not deployed. Set USER_POOL_ID and USER_POOL_CLIENT_ID
// (EmberreachAuth outputs) so it accepts the app's access tokens. Portraits stay in memory unless PORTRAIT_BUCKET is set.
import { createServer } from 'node:http'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { cognitoVerifier } from './auth.ts'
import { DynamoChatStore } from './chat-store.ts'
import { DynamoFriendStore } from './friend-store.ts'
import { DynamoGameStore } from './game-store.ts'
import { DynamoPresenceStore } from './presence-store.ts'
import { handle } from './handler.ts'
import { LocalPortraitStore } from './portrait-local.ts'
import { S3PortraitStore } from './portrait-store.ts'
import { DynamoMapStore } from './map-store.ts'
import { DynamoAdventureStore, DynamoCharacterStore, DynamoProfileStore } from './store.ts'

const PORT = Number(process.env.PORT ?? 8787)
process.env.AWS_PROFILE ??= 'ember-reach'
process.env.AWS_REGION ??= 'us-east-2'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
const table = process.env.TABLE_NAME ?? 'vtter-game'
const store = new DynamoCharacterStore(db, table)
const profiles = new DynamoProfileStore(db, table)
const adventures = new DynamoAdventureStore(db, table)
const maps = new DynamoMapStore(db, table)
const games = new DynamoGameStore(db, table)
const friends = new DynamoFriendStore(db, table)
const chat = new DynamoChatStore(db, table)
const presence = new DynamoPresenceStore(db, table)
// With PORTRAIT_BUCKET set, portraits go to that S3 bucket. Without it, they stay in memory in this process.
const local = process.env.PORTRAIT_BUCKET ? null : new LocalPortraitStore(`http://127.0.0.1:${PORT}`)
const portraits = local ?? new S3PortraitStore(new S3Client({}), process.env.PORTRAIT_BUCKET!)
const allowedOrigins = ['http://localhost:5173', 'https://emberreach.morris-heap.com']
const verifyToken = cognitoVerifier(process.env.USER_POOL_ID, process.env.USER_POOL_CLIENT_ID)

createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  // The local stand-in for S3's signed URLs.
  if (local && req.url?.startsWith('/_portraits/')) {
    const cors = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return }
    const [status, type, body] = local.serve(req.method ?? 'GET', req.url.slice('/_portraits/'.length), String(req.headers['content-type'] ?? ''), Buffer.concat(chunks))
    res.writeHead(status, { ...cors, 'Content-Type': type }).end(body)
    return
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0
  const out = await handle(
    new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }),
    { store, profiles, adventures, maps, games, friends, chat, presence, portraits, allowedOrigins, verifyToken },
  )
  res.writeHead(out.status, Object.fromEntries(out.headers.entries()))
  res.end(Buffer.from(await out.arrayBuffer()))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Emberreach API on http://127.0.0.1:${PORT} (profile ${process.env.AWS_PROFILE}, table ${process.env.TABLE_NAME ?? 'vtter-game'})`)
})
