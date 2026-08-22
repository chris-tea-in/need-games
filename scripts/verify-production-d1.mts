import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const productionDatabaseName = 'need-games-production'
export const expectedProductionMigrations = [
  '0001_schema.sql',
  '0002_seed_beta_catalog.sql',
  '0003_authoritative_mimma_seed.sql',
  '0004_identity_sessions.sql',
  '0005_owner_authoritative_mimma_v1.sql',
] as const

const authoritativeRecordHash = 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'

interface ExpectedSchemaObject {
  name: string
  type: 'table' | 'index' | 'trigger'
  sqlFragment: string
}

export const expectedProductionSchemaObjects: readonly ExpectedSchemaObject[] = [
  {
    name: 'catalog_release_metadata',
    type: 'table',
    sqlFragment: 'dataset_version text primary key not null',
  },
  { name: 'games', type: 'table', sqlFragment: 'steam_app_id integer not null' },
  {
    name: 'authoritative_mimma_scores',
    type: 'table',
    sqlFragment: 'approval_status text not null',
  },
  {
    name: 'games_slug_lookup_idx',
    type: 'index',
    sqlFragment: 'create index games_slug_lookup_idx',
  },
  {
    name: 'games_steam_app_id_lookup_idx',
    type: 'index',
    sqlFragment: 'create index games_steam_app_id_lookup_idx',
  },
  {
    name: 'games_catalog_title_idx',
    type: 'index',
    sqlFragment: 'create index games_catalog_title_idx',
  },
  {
    name: 'games_catalog_review_count_idx',
    type: 'index',
    sqlFragment: 'create index games_catalog_review_count_idx',
  },
  {
    name: 'authoritative_mimma_scores_game_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_mimma_scores_game_version_idx',
  },
  {
    name: 'authoritative_mimma_scores_latest_approved_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_mimma_scores_latest_approved_idx',
  },
  {
    name: 'authoritative_mimma_scores_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_mimma_scores',
  },
  {
    name: 'authoritative_mimma_scores_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_mimma_scores',
  },
  { name: 'authoritative_mimma_seeds', type: 'table', sqlFragment: 'provenance text' },
  {
    name: 'authoritative_mimma_seeds_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_mimma_seeds',
  },
  {
    name: 'authoritative_mimma_seeds_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_mimma_seeds',
  },
  {
    name: 'authoritative_mimma_seeds_prevent_insert',
    type: 'trigger',
    sqlFragment: 'before insert on authoritative_mimma_seeds',
  },
  { name: 'users', type: 'table', sqlFragment: 'length(steam_id) = 17' },
  {
    name: 'steam_login_transactions',
    type: 'table',
    sqlFragment: 'steam_response_nonce text unique',
  },
  { name: 'sessions', type: 'table', sqlFragment: 'references users(id) on delete cascade' },
  {
    name: 'steam_login_transactions_expiry_idx',
    type: 'index',
    sqlFragment: 'create index steam_login_transactions_expiry_idx',
  },
  { name: 'sessions_expiry_idx', type: 'index', sqlFragment: 'create index sessions_expiry_idx' },
  { name: 'sessions_user_idx', type: 'index', sqlFragment: 'create index sessions_user_idx' },
  {
    name: 'authoritative_games',
    type: 'table',
    sqlFragment: "id text primary key not null check (id glob 'auth-game-*')",
  },
  {
    name: 'authoritative_mimma_score_versions',
    type: 'table',
    sqlFragment: 'references authoritative_games(id) on delete restrict',
  },
  {
    name: 'authoritative_snapshots',
    type: 'table',
    sqlFragment: "state text not null check (state in ('draft', 'frozen'))",
  },
  {
    name: 'authoritative_snapshot_members',
    type: 'table',
    sqlFragment: 'foreign key (score_id, game_id)',
  },
  {
    name: 'authoritative_game_mappings',
    type: 'table',
    sqlFragment: 'references games(id) on delete restrict',
  },
  {
    name: 'authoritative_mimma_score_versions_game_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_mimma_score_versions_game_version_idx',
  },
  {
    name: 'authoritative_snapshots_state_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_snapshots_state_version_idx',
  },
  {
    name: 'authoritative_game_mappings_game_provider_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_game_mappings_game_provider_version_idx',
  },
  {
    name: 'authoritative_game_mappings_provider_external_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_game_mappings_provider_external_version_idx',
  },
  {
    name: 'authoritative_game_mappings_catalog_version_idx',
    type: 'index',
    sqlFragment: 'create index authoritative_game_mappings_catalog_version_idx',
  },
  {
    name: 'authoritative_games_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_games',
  },
  {
    name: 'authoritative_games_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_games',
  },
  {
    name: 'authoritative_mimma_score_versions_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_mimma_score_versions',
  },
  {
    name: 'authoritative_mimma_score_versions_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_mimma_score_versions',
  },
  {
    name: 'authoritative_snapshots_freeze_guard',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_snapshots',
  },
  {
    name: 'authoritative_snapshots_prevent_frozen_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_snapshots',
  },
  {
    name: 'authoritative_snapshots_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_snapshots',
  },
  {
    name: 'authoritative_snapshot_members_prevent_frozen_insert',
    type: 'trigger',
    sqlFragment: 'before insert on authoritative_snapshot_members',
  },
  {
    name: 'authoritative_snapshot_members_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_snapshot_members',
  },
  {
    name: 'authoritative_snapshot_members_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_snapshot_members',
  },
  {
    name: 'authoritative_game_mappings_prevent_update',
    type: 'trigger',
    sqlFragment: 'before update on authoritative_game_mappings',
  },
  {
    name: 'authoritative_game_mappings_prevent_delete',
    type: 'trigger',
    sqlFragment: 'before delete on authoritative_game_mappings',
  },
  {
    name: 'authoritative_game_mappings_insert_guard',
    type: 'trigger',
    sqlFragment: 'before insert on authoritative_game_mappings',
  },
]

