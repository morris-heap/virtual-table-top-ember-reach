import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetHashType, DockerImage } from 'aws-cdk-lib'
import { Code } from 'aws-cdk-lib/aws-lambda'
import { buildSync } from 'esbuild'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Bundles a Lambda entry point in api/src (e.g. `lambda.ts`) with esbuild (from infra/node_modules) into index.mjs. */
export function bundle(entry: string) {
  return Code.fromAsset(path.join(repoRoot, 'api/src'), {
    // Hash the bundle, not api/src, so changes to /data (imported by sheet.ts) also redeploy.
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      image: DockerImage.fromRegistry('unused'), // required by the type; local bundling always succeeds first
      local: {
        tryBundle(outputDir: string) {
          buildSync({
            entryPoints: [path.join(repoRoot, 'api/src', entry)],
            outfile: path.join(outputDir, 'index.mjs'),
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node22',
            minify: true,
            sourcemap: true,
            // The Node.js 22 runtime ships the AWS SDK v3 clients, so they aren't bundled. The S3 request
            // presigner (VTTER-55) is a helper package, so bundle it rather than rely on the runtime having it.
            external: ['@aws-sdk/client-*', '@aws-sdk/lib-dynamodb'],
            logLevel: 'warning',
          })
          return true
        },
      },
    },
  })
}
