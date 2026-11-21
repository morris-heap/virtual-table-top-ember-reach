import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnOIDCProvider, PolicyStatement, Role, WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

export interface GithubDeployStackProps extends StackProps {
  /** owner/name of the GitHub repository allowed to deploy. */
  repo: string
}

/**
 * GitHub Actions → AWS without stored keys. The deploy job (environment "aws") exchanges its OIDC token
 * for this role, which can only assume the CDK bootstrap roles. Deploy this stack once by hand.
 */
export class GithubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubDeployStackProps) {
    super(scope, id, props)

    const host = 'token.actions.githubusercontent.com'
    const provider = new CfnOIDCProvider(this, 'GithubOidc', {
      url: `https://${host}`,
      clientIdList: ['sts.amazonaws.com'],
    })

    const role = new Role(this, 'DeployRole', {
      roleName: 'emberreach-github-deploy',
      description: `GitHub Actions deploys for ${props.repo} (main, environment aws)`,
      assumedBy: new WebIdentityPrincipal(provider.attrArn, {
        StringEquals: {
          [`${host}:aud`]: 'sts.amazonaws.com',
          [`${host}:sub`]: `repo:${props.repo}:environment:aws`,
        },
      }),
    })
    role.addToPolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`],
    }))

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn })
  }
}
