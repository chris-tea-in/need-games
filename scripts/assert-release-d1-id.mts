import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const localPreviewDatabaseIdSentinel = '00000000-0000-4000-8000-000000000001'
export const productionDatabaseIdSentinel = '00000000-0000-4000-8000-000000000002'

const allowedDatabaseIds = new Set([localPreviewDatabaseIdSentinel, productionDatabaseIdSentinel])
const databaseIdEntryPattern = /"database_id"\s*:\s*"([^"]*)"/g
const trackedConfigPath = 'wrangler.jsonc'

export function assertTrackedDatabaseIdsAreSentinels(trackedConfig: string): void {
  const databaseIds = [...trackedConfig.matchAll(databaseIdEntryPattern)].map(
    ([, databaseId]) => databaseId,
  )

  if (databaseIds.length === 0) {
    throw new Error(
      'Release blocked: the tracked Wrangler configuration declares no D1 database_id entries.',
    )
  }

  const realDatabaseIds = databaseIds.filter((databaseId) => !allowedDatabaseIds.has(databaseId))
  if (realDatabaseIds.length > 0) {
    throw new Error(
      `Release blocked: the tracked Wrangler configuration must keep placeholder D1 database IDs, but it declares ${realDatabaseIds.join(', ')}. Real database IDs belong only in the generated production configuration.`,
    )
  }

  const expectedDatabaseIds = [localPreviewDatabaseIdSentinel, productionDatabaseIdSentinel]
  if (
    databaseIds.length !== expectedDatabaseIds.length ||
    [...databaseIds].sort().join('\n') !== [...expectedDatabaseIds].sort().join('\n')
  ) {
    throw new Error(
      'Release blocked: the tracked Wrangler configuration must contain exactly the preview and production sentinel IDs.',
    )
  }
}

async function main(): Promise<void> {
  assertTrackedDatabaseIdsAreSentinels(await readFile(trackedConfigPath, 'utf8'))
  console.log(`${trackedConfigPath} declares only placeholder D1 database IDs.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'The release check failed.')
    process.exitCode = 1
  })
}
