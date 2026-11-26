import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { AttributeType, Billing, ProjectionType, TableV2 } from 'aws-cdk-lib/aws-dynamodb'
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, ObjectOwnership } from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

/**
 * The table holds every item kind (heroes, profiles, adventures, Games, member pointers, name
 * reservations, lookups), not only characters, so it is named for the product (VTTER-94, 2026-11-25).
 * It was `emberreach-characters` until then; the rename replaced the table while it held only test data.
 */
export const TABLE_NAME = 'vtter-game'
/** Account id in the name keeps it globally unique. Private: reached only through signed URLs from the API. */
export const PORTRAIT_BUCKET_NAME = 'emberreach-portraits-913427211898'
/**
 * The table's one general-purpose index. Keys are deliberately generic (`gsi1pk` / `gsi1sk`) rather than
 * named for a single use: every item kind that needs cross-partition listing writes its own values here,
 * so later access patterns reuse this index instead of each adding one. A GSI costs write capacity on
 * every indexed write and the table is capped at 20 of them, so one shared index is the cheap shape.
 * Must match GSI1 in api/src/game-store.ts.
 */
export const GSI1 = 'gsi1'

export interface DataStackProps extends StackProps {
  /** Browser origins that may PUT and GET portraits through signed URLs. */
  allowedOrigins: string[]
}

/**
 * One item per hero: partition key ownerId, sort key id. Sheet lists are native lists/maps on the item.
 * The construct id stays `Characters` even though the table is now `vtter-game`: renaming a construct id
 * replaces the table, and the id is invisible outside CloudFormation. Don't "tidy" it. Always `cdk diff`.
 */
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
      // One shared, sparse index (VTTER-76, ADR 0008). Only items that write `gsi1pk` appear in it, so
      // heroes, profiles and member pointers cost nothing. Today its only writer is a public Game a GM
      // opted to list (`gsi1pk = 'game#public'`, `gsi1sk = <updatedAt>`); other kinds add their own
      // prefixes later without a second index.
      // Adding a GSI is an additive update and does not replace the table — confirm with `cdk diff`.
      globalSecondaryIndexes: [{
        indexName: GSI1,
        partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
        sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
        // Only what a browse row renders. The base table keys (`ownerId`, `id`) come along automatically
        // in every projection, and `ownerId` is the GM's Cognito `sub` — so the route must map these rows
        // to a safe view and never return one as-is (see the browse route in api/src/handler.ts).
        // `memberIds` is here because a row shows a member count, which the API derives from it.
        // The GM's display name and player ID are not: they live on the profile, looked up per row.
        // `updatedAt` is projected explicitly: it is no longer the index sort key, but a browse row shows it.
        projectionType: ProjectionType.INCLUDE,
        nonKeyAttributes: ['name', 'adventure', 'visibility', 'solo', 'memberIds', 'createdAt', 'updatedAt'],
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
