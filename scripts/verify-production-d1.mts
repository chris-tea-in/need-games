import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const productionDatabaseName = 'need-games-production'
export const expectedProductionMigrations = [
  '0001_schema.sql',
  '0002_seed_beta_catalog.sql',
  '0003_authoritative_mimma_seed.sql',
  '0004_identity_sessions.sql',
] as const

const expectedAuthSchemaObjects = [
  ['authoritative_mimma_seeds', 'table'],
  ['authoritative_mimma_seeds_prevent_delete', 'trigger'],
  ['authoritative_mimma_seeds_prevent_insert', 'trigger'],
  ['authoritative_mimma_seeds_prevent_update', 'trigger'],
  ['sessions', 'table'],
  ['sessions_expiry_idx', 'index'],
  ['sessions_user_idx', 'index'],
  ['steam_login_transactions', 'table'],
  ['steam_login_transactions_expiry_idx', 'index'],
  ['users', 'table'],
] as const

const productionDatabaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const localPreviewDatabaseIdSentinel = '00000000-0000-4000-8000-000000000001'
const productionDatabaseIdSentinel = '00000000-0000-4000-8000-000000000002'
const productionDatabaseIdEnvironmentVariable = 'PRODUCTION_D1_DATABASE_ID'

type JsonRecord = Record<string, unknown>

export interface ProductionD1VerificationInput {
  expectedDatabaseId: string
  expectedDatabaseName: string
  info: unknown
  queryResults: unknown
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`Production D1 verification failed: ${label} is missing.`)
  }
  return value
}

function requireResultRows(
  queryResults: unknown,
  resultIndex: number,
  label: string,
): JsonRecord[] {
  if (!Array.isArray(queryResults) || resultIndex >= queryResults.length) {
    throw new Error(`Production D1 verification failed: ${label} query result is missing.`)
  }

  const result = requireRecord(queryResults[resultIndex], `${label} query result`)
  if (!Array.isArray(result.results)) {
    throw new Error(`Production D1 verification failed: ${label} query returned no rows.`)
  }

  return result.results.map((row, rowIndex) =>
    requireRecord(row, `${label} query row ${rowIndex + 1}`),
  )
}

function assertProductionDatabaseId(databaseId: string): void {
  const normalizedDatabaseId = databaseId.toLowerCase()
  if (
    !productionDatabaseIdPattern.test(databaseId) ||
    normalizedDatabaseId === localPreviewDatabaseIdSentinel ||
    normalizedDatabaseId === productionDatabaseIdSentinel
  ) {
    throw new Error('Production D1 verification failed: a real database ID is required.')
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function assertAuthSchema(queryResults: unknown): void {
  const objectRows = requireResultRows(queryResults, 2, 'auth schema')
  const objectsByName = new Map(
    objectRows.map((row, rowIndex) => {
      if (
        typeof row.name !== 'string' ||
        typeof row.type !== 'string' ||
        typeof row.sql !== 'string'
      ) {
        throw new Error(
          `Production D1 verification failed: auth schema row ${rowIndex + 1} is invalid.`,
        )
      }
      return [row.name, row.type]
    }),
  )
  if (
    objectsByName.size !== expectedAuthSchemaObjects.length ||
    !expectedAuthSchemaObjects.every(([name, type]) => objectsByName.get(name) === type)
  ) {
    throw new Error('Production D1 verification failed: auth schema objects are incomplete.')
  }

  const objectSql = new Map(
    objectRows.map((row) => [row.name as string, normalizeSql(row.sql as string)]),
  )
  const requiredTableSql = [
    ['authoritative_mimma_seeds', "provenance = 'authoritative_sample_seed'"],
    ['users', 'length(steam_id) = 17'],
    ['users', "steam_id not glob '*[^0-9]*'"],
    ['steam_login_transactions', 'steam_response_nonce text unique'],
    ['sessions', 'references users(id) on delete cascade'],
  ] as const
  if (
    requiredTableSql.some(
      ([name, fragment]) => !objectSql.get(name)?.includes(fragment.toLowerCase()),
    )
  ) {
    throw new Error('Production D1 verification failed: auth schema constraints are incomplete.')
  }

  const countRows = requireResultRows(queryResults, 3, 'auth data')
  if (countRows.length !== 1 || countRows[0].authoritative_seed_count !== 62) {
    throw new Error('Production D1 verification failed: authoritative seed data is incomplete.')
  }
}

export function assertProductionD1Verification({
  expectedDatabaseId,
  expectedDatabaseName,
  info,
  queryResults,
}: ProductionD1VerificationInput): void {
  assertProductionDatabaseId(expectedDatabaseId)

  const databaseInfo = requireRecord(info, 'database identity')
  if (
    typeof databaseInfo.uuid !== 'string' ||
    databaseInfo.uuid.toLowerCase() !== expectedDatabaseId.toLowerCase() ||
    databaseInfo.name !== expectedDatabaseName
  ) {
    throw new Error('Production D1 verification failed: database identity does not match config.')
  }

  const [catalogRows, migrationRows] = [
    requireResultRows(queryResults, 0, 'catalog release'),
    requireResultRows(queryResults, 1, 'migration history'),
  ]

  if (
    catalogRows.length !== 1 ||
    catalogRows[0].dataset_version !== 'catalog-release-v1' ||
    catalogRows[0].schema_version !== 1
  ) {
    throw new Error(
      'Production D1 verification failed: catalog release or schema version is unexpected.',
    )
  }

  const migrations = migrationRows.map((row, rowIndex) => {
    if (typeof row.id !== 'number' || typeof row.name !== 'string') {
      throw new Error(
        `Production D1 verification failed: migration history row ${rowIndex + 1} is invalid.`,
      )
    }
    return { id: row.id, name: row.name }
  })

  if (
    migrations.length !== expectedProductionMigrations.length ||
    migrations.some(
      (migration, index) =>
        migration.id !== index + 1 || migration.name !== expectedProductionMigrations[index],
    )
  ) {
    throw new Error(
      'Production D1 verification failed: migration history does not exactly match the auth-ready state.',
    )
  }

  assertAuthSchema(queryResults)
}

function parseArguments(argv: readonly string[]): { infoPath: string; statePath: string } {
  const infoIndex = argv.indexOf('--info-file')
  const stateIndex = argv.indexOf('--state-file')
  const infoPath = infoIndex >= 0 ? argv[infoIndex + 1] : undefined
  const statePath = stateIndex >= 0 ? argv[stateIndex + 1] : undefined

  if (infoPath === undefined || statePath === undefined) {
    throw new Error('Usage: verify-production-d1.mts --info-file <path> --state-file <path>')
  }

  return { infoPath, statePath }
}

async function main(): Promise<void> {
  const { infoPath, statePath } = parseArguments(process.argv.slice(2))
  const [info, queryResults] = await Promise.all([
    readFile(infoPath, 'utf8').then((value) => JSON.parse(value) as unknown),
    readFile(statePath, 'utf8').then((value) => JSON.parse(value) as unknown),
  ])

  assertProductionD1Verification({
    expectedDatabaseId: process.env[productionDatabaseIdEnvironmentVariable] ?? '',
    expectedDatabaseName: productionDatabaseName,
    info,
    queryResults,
  })
  console.log(
    'Production D1 identity, auth schema, exact migration state, and catalog release verified.',
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Production D1 verification failed.')
    process.exitCode = 1
  })
}
