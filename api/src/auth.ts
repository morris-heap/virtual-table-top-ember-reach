// Token verification for the API (VTTER-53, docs/adr/0004-auth-cognito.md). The app sends the Cognito
// access token from the OAuth code + PKCE sign-in as `Authorization: Bearer <token>`. aws-jwt-verify checks
// the signature against the user pool's JWKS (cached per execution environment), the issuer, `exp`,
// `token_use: access` and `client_id`. The verified `sub` becomes the hero owner id.
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { VerifyToken } from './handler.ts'

export function cognitoVerifier(userPoolId: string | undefined, clientId: string | undefined): VerifyToken {
  if (!userPoolId || !clientId) {
    console.warn('USER_POOL_ID / USER_POOL_CLIENT_ID not set: every /characters request will get 401')
    return async () => null
  }
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' })
  return async token => {
    try {
      const payload = await verifier.verify(token)
      return payload.sub
    } catch {
      return null
    }
  }
}
