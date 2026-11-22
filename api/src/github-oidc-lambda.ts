// Lambda entry point for the GitHub OIDC wrapper (github-oidc.ts, VTTER-62). ID tokens are signed by an
// asymmetric KMS key (RSA_2048, SIGN_VERIFY): the private key never leaves KMS, so there's no secret to store.
import { createPublicKey } from 'node:crypto'
import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { handleGithubOidc, type Signer } from './github-oidc.ts'
import { toRequest, toResult } from './http.ts'

export function kmsSigner(kms: KMSClient, keyId: string): Signer {
  let jwk: Promise<Record<string, unknown>> | undefined
  return {
    // The key id is a stable, non-secret label for the key.
    kid: keyId.split('/').pop()!,
    async sign(data) {
      const out = await kms.send(new SignCommand({
        KeyId: keyId, Message: data, MessageType: 'RAW', SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      }))
      if (!out.Signature) throw new Error('KMS returned no signature')
      return out.Signature
    },
    publicJwk() {
      jwk ??= kms.send(new GetPublicKeyCommand({ KeyId: keyId })).then(out => {
        if (!out.PublicKey) throw new Error('KMS returned no public key')
        const { kty, n, e } = createPublicKey({ key: Buffer.from(out.PublicKey), format: 'der', type: 'spki' }).export({ format: 'jwk' })
        return { kty, n, e }
      })
      return jwk
    },
  }
}

const signer = kmsSigner(new KMSClient({}), process.env.SIGNING_KEY_ID ?? '')
const clientId = process.env.GITHUB_CLIENT_ID ?? ''

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return toResult(await handleGithubOidc(toRequest(event), { clientId, signer, fetch, now: Date.now }))
}
