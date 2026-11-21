import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib'
import {
  AccountRecovery, CfnManagedLoginBranding, FeaturePlan, ManagedLoginVersion, Mfa, OAuthScope, ProviderAttribute,
  UserPool, UserPoolClientIdentityProvider, UserPoolIdentityProviderGoogle,
} from 'aws-cdk-lib/aws-cognito'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'

/** SSM parameters the API stack reads at deploy time, so the two stacks deploy independently (no exports). */
export const AUTH_PARAMS = {
  userPoolId: '/emberreach/auth/user-pool-id',
  userPoolClientId: '/emberreach/auth/web-client-id',
} as const

export interface AuthStackProps extends StackProps {
  /** Cognito prefix domain: <prefix>.auth.<region>.amazoncognito.com. Must be unique in the Region. */
  domainPrefix: string
  /** Exact app URLs (with the Vite base and trailing slash) Cognito may redirect back to after sign-in and sign-out. */
  appUrls: string[]
  /**
   * Optional Google sign-in. Set the OAuth client id here and store the client secret in Secrets Manager
   * (see infra/README.md). Leave undefined for email + password only.
   */
  google?: { clientId: string; clientSecretName: string }
}

/**
 * Sign-in for the companion app (docs/adr/0004-auth-cognito.md): a Cognito user pool with managed login,
 * one public app client using the OAuth 2.0 authorization code grant with PKCE (no client secret).
 * The API verifies the access token itself, so this stack only publishes the pool and client ids (AUTH_PARAMS).
 */
export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props)

    const pool = new UserPool(this, 'Users', {
      userPoolName: 'emberreach-users',
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 10, requireSymbols: false },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // Accounts own heroes: never delete the pool by accident.
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const providers = [UserPoolClientIdentityProvider.COGNITO]
    let google: UserPoolIdentityProviderGoogle | undefined
    if (props.google) {
      google = new UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: pool,
        clientId: props.google.clientId,
        // Resolved by CloudFormation at deploy time; the secret never appears in the template or the repo.
        clientSecretValue: SecretValue.secretsManager(props.google.clientSecretName),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          emailVerified: ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
          fullname: ProviderAttribute.GOOGLE_NAME,
          profilePicture: ProviderAttribute.GOOGLE_PICTURE,
        },
      })
      providers.push(UserPoolClientIdentityProvider.GOOGLE)
    }

    const domain = pool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    })

    const client = pool.addClient('Web', {
      userPoolClientName: 'emberreach-web',
      generateSecret: false, // public browser client: PKCE instead of a secret
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: props.appUrls,
        logoutUrls: props.appUrls,
      },
      supportedIdentityProviders: providers,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    })
    if (google) client.node.addDependency(google)

    // Managed login v2 shows nothing for a client without a branding style. Start from Cognito's default look.
    const branding = new CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: pool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    })
    branding.node.addDependency(domain)

    new StringParameter(this, 'UserPoolIdParam', { parameterName: AUTH_PARAMS.userPoolId, stringValue: pool.userPoolId })
    new StringParameter(this, 'ClientIdParam', { parameterName: AUTH_PARAMS.userPoolClientId, stringValue: client.userPoolClientId })

    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId })
    new CfnOutput(this, 'LoginDomain', { value: `${props.domainPrefix}.auth.${this.region}.amazoncognito.com` })
  }
}
