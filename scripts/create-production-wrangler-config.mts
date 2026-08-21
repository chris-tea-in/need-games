import { chmod, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { parseConfigFileTextToJson } from 'typescript'

export const productionDatabaseIdSentinel = '00000000-0000-4000-8000-000000000002'
export const productionDatabaseIdEnvironmentVariable = 'PRODUCTION_D1_DATABASE_ID'
export const requiredProductionSecretNames = ['STEAM_WEB_API_KEY', 'CSRF_HMAC_SECRET'] as const

const localDatabaseIdSentinel = '00000000-0000-4000-8000-000000000001'
const databaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sourceConfigPath = 'wrangler.jsonc'
const outputConfigPath = '.wrangler.production.jsonc'

function countOccurrences(value: string, searchValue: string): number {
  return value.split(searchValue).length - 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRequiredProductionSecrets(safeConfig: string): void {
  const parsedConfig = parseConfigFileTextToJson(sourceConfigPath, safeConfig)
  if (parsedConfig.error !== undefined || !isRecord(parsedConfig.config)) {
    throw new Error('The safe Wrangler config is invalid JSONC.')
  }

  const environments = parsedConfig.config.env
  const production = isRecord(environments) ? environments.production : undefined
  const secrets = isRecord(production) ? production.secrets : undefined
  const required = isRecord(secrets) ? secrets.required : undefined
  const configuredNames = Array.isArray(required)
    ? required.filter((name): name is string => typeof name === 'string')
    : []

  if (
    configuredNames.length !== requiredProductionSecretNames.length ||
    !requiredProductionSecretNames.every((name) => configuredNames.includes(name))
  ) {
    throw new Error(
      `The safe Wrangler config must declare exactly these required production secrets: ${requiredProductionSecretNames.join(', ')}.`,
    )
  }
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

  assertRequiredProductionSecrets(safeConfig)

  return safeConfig.replace(productionDatabaseIdSentinel, productionDatabaseId)
}

async function main(): Promise<void> {
  const safeConfig = await readFile(sourceConfigPath, 'utf8')
  const generatedConfig = createProductionWranglerConfig(
    safeConfig,
    process.env[productionDatabaseIdEnvironmentVariable] ?? '',
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
