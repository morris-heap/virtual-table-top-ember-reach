# ADR 0003: Backend on AWS: DynamoDB and Lambda

- **Status:** Accepted (2026-11-21)
- **Jira:** VTTER-57 (in VTTER-51, Backend epic)
- **Supersedes:** [ADR 0002](0002-backend-postgres.md) (Cloudflare Worker + Optilogic Postgres)

## Context

ADR 0002 put heroes in the Optilogic Postgres test environment, behind a Cloudflare Worker. That environment
restarts and drops its firewall rules, so the Worker needed Hyperdrive, a firewall self-repair path, a 10-minute
cron and six scripts just to stay connected. We now have an AWS project (ember-reach, new AWS experience,
Region **us-east-2**, Free plan with credits) and want the whole backend in one place.

## Decision

- **Database:** **DynamoDB**, on-demand, table `emberreach-characters`. **One item per hero**: partition key
  `ownerId`, sort key `id`. Top-level sheet fields are attributes. Skills, wounds, attacks, talents and spells are
  native DynamoDB maps and lists on the item (never JSON strings). Derived numbers (max Grit/Ember, Dodge, Will,
  Speed) still aren't stored. Deletion protection and point-in-time recovery are on, and the table is retained if
  its stack is deleted.
- **Reads after writes:** single-hero reads are strongly consistent, and a list is a `Query` on the owner's
  partition (also consistent). A save is one `UpdateItem` that replaces the sheet and keeps `createdAt`.
- **API:** a **Lambda function** (Node.js 22, arm64, 256 MB, on-demand) behind an **API Gateway HTTP API**. Every
  route goes to the function. Routing, validation and CORS are unchanged in `api/src/handler.ts`, and
  `api/src/lambda.ts` adapts API Gateway events to it. The stage is throttled to 10 requests/s (burst 20) because
  anyone can call it until login exists. The function's role can only Get, Query, Update and Delete items in the table.
- **Owners until users exist:** unchanged: `X-Owner-Id` (a client UUID) until VTTER-53. Because the owner is
  part of the key, one owner can't read, change or delete another's hero. Saving under an id another owner uses
  just creates your own hero with that id.
- **Infrastructure as code:** AWS CDK (TypeScript) in `infra/`, with three stacks: `EmberreachData` (table, with
  termination protection), `EmberreachApi` (function and HTTP API, which finds the table by name, so there's
  no cross-stack export) and `EmberreachGithubDeploy` (one-time).
- **Deploy:** `.github/workflows/api.yml` runs the API tests and `cdk synth` on PRs. On pushes to `main` it
  assumes `emberreach-github-deploy` through **GitHub OIDC** (environment `aws`, no stored AWS keys) and runs
  `cdk deploy`. That role can only assume the CDK bootstrap roles.
- **Secrets:** none. Local tools use the AWS CLI profile `ember-reach` (`aws login`), and the function uses its role.

## Alternatives considered

- **Keep the Cloudflare Worker and call DynamoDB from it:** the smallest code change, but it needs a long-lived
  AWS access key stored as a Worker secret, and it keeps two clouds.
- **Lambda Web Functions:** these need a Node.js server listening on a port. Our handler is a plain
  request → response function, so an Event Function behind HTTP API fits without a server.
- **Lambda Function URL instead of HTTP API:** cheaper, but has no throttling, and the API is unauthenticated for now.
- **Split items (one per skill, wound…), mirroring the old child tables:** more writes and code, with no query that
  needs them.
- **Aurora/RDS Postgres:** keeps SQL, but costs money while idle and needs a VPC.

## Consequences

- Cost: inside the Free plan credits at this size. Lambda, HTTP API and DynamoDB on-demand all bill per request.
- The "real columns and child tables" rule from ADR 0002 is replaced: sheet fields are item attributes, and lists
  are native lists and maps. The API still checks every value against `/data`.
- Gone: Hyperdrive, Optilogic firewall repair, the cron, `pg`, SQL migrations and Cloudflare deploys. Changing the
  item shape is a code change (and, if needed, a backfill script), not a migration file.
- The old Optilogic test rows are not migrated. They were test data.
- Portraits (VTTER-55) can go in S3 in the same Region.
