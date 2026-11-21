import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'

export const TABLE_NAME = 'emberreach-characters'

/** One item per hero: partition key ownerId, sort key id. Sheet lists are native lists/maps on the item. */
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)
    new TableV2(this, 'Characters', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'ownerId', type: AttributeType.STRING },
      sortKey: { name: 'id', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      deletionProtection: true,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    })
  }
}
