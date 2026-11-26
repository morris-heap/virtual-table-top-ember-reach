// A throwaway Cognito user for one end-to-end run, created and deleted through
// the `ember-reach` AWS CLI profile (AGENTS.md: no AWS keys in .env or code).
//
// AdminCreateUser + AdminSetUserPassword is used rather than the hosted UI's own
// sign-up form because the form emails a confirmation code we cannot read. The
// user it makes is identical to a real one, so `GET /profile` still runs the real
// first-time path that mints the player ID -- which is what these tests check.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const REGION = 'us-east-2'
const PROFILE = process.env.AWS_PROFILE ?? 'ember-reach'
/** Published by the auth stack; read from SSM so the id is never hard-coded. */
const POOL_PARAM = '/emberreach/auth/user-pool-id'

function aws(args: string[]): string {
  return execFileSync('aws', [...args, '--region', REGION, '--profile', PROFILE, '--output', 'text'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function userPoolId(): string {
  return aws(['ssm', 'get-parameter', '--name', POOL_PARAM, '--query', 'Parameter.Value'])
}

export interface Throwaway { email: string; password: string; poolId: string; sub?: string }

/** The DynamoDB table holding profiles and the player-ID lookup. */
const TABLE = 'vtter-game'

/** Creates a confirmed, ready-to-sign-in user. Always pair with `deleteUser`. */
export function createUser(): Throwaway {
  const poolId = userPoolId()
  // `.test` is reserved (RFC 2606), so these addresses can never reach anyone.
  const email = `claude-e2e-${randomUUID().slice(0, 8)}@emberreach.test`
  const password = `Aa1!${randomUUID().replace(/-/g, '').slice(0, 20)}`
  aws(['cognito-idp', 'admin-create-user', '--user-pool-id', poolId, '--username', email,
    '--message-action', 'SUPPRESS',
    '--user-attributes', `Name=email,Value=${email}`, 'Name=email_verified,Value=true'])
  aws(['cognito-idp', 'admin-set-user-password', '--user-pool-id', poolId, '--username', email,
    '--password', password, '--permanent'])
  // The sub is the API's ownerId; capture it now so cleanup works even if the
  // user is already gone by then.
  const sub = aws(['cognito-idp', 'admin-get-user', '--user-pool-id', poolId,
    '--username', email, '--query', 'Username'])
  return { email, password, poolId, sub }
}

/**
 * Deletes the Cognito user AND the rows it created in DynamoDB.
 *
 * Deleting the user alone is not enough: signing in mints a profile item and a
 * `_player` lookup row, and those survive the user, leaving an orphaned player
 * ID that holds its slot in the ID space for ever. AGENTS.md says to clean up
 * test data, so both go.
 *
 * Safe to call twice, and never fails the test it is cleaning up after.
 */
export function deleteUser(u: Throwaway | undefined): void {
  if (!u) return

  // Resolve the Cognito sub, which is the ownerId of the rows to remove.
  let sub = u.sub
  if (!sub) {
    try {
      sub = aws(['cognito-idp', 'admin-get-user', '--user-pool-id', u.poolId,
        '--username', u.email, '--query', 'Username'])
    } catch { /* already gone; nothing to resolve */ }
  }

  try {
    aws(['cognito-idp', 'admin-delete-user', '--user-pool-id', u.poolId, '--username', u.email])
  } catch (err) {
    console.error(`WARNING: could not delete the test user ${u.email}. Delete it by hand.`, err)
  }

  if (!sub) return
  try {
    // Read the player ID off the profile before deleting it, so the lookup row
    // can go too.
    const playerId = aws(['dynamodb', 'get-item', '--table-name', TABLE,
      '--key', JSON.stringify({ ownerId: { S: sub }, id: { S: 'profile' } }),
      '--consistent-read', '--query', 'Item.playerId.S'])
    aws(['dynamodb', 'delete-item', '--table-name', TABLE,
      '--key', JSON.stringify({ ownerId: { S: sub }, id: { S: 'profile' } })])
    if (playerId && playerId !== 'None') {
      aws(['dynamodb', 'delete-item', '--table-name', TABLE,
        '--key', JSON.stringify({ ownerId: { S: '_player' }, id: { S: playerId } })])
    }
  } catch (err) {
    console.error(`WARNING: left test rows for ${u.email} in ${TABLE}. Remove them by hand.`, err)
  }
}
