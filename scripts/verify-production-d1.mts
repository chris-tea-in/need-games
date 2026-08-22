import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

const expectedAuthorityIdentities = [
  ['auth-game-apex-legends', 'apex-legends', 'Apex Legends'],
  ['auth-game-baldurs-gate-3', 'baldurs-gate-3', "Baldur's Gate 3"],
  ['auth-game-counter-strike-2', 'counter-strike-2', 'Counter-Strike 2'],
  ['auth-game-elden-ring', 'elden-ring', 'ELDEN RING'],
  ['auth-game-league-of-legends', 'league-of-legends', 'League of Legends'],
  ['auth-game-marvel-rivals', 'marvel-rivals', 'Marvel Rivals'],
  ['auth-game-monster-hunter-wilds', 'monster-hunter-wilds', 'Monster Hunter Wilds'],
  ['auth-game-palworld', 'palworld', 'Palworld'],
  ['auth-game-rainbow-six-siege', 'rainbow-six-siege', "Tom Clancy's Rainbow Six Siege"],
  ['auth-game-valorant', 'valorant', 'Valorant'],
] as const

const expectedScoreVersions = [
  ['auth-score-apex-legends-v1', 'auth-game-apex-legends', 80, 80, 100, '80.0', '80.0', '100.0'],
  [
    'auth-score-baldurs-gate-3-v1',
    'auth-game-baldurs-gate-3',
    20,
    20,
    100,
    '20.0',
    '20.0',
    '100.0',
  ],
  [
    'auth-score-counter-strike-2-v1',
    'auth-game-counter-strike-2',
    100,
    65,
    80,
    '100.0',
    '65.0',
    '80.0',
  ],
  ['auth-score-elden-ring-v1', 'auth-game-elden-ring', 80, 100, 40, '80.0', '100.0', '40.0'],
  [
    'auth-score-league-of-legends-v1',
    'auth-game-league-of-legends',
    69,
    77,
    100,
    '68.6',
    '77.1',
    '100.0',
  ],
  ['auth-score-marvel-rivals-v1', 'auth-game-marvel-rivals', 80, 60, 80, '80.0', '60.0', '80.0'],
  [
    'auth-score-monster-hunter-wilds-v1',
    'auth-game-monster-hunter-wilds',
    80,
    40,
    60,
    '80.0',
    '40.0',
    '60.0',
  ],
  ['auth-score-palworld-v1', 'auth-game-palworld', 40, 20, 70, '40.0', '20.0', '70.0'],
  [
    'auth-score-rainbow-six-siege-v1',
    'auth-game-rainbow-six-siege',
    80,
    60,
    80,
    '80.0',
    '60.0',
    '80.0',
  ],
  ['auth-score-valorant-v1', 'auth-game-valorant', 100, 73, 80, '100.0', '73.3', '80.0'],
] as const

