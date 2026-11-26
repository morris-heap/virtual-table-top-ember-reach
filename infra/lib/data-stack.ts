import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { AttributeType, Billing, ProjectionType, TableV2 } from 'aws-cdk-lib/aws-dynamodb'
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, ObjectOwnership } from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

export const TABLE_NAME = 'emberreach-characters'
/** Account id in the name keeps it globally unique. Private: reached only through signed URLs from the API. */
export const PORTRAIT_BUCKET_NAME = 'emberreach-portraits-913427211898'
/** Must match PUBLIC_INDEX in api/src/game-store.ts. */
export const PUBLIC_GAMES_INDEX = 'PublicGames'

export interface DataStackProps extends StackProps {
  /** Browser origins that may PUT and GET portraits through signed URLs. */
  allowedOrigins: string[]
}

/** One item per hero: partition key ownerId, sort key id. Sheet lists are native lists/maps on the item. */
export class DataStack extends Stack {
  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)
    new TableV2(this, 'Characters', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'ownerId', type: AttributeType.STRING },
      sortKey: { name: 'id', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      deletionProtection: true,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
      // Lists the public Games a GM opted to show (VTTER-76, ADR 0008). Sparse: `listed` exists only on
      // those Games, so private ones are absent from the index rather than filtered out on read.
      // Adding a GSI is an additive update and does not replace the table — confirm with `cdk diff`.
      globalSecondaryIndexes: [{
        indexName: PUBLIC_GAMES_INDEX,
        partitionKey: { name: 'listed', type: AttributeType.STRING },
        sortKey: { name: 'updatedAt', type: AttributeType.STRING },
        // Only what a browse row renders. The base table keys (`ownerId`, `id`) come along automatically
        // in every projection, and `ownerId` is the GM's Cognito `sub` — so the route must map these rows
        // to a safe view and never return one as-is (see the browse route in api/src/handler.ts).
        // `memberIds` is here because a row shows a member count, which the API derives from it.
        // The GM's display name and player ID are not: they live on the profile, looked up per row.
        projectionType: ProjectionType.INCLUDE,
        nonKeyAttributes: ['name', 'adventure', 'visibility', 'solo', 'memberIds', 'createdAt'],
      }],
    })

    // Hero portraits (VTTER-55): objects are `<ownerId>/<heroId>`. Nothing is public: the API signs
    // short-lived URLs, and only for the signed-in owner of the hero.
    new Bucket(this, 'Portraits', {
      bucketName: PORTRAIT_BUCKET_NAME,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
      cors: [{
        allowedOrigins: props.allowedOrigins,
        allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
        allowedHeaders: ['content-type', 'content-length'],
        maxAge: 86400,
      }],
    })
  }
}
