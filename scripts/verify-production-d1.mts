import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  hashOwnerAuthoritativeManifest,
  parseOwnerAuthoritativeManifest,
} from './generate-owner-authoritative-mimma.mts'
import {
  authoritativeRecord,
  legacyTableCounts,
  productionMigrations,
  readReleasedCatalog,
} from './release-manifest.mts'

export const productionDatabaseName = 'need-games-production'
export const expectedProductionMigrations = productionMigrations.map(({ name }) => name)

const expectedMigrationSourceHashes: Readonly<Record<string, string>> = Object.fromEntries(
  productionMigrations.map(({ name, sha256 }) => [name, sha256]),
)

/** Read the owner-authoritative record and refuse it unless it matches the manifest's pinned hash. */
function loadAuthoritativeRecord() {
  const source = readFileSync(authoritativeRecord.url, 'utf8')
  if (hashOwnerAuthoritativeManifest(source) !== authoritativeRecord.sha256) {
    throw new Error(
      'Production D1 verification failed: the owner-authoritative record does not match its pinned hash.',
    )
  }
  return parseOwnerAuthoritativeManifest(source)
}

const record = loadAuthoritativeRecord()
const authoritativeRecordHash = authoritativeRecord.sha256
const releasedCatalog = readReleasedCatalog()

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

// Sorted exactly like the verification queries in release-production.mts.
const expectedGames = [...record.games].sort((left, right) => compareText(left.id, right.id))
const expectedMappings = [...record.mappings].sort(
  (left, right) =>
    compareText(left.authoritativeGameId, right.authoritativeGameId) ||
    compareText(left.provider, right.provider) ||
    left.version - right.version,
)
const mappedGameIds = new Set(record.mappings.map((mapping) => mapping.authoritativeGameId))
const expectedUnmappedGameIds = expectedGames
  .filter((game) => !mappedGameIds.has(game.id))
  .map((game) => game.id)

interface ExpectedSchemaObjectContract {
  name: string
  type: 'table' | 'index' | 'trigger'
  sqlFragment: string
}