const expectedMigrationSourceHashes: Record<string, string> = {
  '0001_schema.sql': '751a94bbaa163c92f074ba49c0216884901ae088db1c5260fd2ec1425dc4b961',
  '0002_seed_beta_catalog.sql': '897e30cb9961132245af3f4cc98b92d217ebbcbfb3d745b1d1f09f998b2628e4',
  '0003_authoritative_mimma_seed.sql':
    '425a56ae640a2b00c8505a51388402ece135417c1b52e8e2f60b8f5800b6f265',
  '0004_identity_sessions.sql': '643def4fc16805e84914918c67759adbc61cf9d17a5dfdcd6ed4a53d8a7a45f3',
  '0005_owner_authoritative_mimma_v1.sql':
    'f1c61a0e5ec4a2219b6658e840eb112e17f60e5813a0d290089eea0218850717',
}

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

  const identityRows = requireResultRows(queryResults, 4, 'authoritative identities')
  if (
    identityRows.length !== expectedAuthorityIdentities.length ||
    identityRows.some((row, index) => {
      const [id, identityKey, title] = expectedAuthorityIdentities[index]
      return !rowMatchesExpected(row, {
        id,
        identity_key: identityKey,
        canonical_title: title,
        introduced_manifest_version: 'owner-authoritative-mimma-v1',
        introduced_source_hash: authoritativeRecordHash,
        created_on: '2026-08-21',
      })
    })
  ) {
    throw new Error('Production D1 verification failed: authority identities are incomplete.')
  }

  const scoreRows = requireResultRows(queryResults, 5, 'authoritative score versions')
  if (
    scoreRows.length !== expectedScoreVersions.length ||
    scoreRows.some((row, index) => {
      const [id, gameId, micro, meso, macro, microOriginal, mesoOriginal, macroOriginal] =
        expectedScoreVersions[index]
      return !rowMatchesExpected(row, {
        id,
        game_id: gameId,
        version: 1,
        micro_score: micro,
        meso_score: meso,
        macro_score: macro,
        micro_original_decimal: microOriginal,
        meso_original_decimal: mesoOriginal,
        macro_original_decimal: macroOriginal,
        decimal_scale: 1,
        rounding_mode: 'half-up-to-integer-v1',
        source_manifest_version: 'owner-authoritative-mimma-v1',
        source_hash: authoritativeRecordHash,
        provenance: 'owner_authoritative',
        approval_reason: 'initial-owner-snapshot',
        approved_on: '2026-08-21',
      })
    })
  ) {
    throw new Error('Production D1 verification failed: authority score versions are incomplete.')
  }

  const snapshotRows = requireResultRows(queryResults, 6, 'frozen snapshot')
  if (
    snapshotRows.length !== 1 ||
    snapshotRows[0].id !== 'snapshot-owner-authoritative-mimma-v1' ||
    snapshotRows[0].version !== 1 ||
    snapshotRows[0].manifest_version !== 'owner-authoritative-mimma-v1' ||
    snapshotRows[0].state !== 'frozen' ||
    snapshotRows[0].expected_member_count !== 10 ||
    snapshotRows[0].member_count !== 10 ||
    snapshotRows[0].distinct_game_count !== 10 ||
    snapshotRows[0].distinct_score_count !== 10 ||
    snapshotRows[0].source_hash !== authoritativeRecordHash ||
    snapshotRows[0].created_on !== '2026-08-21' ||
    snapshotRows[0].frozen_on !== '2026-08-21'
  ) {
    throw new Error('Production D1 verification failed: frozen snapshot state is incomplete.')
  }

  const expectedSnapshotMembers = [
    ['auth-game-apex-legends', 'auth-score-apex-legends-v1'],
    ['auth-game-baldurs-gate-3', 'auth-score-baldurs-gate-3-v1'],
    ['auth-game-counter-strike-2', 'auth-score-counter-strike-2-v1'],
    ['auth-game-elden-ring', 'auth-score-elden-ring-v1'],
    ['auth-game-league-of-legends', 'auth-score-league-of-legends-v1'],
    ['auth-game-marvel-rivals', 'auth-score-marvel-rivals-v1'],
    ['auth-game-monster-hunter-wilds', 'auth-score-monster-hunter-wilds-v1'],
    ['auth-game-palworld', 'auth-score-palworld-v1'],
    ['auth-game-rainbow-six-siege', 'auth-score-rainbow-six-siege-v1'],
    ['auth-game-valorant', 'auth-score-valorant-v1'],
  ] as const
  const memberRows = requireResultRows(queryResults, 7, 'frozen snapshot members')
  const actualSnapshotMembers = memberRows.map((row) => [row.game_id, row.score_id])
  if (
    memberRows.length !== expectedSnapshotMembers.length ||
    actualSnapshotMembers.some(
      (member, index) =>
        member[0] !== expectedSnapshotMembers[index][0] ||
        member[1] !== expectedSnapshotMembers[index][1],
    )
  ) {
    throw new Error('Production D1 verification failed: frozen snapshot members are incomplete.')
  }

  const expectedMappings = [
    {
      id: 'auth-map-steam-apex-legends-v1',
      game_id: 'auth-game-apex-legends',
      provider: 'steam',
      external_id: '1172470',
      catalog_game_id: 'steam-1172470',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-baldurs-gate-3-v1',
      game_id: 'auth-game-baldurs-gate-3',
      provider: 'steam',
      external_id: '1086940',
      catalog_game_id: 'steam-1086940',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-counter-strike-2-v1',
      game_id: 'auth-game-counter-strike-2',
      provider: 'steam',
      external_id: '730',
      catalog_game_id: 'steam-730',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-elden-ring-v1',
      game_id: 'auth-game-elden-ring',
      provider: 'steam',
      external_id: '1245620',
      catalog_game_id: 'steam-1245620',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-marvel-rivals-v1',
      game_id: 'auth-game-marvel-rivals',
      provider: 'steam',
      external_id: '2767030',
      catalog_game_id: 'steam-2767030',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-monster-hunter-wilds-v1',
      game_id: 'auth-game-monster-hunter-wilds',
      provider: 'steam',
      external_id: '2246340',
      catalog_game_id: 'steam-2246340',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-palworld-v1',
      game_id: 'auth-game-palworld',
      provider: 'steam',
      external_id: '1623730',
      catalog_game_id: 'steam-1623730',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
    {
      id: 'auth-map-steam-rainbow-six-siege-v1',
      game_id: 'auth-game-rainbow-six-siege',
      provider: 'steam',
      external_id: '359550',
      catalog_game_id: 'steam-359550',
      mapping_version: 1,
      decision: 'verified',
      verification_ref: 'owner-approved-manifest-v1',
      supersedes_mapping_id: null,
      source_manifest_version: 'owner-authoritative-mimma-v1',
    },
  ] as const
  const mappingRows = requireResultRows(queryResults, 8, 'authority mappings')
  if (
    mappingRows.length !== expectedMappings.length ||
    mappingRows.some(
      (row, index) =>
        row.id !== expectedMappings[index].id ||
        row.game_id !== expectedMappings[index].game_id ||
        row.provider !== expectedMappings[index].provider ||
        row.external_id !== expectedMappings[index].external_id ||
        row.catalog_game_id !== expectedMappings[index].catalog_game_id ||
        row.mapping_version !== expectedMappings[index].mapping_version ||
        row.decision !== expectedMappings[index].decision ||
        row.verification_ref !== expectedMappings[index].verification_ref ||
        row.supersedes_mapping_id !== expectedMappings[index].supersedes_mapping_id ||
        row.source_manifest_version !== expectedMappings[index].source_manifest_version ||
        row.source_hash !== authoritativeRecordHash ||
        row.decided_on !== '2026-08-21',
    )
  ) {
    throw new Error('Production D1 verification failed: authority mappings are incomplete.')
  }

  const unmappedRows = requireResultRows(queryResults, 9, 'unmapped authority games')
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

  const provenanceRows = requireResultRows(queryResults, 10, 'authority provenance')
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
