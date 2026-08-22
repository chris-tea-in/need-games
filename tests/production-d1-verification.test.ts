import { describe, expect, test } from 'vitest'

import {
  assertProductionD1Verification,
  type ProductionD1VerificationInput,
  productionDatabaseName,
} from '../scripts/verify-production-d1.mjs'

const productionDatabaseId = '11111111-1111-4111-8111-111111111111'
const sourceHash = 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'

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

const schemaObjects = [
  ['catalog_release_metadata', 'table', 'dataset_version text primary key not null'],
  ['games', 'table', 'steam_app_id integer not null'],
  ['authoritative_mimma_scores', 'table', 'approval_status text not null'],
  ['games_slug_lookup_idx', 'index', 'create index games_slug_lookup_idx'],
  ['games_steam_app_id_lookup_idx', 'index', 'create index games_steam_app_id_lookup_idx'],
  ['games_catalog_title_idx', 'index', 'create index games_catalog_title_idx'],
  ['games_catalog_review_count_idx', 'index', 'create index games_catalog_review_count_idx'],
  [
    'authoritative_mimma_scores_game_version_idx',
    'index',
    'create index authoritative_mimma_scores_game_version_idx',
  ],
  [
    'authoritative_mimma_scores_latest_approved_idx',
    'index',
    'create index authoritative_mimma_scores_latest_approved_idx',
  ],
  [
    'authoritative_mimma_scores_prevent_update',
    'trigger',
    'before update on authoritative_mimma_scores',
  ],
  [
    'authoritative_mimma_scores_prevent_delete',
    'trigger',
    'before delete on authoritative_mimma_scores',
  ],
  [
    'authoritative_mimma_seeds',
    'table',
    "provenance text check (provenance = 'authoritative_sample_seed')",
  ],
  [
    'authoritative_mimma_seeds_prevent_update',
    'trigger',
    'before update on authoritative_mimma_seeds',
  ],
  [
    'authoritative_mimma_seeds_prevent_delete',
    'trigger',
    'before delete on authoritative_mimma_seeds',
  ],
  [
    'authoritative_mimma_seeds_prevent_insert',
    'trigger',
    'before insert on authoritative_mimma_seeds',
  ],
  ['users', 'table', 'length(steam_id) = 17'],
  ['steam_login_transactions', 'table', 'steam_response_nonce text unique'],
  ['sessions', 'table', 'references users(id) on delete cascade'],
  [
    'steam_login_transactions_expiry_idx',
    'index',
    'create index steam_login_transactions_expiry_idx',
  ],
  ['sessions_expiry_idx', 'index', 'create index sessions_expiry_idx'],
  ['sessions_user_idx', 'index', 'create index sessions_user_idx'],
  ['authoritative_games', 'table', "id text primary key not null check (id glob 'auth-game-*')"],
  [
    'authoritative_mimma_score_versions',
    'table',
    'references authoritative_games(id) on delete restrict',
  ],
  ['authoritative_snapshots', 'table', "state text not null check (state in ('draft', 'frozen'))"],
  ['authoritative_snapshot_members', 'table', 'foreign key (score_id, game_id)'],
  ['authoritative_game_mappings', 'table', 'references games(id) on delete restrict'],
  [
    'authoritative_mimma_score_versions_game_version_idx',
    'index',
    'create index authoritative_mimma_score_versions_game_version_idx',
  ],
  [
    'authoritative_snapshots_state_version_idx',
    'index',
    'create index authoritative_snapshots_state_version_idx',
  ],
  [
    'authoritative_game_mappings_game_provider_version_idx',
    'index',
    'create index authoritative_game_mappings_game_provider_version_idx',
  ],
  [
    'authoritative_game_mappings_provider_external_version_idx',
    'index',
    'create index authoritative_game_mappings_provider_external_version_idx',
  ],
  [
    'authoritative_game_mappings_catalog_version_idx',
    'index',
    'create index authoritative_game_mappings_catalog_version_idx',
  ],
  ['authoritative_games_prevent_update', 'trigger', 'before update on authoritative_games'],
  ['authoritative_games_prevent_delete', 'trigger', 'before delete on authoritative_games'],
  [
    'authoritative_mimma_score_versions_prevent_update',
    'trigger',
    'before update on authoritative_mimma_score_versions',
  ],
  [
    'authoritative_mimma_score_versions_prevent_delete',
    'trigger',
    'before delete on authoritative_mimma_score_versions',
  ],
  ['authoritative_snapshots_freeze_guard', 'trigger', 'before update on authoritative_snapshots'],
  [
    'authoritative_snapshots_prevent_frozen_update',
    'trigger',
    'before update on authoritative_snapshots',
  ],
  ['authoritative_snapshots_prevent_delete', 'trigger', 'before delete on authoritative_snapshots'],
  [
    'authoritative_snapshot_members_prevent_frozen_insert',
    'trigger',
    'before insert on authoritative_snapshot_members',
  ],
  [
    'authoritative_snapshot_members_prevent_update',
    'trigger',
    'before update on authoritative_snapshot_members',
  ],
  [
    'authoritative_snapshot_members_prevent_delete',
    'trigger',
    'before delete on authoritative_snapshot_members',
  ],
  [
    'authoritative_game_mappings_prevent_update',
    'trigger',
    'before update on authoritative_game_mappings',
  ],
  [
    'authoritative_game_mappings_prevent_delete',
    'trigger',
    'before delete on authoritative_game_mappings',
  ],
  [
    'authoritative_game_mappings_insert_guard',
    'trigger',
    'before insert on authoritative_game_mappings',
  ],
] as const

