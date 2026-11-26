// One-off "claim my local heroes" (VTTER-53): moves every hero saved under an old X-Owner-Id profile UUID
// to a signed-in user's Cognito `sub`. Runs against the real table with your AWS CLI profile.
//
//   npm run claim -- <old-profile-uuid> <cognito-sub>            # dry run: lists what would move
//   npm run claim -- <old-profile-uuid> <cognito-sub> --apply    # copies each hero, then deletes the old item
//
// Find the sub in the Cognito console (Users → the user → "sub") or in the app's ID token.
// Hero ids are kept. A hero the new owner already has with the same id is skipped, never overwritten.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { parseSheet } from '../src/sheet.ts'
import { DynamoCharacterStore } from '../src/store.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const [from, to, flag] = process.argv.slice(2).map(s => s.toLowerCase())
if (!from || !to || !UUID.test(from) || !UUID.test(to) || from === to || (flag && flag !== '--apply')) {
  console.error('Usage: npm run claim -- <old-profile-uuid> <cognito-sub> [--apply]')
  process.exit(2)
}
const apply = flag === '--apply'

process.env.AWS_PROFILE ??= 'ember-reach'
process.env.AWS_REGION ??= 'us-east-2'
const table = process.env.TABLE_NAME ?? 'vtter-game'
const store = new DynamoCharacterStore(
  DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } }),
  table,
)

const heroes = await store.list(from)
console.log(`${heroes.length} hero(es) under ${from} in ${table}${apply ? '' : ' (dry run, add --apply to move)'}`)
let moved = 0
for (const h of heroes) {
  if (await store.get(to, h.id)) {
    console.log(`  skip ${h.id} "${h.name}": ${to} already has a hero with this id`)
    continue
  }
  console.log(`  ${apply ? 'move' : 'would move'} ${h.id} "${h.name}"`)
  if (!apply) continue
  const record = await store.get(from, h.id)
  if (!record) continue
  // parseSheet keeps only sheet fields (drops ownerId, id, timestamps) and re-validates them.
  await store.save(to, h.id, parseSheet(record))
  await store.delete(from, h.id)
  moved++
}
if (apply) console.log(`Moved ${moved} hero(es).`)
