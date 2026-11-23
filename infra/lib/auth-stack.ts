import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnStage, HttpApi } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import {
  AccountRecovery, CfnManagedLoginBranding, FeaturePlan, ManagedLoginVersion, Mfa, OAuthScope, OidcAttributeRequestMethod,
  ProviderAttribute, UserPool, UserPoolClientIdentityProvider, UserPoolIdentityProviderGoogle,
  UserPoolIdentityProviderOidc, type IUserPoolIdentityProvider, type OidcEndpoints,
} from 'aws-cdk-lib/aws-cognito'
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms'
import { Architecture, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { SETTINGS, brandingAssets } from './branding/settings.ts'
import { bundle } from './bundle.ts'

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
  google?: SocialClient
  /**
   * Optional Microsoft sign-in (Entra ID app registration, OIDC). `tenantId` picks which accounts can sign in:
   * the default is the personal-accounts tenant (Outlook, Hotmail, Xbox). Cognito checks the token issuer exactly,
   * so the multi-tenant `common` and `organizations` endpoints don't work; use one tenant id.
   */
  microsoft?: SocialClient & { tenantId?: string }
  /**
   * Optional GitHub sign-in. GitHub's OAuth isn't OIDC, so this also deploys a small OIDC wrapper
   * (api/src/github-oidc.ts: a Lambda behind its own HTTP API, signing ID tokens with a KMS key).
   */
  github?: SocialClient
}

/** A social provider's OAuth client: the public client id, and the Secrets Manager name holding its secret. */
export interface SocialClient { clientId: string; clientSecretName: string }

/** Microsoft's tenant for personal Microsoft accounts (the `consumers` audience). */
export const MICROSOFT_CONSUMERS_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

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
    const idps: IUserPoolIdentityProvider[] = []
    if (props.google) {
      const google = new UserPoolIdentityProviderGoogle(this, 'Google', {
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
      idps.push(google)
    }

    // OIDC providers. The provider name is what the app passes as `identity_provider` to skip the picker,
    // and the resourceId of its button icon in the branding.
    const oidc = (name: string, client: SocialClient, issuerUrl: string, scopes: string[], endpoints?: OidcEndpoints) => {
      const idp = new UserPoolIdentityProviderOidc(this, name, {
        userPool: pool,
        name,
        clientId: client.clientId,
        // A CloudFormation dynamic reference: the secret is resolved at deploy time and never in the template.
        clientSecret: SecretValue.secretsManager(client.clientSecretName).unsafeUnwrap(),
        issuerUrl,
        scopes,
        endpoints,
        attributeRequestMethod: OidcAttributeRequestMethod.GET,
        attributeMapping: {
          email: ProviderAttribute.other('email'),
          fullname: ProviderAttribute.other('name'),
          givenName: ProviderAttribute.other('given_name'),
          familyName: ProviderAttribute.other('family_name'),
          profilePicture: ProviderAttribute.other('picture'), // GitHub sends one; Microsoft doesn't
        },
      })
      providers.push(UserPoolClientIdentityProvider.custom(name))
      idps.push(idp)
    }
    const oidcNames: string[] = []
    if (props.microsoft) {
      const tenant = props.microsoft.tenantId ?? MICROSOFT_CONSUMERS_TENANT
      oidc('Microsoft', props.microsoft, `https://login.microsoftonline.com/${tenant}/v2.0`, ['openid', 'email', 'profile'])
      oidcNames.push('Microsoft')
    }
    if (props.github) {
      const issuer = this.githubOidcWrapper(props.github.clientId)
      oidc('GitHub', props.github, issuer, ['openid', 'email', 'profile'], {
        authorization: `${issuer}/authorize`,
        token: `${issuer}/token`,
        userInfo: `${issuer}/userinfo`,
        jwksUri: `${issuer}/.well-known/jwks.json`,
      })
      oidcNames.push('GitHub')
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
    for (const idp of idps) client.node.addDependency(idp)

    // Managed login v2 needs a branding style per client. Ours is the Emberreach dark theme (lib/branding).
    const branding = new CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: pool.userPoolId,
      clientId: client.userPoolClientId,
      settings: SETTINGS,
      assets: brandingAssets(oidcNames),
    })
    branding.node.addDependency(domain)

    new StringParameter(this, 'UserPoolIdParam', { parameterName: AUTH_PARAMS.userPoolId, stringValue: pool.userPoolId })
    new StringParameter(this, 'ClientIdParam', { parameterName: AUTH_PARAMS.userPoolClientId, stringValue: client.userPoolClientId })

    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId })
    new CfnOutput(this, 'LoginDomain', { value: `${props.domainPrefix}.auth.${this.region}.amazoncognito.com` })
  }

  /**
   * The GitHub OIDC wrapper: an asymmetric KMS key for signing ID tokens, a Lambda, and an HTTP API whose URL is
   * the issuer. Returns the issuer URL. The GitHub client secret isn't given to the wrapper: Cognito sends it on
   * each /token call.
   */
  private githubOidcWrapper(githubClientId: string): string {
    const key = new Key(this, 'GithubOidcSigningKey', {
      description: 'Signs ID tokens from the Emberreach GitHub OIDC wrapper (VTTER-62)',
      keySpec: KeySpec.RSA_2048,
      keyUsage: KeyUsage.SIGN_VERIFY,
      removalPolicy: RemovalPolicy.DESTROY, // nothing is encrypted with it; a new key just means a new JWKS
      pendingWindow: Duration.days(7),
    })
    const fn = new Function(this, 'GithubOidc', {
      functionName: 'emberreach-github-oidc',
      code: bundle('github-oidc-lambda.ts'),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: { SIGNING_KEY_ID: key.keyArn, GITHUB_CLIENT_ID: githubClientId, NODE_OPTIONS: '--enable-source-maps' },
      logGroup: new LogGroup(this, 'GithubOidcLogs', {
        logGroupName: '/aws/lambda/emberreach-github-oidc',
        retention: RetentionDays.ONE_MONTH,
      }),
    })
    key.grant(fn, 'kms:Sign', 'kms:GetPublicKey')

    const api = new HttpApi(this, 'GithubOidcApi', {
      apiName: 'emberreach-github-oidc',
      description: 'OIDC wrapper so Cognito can use GitHub sign-in (VTTER-62)',
      defaultIntegration: new HttpLambdaIntegration('GithubOidcLambda', fn),
    })
    const stage = api.defaultStage!.node.defaultChild as CfnStage
    stage.defaultRouteSettings = { throttlingRateLimit: 10, throttlingBurstLimit: 20 }
    new CfnOutput(this, 'GithubOidcIssuer', { value: api.apiEndpoint })
    return api.apiEndpoint
  }
}