type VerificationRow = Record<string, unknown>
type VerificationFixture = ProductionD1VerificationInput & {
  queryResults: Array<{ results: VerificationRow[] }>
}

function validVerification(): VerificationFixture {
  return {
    expectedDatabaseId: productionDatabaseId,
    expectedDatabaseName: productionDatabaseName,
    info: { uuid: productionDatabaseId, name: productionDatabaseName },
    queryResults: [
      { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
      {
        results: [
          { id: 1, name: '0001_schema.sql' },
          { id: 2, name: '0002_seed_beta_catalog.sql' },
          { id: 3, name: '0003_authoritative_mimma_seed.sql' },
          { id: 4, name: '0004_identity_sessions.sql' },
          { id: 5, name: '0005_owner_authoritative_mimma_v1.sql' },
        ],
      },
      {
        results: schemaObjects.map(([name, type, fragment]) => ({
          name,
          type,
          sql: `CREATE ${type} ${name} ${fragment}`,
        })),
      },
      {
        results: [
          {
            authoritative_seed_count: 62,
            legacy_score_count: 0,
            authoritative_game_count: 10,
            authoritative_score_version_count: 10,
            authoritative_snapshot_count: 1,
            authoritative_snapshot_member_count: 10,
            authoritative_mapping_count: 8,
            frozen_snapshot_count: 1,
            unmapped_authority_game_count: 2,
          },
        ],
      },
      {
        results: [
          {
            id: 'snapshot-owner-authoritative-mimma-v1',
            version: 1,
            state: 'frozen',
            expected_member_count: 10,
            member_count: 10,
            distinct_game_count: 10,
            distinct_score_count: 10,
            source_hash: sourceHash,
          },
        ],
      },
      {
        results: expectedMappings.map(([gameId, externalId, catalogGameId]) => ({
          game_id: gameId,
          provider: 'steam',
          external_id: externalId,
          catalog_game_id: catalogGameId,
          mapping_version: 1,
          decision: 'verified',
          source_hash: sourceHash,
        })),
      },
      { results: [{ game_id: 'auth-game-league-of-legends' }, { game_id: 'auth-game-valorant' }] },
      {
        results: [
          {
            source_table: 'authoritative_games',
            row_count: 10,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_mimma_score_versions',
            row_count: 10,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_snapshots',
            row_count: 1,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
          {
            source_table: 'authoritative_game_mappings',
            row_count: 8,
            source_hash_count: 1,
            source_hash: sourceHash,
            source_hash_max: sourceHash,
          },
        ],
      },
    ],
  }
}

describe('production D1 verification', () => {
  test('accepts the exact owner-authoritative schema, release, counts, and mapping state', () => {
    expect(() => assertProductionD1Verification(validVerification())).not.toThrow()
  })

  test('accepts expected operational identity rows during recurring verification', () => {
    const operationalIdentity = validVerification()
    Object.assign(operationalIdentity.queryResults[3].results[0], {
      user_count: 1,
      login_transaction_count: 2,
      session_count: 1,
    })
    expect(() => assertProductionD1Verification(operationalIdentity)).not.toThrow()
  })

  test.each([
    ['an unexpected database identity', { info: { uuid: productionDatabaseId, name: 'other-db' } }],
    ['a missing catalog release', { queryResults: [{ results: [] }, { results: [] }] }],
    [
      'an unexpected migration prefix',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          { results: [{ id: 1, name: '0009_unexpected.sql' }] },
        ],
      },
    ],
    [
      'an additional migration after the owner release',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 1, name: '0001_schema.sql' },
              { id: 2, name: '0002_seed_beta_catalog.sql' },
              { id: 3, name: '0003_authoritative_mimma_seed.sql' },
              { id: 4, name: '0004_identity_sessions.sql' },
              { id: 5, name: '0005_owner_authoritative_mimma_v1.sql' },
              { id: 6, name: '0006_unexpected.sql' },
            ],
          },
        ],
      },
    ],
    [
      'unexpected migration IDs with the expected names',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 7, name: '0001_schema.sql' },
              { id: 8, name: '0002_seed_beta_catalog.sql' },
            ],
          },
        ],
      },
    ],
  ])('rejects %s before release', (_description, overrides) => {
    expect(() =>
      assertProductionD1Verification({
        ...validVerification(),
        ...(overrides as Partial<VerificationFixture>),
      }),
    ).toThrow(/production D1 verification failed/i)
  })

  test('rejects a missing schema object', () => {
    const fixture = validVerification()
    fixture.queryResults[2].results = fixture.queryResults[2].results.slice(1)
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects a schema object with the wrong SQLite object type', () => {
    const fixture = validVerification()
    const row = fixture.queryResults[2].results.find(
      (candidate) => candidate.name === 'sessions_user_idx',
    )
    if (row === undefined) throw new Error('fixture row missing')
    row.type = 'table'
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects altered schema SQL even when object names and types remain present', () => {
    const fixture = validVerification()
    const row = fixture.queryResults[2].results.find((candidate) => candidate.name === 'games')
    if (row === undefined) throw new Error('fixture row missing')
    row.sql = 'CREATE TABLE games (steam_app_id TEXT)'
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema SQL/i)
  })

  test('rejects an extra schema object', () => {
    const fixture = validVerification()
    fixture.queryResults[2].results.push({
      name: 'unexpected_object',
      type: 'table',
      sql: 'CREATE TABLE unexpected_object (id TEXT)',
    })
    expect(() => assertProductionD1Verification(fixture)).toThrow(/schema objects/i)
  })

  test('rejects count, frozen state, mapping, unmapped, or source-hash drift', () => {
    const mutations: Array<(fixture: VerificationFixture) => void> = [
      (fixture) => {
        fixture.queryResults[3].results[0].authoritative_game_count = 9
      },
      (fixture) => {
        fixture.queryResults[4].results[0].state = 'draft'
      },
      (fixture) => {
        fixture.queryResults[5].results.pop()
      },
      (fixture) => {
        fixture.queryResults[6].results[0].game_id = 'auth-game-counter-strike-2'
      },
      (fixture) => {
        fixture.queryResults[7].results[0].source_hash = '0'.repeat(64)
      },
    ]
    for (const mutate of mutations) {
      const fixture = validVerification()
      mutate(fixture)
      expect(() => assertProductionD1Verification(fixture)).toThrow(
        /production D1 verification failed/i,
      )
    }
  })
})