export const expectedProductionSchemaObjectNames = expectedProductionSchemaObjects.map(
  ({ name }) => name,
)

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

function assertSchemaObjects(queryResults: unknown): void {
  const objectRows = requireResultRows(queryResults, 2, 'schema objects')
  const objectsByName = new Map<string, JsonRecord>()
  for (const [rowIndex, row] of objectRows.entries()) {
    if (
      typeof row.name !== 'string' ||
      typeof row.type !== 'string' ||
      typeof row.sql !== 'string'
    ) {
      throw new Error(
        `Production D1 verification failed: schema object row ${rowIndex + 1} is invalid.`,
      )
    }
    if (objectsByName.has(row.name)) {
      throw new Error('Production D1 verification failed: schema objects contain a duplicate name.')
    }
    objectsByName.set(row.name, row)
  }

  if (
    objectsByName.size !== expectedProductionSchemaObjects.length ||
    expectedProductionSchemaObjects.some(({ name }) => !objectsByName.has(name))
  ) {
    throw new Error(
      'Production D1 verification failed: schema objects are incomplete or unexpected.',
    )
  }

  for (const expected of expectedProductionSchemaObjects) {
    const actual = objectsByName.get(expected.name)
    if (actual?.type !== expected.type) {
      throw new Error('Production D1 verification failed: schema objects have an unexpected type.')
    }
    if (!normalizeSql(actual.sql as string).includes(expected.sqlFragment)) {
      throw new Error(
        `Production D1 verification failed: schema SQL for ${expected.name} is altered.`,
      )
    }
  }
}

function assertMigrations(queryResults: unknown): void {
  const migrationRows = requireResultRows(queryResults, 1, 'migration history')
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
      'Production D1 verification failed: migration history does not exactly match the owner-authoritative state.',
    )
  }
}

