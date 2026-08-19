import { chmod, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const productionDatabaseIdSentinel = '00000000-0000-4000-8000-000000000002'

const localDatabaseIdSentinel = '00000000-0000-4000-8000-000000000001'
const databaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sourceConfigPath = 'wrangler.jsonc'
const outputConfigPath = '.wrangler.production.jsonc'

function countOccurrences(value: string, searchValue: string): number {
  return value.split(searchValue).length - 1
}

export function createProductionWranglerConfig(
  safeConfig: string,
  productionDatabaseId: string,
): string {
  if (
    !databaseIdPattern.test(productionDatabaseId) ||
    productionDatabaseId === localDatabaseIdSentinel ||
    productionDatabaseId === productionDatabaseIdSentinel
  ) {
    throw new Error('A real production D1 database ID is required.')
  }

  if (countOccurrences(safeConfig, productionDatabaseIdSentinel) !== 1) {
    throw new Error('The safe Wrangler config must contain exactly one production D1 sentinel.')
  }

  return safeConfig.replace(productionDatabaseIdSentinel, productionDatabaseId)
}

async function main(): Promise<void> {
  const safeConfig = await readFile(sourceConfigPath, 'utf8')
  const generatedConfig = createProductionWranglerConfig(
    safeConfig,
    process.env.NEED_GAMES_PRODUCTION_D1_DATABASE_ID ?? '',
  )

  await writeFile(outputConfigPath, generatedConfig, { encoding: 'utf8', mode: 0o600 })
  await chmod(outputConfigPath, 0o600)
  console.log(`Created temporary production configuration at ${outputConfigPath}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Production configuration failed.')
    process.exitCode = 1
  })
}