const expectedProductionSchemaObjectContracts: readonly ExpectedSchemaObjectContract[] = [
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
    sqlFragment:
      "id text primary key not null check (id glob 'auth-game-*' and id not glob 'auth-game-steam-*')",
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
    name: 'authoritative_snapshots_prevent_frozen_insert',
    type: 'trigger',
    sqlFragment: 'before insert on authoritative_snapshots',
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

function readCanonicalMigrationSource(name: string): string {
  const source = readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
  const actualHash = createHash('sha256').update(source, 'utf8').digest('hex')
  if (actualHash !== expectedMigrationSourceHashes[name]) {
    throw new Error(
      `Production D1 verification failed: canonical migration source ${name} is altered.`,
    )
  }
  return source
}

function loadCanonicalSchemaObjects(): readonly ExpectedSchemaObject[] {
  const canonicalByName = new Map<string, ExpectedSchemaObject>()
  for (const migrationName of expectedProductionMigrations) {
    for (const segment of readCanonicalMigrationSource(migrationName).split(
      /--> statement-breakpoint/,
    )) {
      const statement = segment
        .replace(/^(?:\s*--[^\n]*(?:\n|$))+/, '')
        .trim()
        .replace(/;\s*$/, '')
      const match = statement.match(
        /^CREATE\s+(?:(?:UNIQUE)\s+)?(TABLE|INDEX|TRIGGER)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i,
      )
      if (match === null) continue
      const [, type, name] = match
      if (canonicalByName.has(name)) {
        throw new Error(
          `Production D1 verification failed: duplicate canonical schema object ${name}.`,
        )
      }
      canonicalByName.set(name, {
        name,
        type: type.toLowerCase() as ExpectedSchemaObject['type'],
        sql: normalizeSql(statement),
      })
    }
  }

  if (
    canonicalByName.size !== expectedProductionSchemaObjectContracts.length ||
    expectedProductionSchemaObjectContracts.some(({ name, type }) => {
      const object = canonicalByName.get(name)
      return object === undefined || object.type !== type
    })
  ) {
    throw new Error('Production D1 verification failed: canonical schema allowlist is incomplete.')
  }

  return expectedProductionSchemaObjectContracts.map(
    ({ name }) => canonicalByName.get(name) as ExpectedSchemaObject,
  )
}

interface ExpectedSchemaObject {
  name: string
  type: 'table' | 'index' | 'trigger'
  sql: string
}

export const expectedProductionSchemaObjects = loadCanonicalSchemaObjects()

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

function rowMatchesExpected(row: JsonRecord, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([key, value]) => row[key] === value)
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
  return sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').trim().toLowerCase()
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
    if (normalizeSql(actual.sql as string) !== expected.sql) {
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
    authoritative_seed_count: legacyTableCounts.authoritativeSeedCount,
    legacy_score_count: legacyTableCounts.legacyScoreCount,
    authoritative_game_count: expectedGames.length,
    authoritative_score_version_count: expectedGames.length,
    authoritative_snapshot_count: 1,
    authoritative_snapshot_member_count: expectedGames.length,
    authoritative_mapping_count: expectedMappings.length,
    frozen_snapshot_count: 1,
    unmapped_authority_game_count: expectedUnmappedGameIds.length,
  }
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (counts[key] !== expected) {
      throw new Error(`Production D1 verification failed: ${key} is not ${expected}.`)
    }
  }

  const identityRows = requireResultRows(queryResults, 4, 'authoritative identities')
  if (
    identityRows.length !== expectedGames.length ||
    identityRows.some(
      (row, index) =>
        !rowMatchesExpected(row, {
          id: expectedGames[index].id,
          identity_key: expectedGames[index].identityKey,
          canonical_title: expectedGames[index].canonicalTitle,
          introduced_manifest_version: record.manifestVersion,
          introduced_source_hash: authoritativeRecordHash,
          created_on: record.snapshot.approvedOn,
        }),
    )
  ) {
    throw new Error('Production D1 verification failed: authority identities are incomplete.')
  }

  const scoreRows = requireResultRows(queryResults, 5, 'authoritative score versions')
  if (
    scoreRows.length !== expectedGames.length ||
    scoreRows.some((row, index) => {
      const { id: gameId, score } = expectedGames[index]
      return !rowMatchesExpected(row, {
        id: score.id,
        game_id: gameId,
        version: score.version,
        micro_score: score.micro,
        meso_score: score.meso,
        macro_score: score.macro,
        micro_original_decimal: score.microOriginal,
        meso_original_decimal: score.mesoOriginal,
        macro_original_decimal: score.macroOriginal,
        decimal_scale: record.rounding.decimalScale,
        rounding_mode: record.rounding.mode,
        source_manifest_version: record.manifestVersion,
        source_hash: authoritativeRecordHash,
        provenance: 'owner_authoritative',
        approval_reason: score.approvalReason,
        approved_on: score.approvedOn,
      })
    })
  ) {
    throw new Error('Production D1 verification failed: authority score versions are incomplete.')
  }

  const snapshotRows = requireResultRows(queryResults, 6, 'frozen snapshot')
  if (
    snapshotRows.length !== 1 ||
    snapshotRows[0].id !== record.snapshot.id ||
    snapshotRows[0].version !== record.snapshot.version ||
    snapshotRows[0].manifest_version !== record.manifestVersion ||
    snapshotRows[0].state !== 'frozen' ||
    snapshotRows[0].expected_member_count !== expectedGames.length ||
    snapshotRows[0].member_count !== expectedGames.length ||
    snapshotRows[0].distinct_game_count !== expectedGames.length ||
    snapshotRows[0].distinct_score_count !== expectedGames.length ||
    snapshotRows[0].source_hash !== authoritativeRecordHash ||
    snapshotRows[0].created_on !== record.snapshot.approvedOn ||
    snapshotRows[0].frozen_on !== record.snapshot.approvedOn
  ) {
    throw new Error('Production D1 verification failed: frozen snapshot state is incomplete.')
  }

  const memberRows = requireResultRows(queryResults, 7, 'frozen snapshot members')
  if (
    memberRows.length !== expectedGames.length ||
    memberRows.some(
      (row, index) =>
        row.game_id !== expectedGames[index].id || row.score_id !== expectedGames[index].score.id,
    )
  ) {
    throw new Error('Production D1 verification failed: frozen snapshot members are incomplete.')
  }

  const mappingRows = requireResultRows(queryResults, 8, 'authority mappings')
  if (
    mappingRows.length !== expectedMappings.length ||
    mappingRows.some((row, index) => {
      const mapping = expectedMappings[index]
      return (
        row.id !== mapping.id ||
        row.game_id !== mapping.authoritativeGameId ||
        row.provider !== mapping.provider ||
        row.external_id !== mapping.externalId ||
        row.catalog_game_id !== mapping.catalogGameId ||
        row.mapping_version !== mapping.version ||
        row.decision !== mapping.decision ||
        row.verification_ref !== mapping.verificationRef ||
        row.supersedes_mapping_id !== null ||
        row.source_manifest_version !== record.manifestVersion ||
        row.source_hash !== authoritativeRecordHash ||
        row.decided_on !== mapping.decidedOn
      )
    })
  ) {
    throw new Error('Production D1 verification failed: authority mappings are incomplete.')
  }

  const unmappedRows = requireResultRows(queryResults, 9, 'unmapped authority games')
  const unmappedIds = unmappedRows.map((row) => row.game_id).sort()
  if (
    unmappedIds.length !== expectedUnmappedGameIds.length ||
    unmappedIds.some((id, index) => id !== expectedUnmappedGameIds[index])
  ) {
    throw new Error(
      'Production D1 verification failed: unmapped authority games do not match the record.',
    )
  }

  const provenanceRows = requireResultRows(queryResults, 10, 'authority provenance')
  const expectedProvenance = new Map([
    ['authoritative_games', expectedGames.length],
    ['authoritative_mimma_score_versions', expectedGames.length],
    ['authoritative_snapshots', 1],
    ['authoritative_game_mappings', expectedMappings.length],
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
    catalogRows[0].dataset_version !== releasedCatalog.datasetVersion ||
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