function assertAuthorityState(queryResults: unknown): void {
  const countRows = requireResultRows(queryResults, 3, 'authoritative release data')
  if (countRows.length !== 1) {
    throw new Error(
      'Production D1 verification failed: authoritative release counts are incomplete.',
    )
  }
  const counts = countRows[0]
  const expectedCounts: Record<string, number> = {
    authoritative_seed_count: 62,
    legacy_score_count: 0,
    authoritative_game_count: 10,
    authoritative_score_version_count: 10,
    authoritative_snapshot_count: 1,
    authoritative_snapshot_member_count: 10,
    authoritative_mapping_count: 8,
    frozen_snapshot_count: 1,
    unmapped_authority_game_count: 2,
  }
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (counts[key] !== expected) {
      throw new Error(`Production D1 verification failed: ${key} is not ${expected}.`)
    }
  }

  const snapshotRows = requireResultRows(queryResults, 4, 'frozen snapshot')
  if (
    snapshotRows.length !== 1 ||
    snapshotRows[0].id !== 'snapshot-owner-authoritative-mimma-v1' ||
    snapshotRows[0].version !== 1 ||
    snapshotRows[0].state !== 'frozen' ||
    snapshotRows[0].expected_member_count !== 10 ||
    snapshotRows[0].member_count !== 10 ||
    snapshotRows[0].distinct_game_count !== 10 ||
    snapshotRows[0].distinct_score_count !== 10 ||
    snapshotRows[0].source_hash !== authoritativeRecordHash
  ) {
    throw new Error('Production D1 verification failed: frozen snapshot state is incomplete.')
  }

  const mappingRows = requireResultRows(queryResults, 5, 'authority mappings')
  const expectedMappings = [
    ['auth-game-counter-strike-2', '730', 'steam-730'],
    ['auth-game-palworld', '1623730', 'steam-1623730'],
    ['auth-game-marvel-rivals', '2767030', 'steam-2767030'],
    ['auth-game-apex-legends', '1172470', 'steam-1172470'],
    ['auth-game-rainbow-six-siege', '359550', 'steam-359550'],
    ['auth-game-baldurs-gate-3', '1086940', 'steam-1086940'],
    ['auth-game-monster-hunter-wilds', '2246340', 'steam-2246340'],
    ['auth-game-elden-ring', '1245620', 'steam-1245620'],
  ] as const
  const actualMappings = mappingRows.map((row) => [
    row.game_id,
    row.external_id,
    row.catalog_game_id,
  ])
  if (
    mappingRows.length !== expectedMappings.length ||
    actualMappings.some(
      (mapping, index) =>
        mapping[0] !== expectedMappings[index][0] ||
        mapping[1] !== expectedMappings[index][1] ||
        mapping[2] !== expectedMappings[index][2] ||
        mappingRows[index].provider !== 'steam' ||
        mappingRows[index].mapping_version !== 1 ||
        mappingRows[index].decision !== 'verified' ||
        mappingRows[index].source_hash !== authoritativeRecordHash,
    )
  ) {
    throw new Error('Production D1 verification failed: authority mappings are incomplete.')
  }

  const unmappedRows = requireResultRows(queryResults, 6, 'unmapped authority games')
  const unmappedIds = unmappedRows.map((row) => row.game_id).sort()
  if (
    unmappedIds.length !== 2 ||
    unmappedIds[0] !== 'auth-game-league-of-legends' ||
    unmappedIds[1] !== 'auth-game-valorant'
  ) {
    throw new Error(
      'Production D1 verification failed: unmapped authority games are not the V1 pair.',
    )
  }

  const provenanceRows = requireResultRows(queryResults, 7, 'authority provenance')
  const expectedProvenance = new Map([
    ['authoritative_games', 10],
    ['authoritative_mimma_score_versions', 10],
    ['authoritative_snapshots', 1],
    ['authoritative_game_mappings', 8],
  ])
  if (
    provenanceRows.length !== expectedProvenance.size ||
    provenanceRows.some(
      (row) =>
        typeof row.source_table !== 'string' ||
        row.row_count !== expectedProvenance.get(row.source_table) ||
        row.source_hash_count !== 1 ||
        row.source_hash !== authoritativeRecordHash ||
        row.source_hash_max !== authoritativeRecordHash,
    )
  ) {
    throw new Error('Production D1 verification failed: authority provenance hash is incomplete.')
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

  const catalogRows = requireResultRows(queryResults, 0, 'catalog release')
  if (
    catalogRows.length !== 1 ||
    catalogRows[0].dataset_version !== 'catalog-release-v1' ||
    catalogRows[0].schema_version !== 1
  ) {
    throw new Error(
      'Production D1 verification failed: catalog release or schema version is unexpected.',
    )
  }
  assertMigrations(queryResults)
  assertSchemaObjects(queryResults)
  assertAuthorityState(queryResults)
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
    'Production D1 identity, permanent schema, owner-authoritative release state, and public-release invariants verified.',
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Production D1 verification failed.')
    process.exitCode = 1
  })
}
