import { describe, expect, it } from 'vitest'
import { cognitoVerifier } from '../src/auth.ts'

describe('cognitoVerifier', () => {
  it('rejects everything when the pool is not configured', async () => {
    expect(await cognitoVerifier(undefined, undefined)('anything')).toBeNull()
  })

  it('rejects a malformed token without calling Cognito', async () => {
    const verify = cognitoVerifier('us-east-2_AbCdEfGhI', 'client123')
    expect(await verify('not-a-jwt')).toBeNull()
  })

  it('rejects a token from another issuer', async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const token = `${b64({ alg: 'RS256', kid: 'k' })}.${b64({
      iss: 'https://evil.example', sub: 'x', token_use: 'access', client_id: 'client123', exp: 9999999999,
    })}.sig`
    expect(await cognitoVerifier('us-east-2_AbCdEfGhI', 'client123')(token)).toBeNull()
  })
})
