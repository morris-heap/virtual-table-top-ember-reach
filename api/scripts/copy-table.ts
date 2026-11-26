// One-off table copy (VTTER-94): DynamoDB cannot rename a table, so `vtter-game` is a new table and the
// items from `emberreach-characters` have to be carried over. Runs against the real tables with your AWS
// CLI profile.
//
//   npm run copy-table                     # dry run: counts what would be copied, writes nothing
//   npm run copy-table -- --apply          # copies every item
//   npm run copy-table -- --apply --from X --to Y
//
// Why copy rather than start clean: a player ID never changes (ADR 0005). Dropping the `_player` rows
// would release three claimed IDs and hand those accounts new ones on next sign-in, breaking that promise.
//
// Safe to re-run: each item is written with PutItem on the same key, so a second run overwrites with the
// same bytes rather than duplicating. It never deletes from the source.
import { DynamoDBClient, paginateScan, BatchWriteItemCommand, type AttributeValue, type WriteRequest } from '@aws-sdk/client-dynamodb'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const valueAfter = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const FROM = valueAfter('--from') ?? 'emberreach-characters'
const TO = valueAfter('--to') ?? 'vtter-game'

if (FROM === TO) {
  console.error('Source and destination are the same table.')
  process.exit(2)
}

process.env.AWS_PROFILE ??= 'ember-reach'
process.env.AWS_REGION ??= 'us-east-2'
const db = new DynamoDBClient({})

// Read every item. A Scan is right here: this is a one-off over a small table, not a request path.
const items: Record<string, AttributeValue>[] = []
for await (const page of paginateScan({ client: db }, { TableName: FROM })) {
  items.push(...(page.Items ?? []))
}

const kinds = new Map<string, number>()
for (const it of items) {
  const kind = it.kind?.S ?? '(hero)'
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
}
console.log(`${FROM} -> ${TO}: ${items.length} items`)
for (const [kind, n] of [...kinds].sort()) console.log(`  ${n.toString().padStart(3)}  ${kind}`)

if (!apply) {
  console.log('\nDry run. Nothing was written. Re-run with --apply to copy.')
  process.exit(0)
}

// BatchWriteItem takes 25 at a time, and can return unprocessed items under throttling: retry those.
let written = 0
for (let i = 0; i < items.length; i += 25) {
  let pending: WriteRequest[] = items.slice(i, i + 25).map(Item => ({ PutRequest: { Item } }))
  for (let attempt = 0; pending.length && attempt < 5; attempt++) {
    const res = await db.send(new BatchWriteItemCommand({ RequestItems: { [TO]: pending } }))
    written += pending.length
    pending = res.UnprocessedItems?.[TO] ?? []
    written -= pending.length
    if (pending.length) await new Promise(r => setTimeout(r, 2 ** attempt * 100))
  }
  if (pending.length) {
    console.error(`Gave up with ${pending.length} items unwritten. Re-run to finish.`)
    process.exit(1)
  }
}

console.log(`\nCopied ${written} items. The source table is untouched.`)
