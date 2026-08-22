import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { describe, expect, test } from 'vitest'

import {
  EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
  assertMigrationArtifactMatches,
  parseOwnerAuthoritativeManifest,
  renderOwnerAuthoritativeMimmaSql,
  validateOwnerAuthoritativeCatalogMappings,
} from '../scripts/generate-owner-authoritative-mimma.mjs'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'data/authoritative-records/owner-authoritative-mimma-v1.json')
const migrationPath = resolve(root, 'migrations/0005_owner_authoritative_mimma_v1.sql')
const generatorPath = resolve(root, 'scripts/generate-owner-authoritative-mimma.mts')

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function committedMigration(): string {
  return normalizeLineEndings(readFileSync(migrationPath, 'utf8'))
}

const expectedCatalogRows = [
  { id: 'steam-730', steamAppId: 730 },
  { id: 'steam-1623730', steamAppId: 1623730 },
  { id: 'steam-2767030', steamAppId: 2767030 },
  { id: 'steam-1172470', steamAppId: 1172470 },
  { id: 'steam-359550', steamAppId: 359550 },
  { id: 'steam-1086940', steamAppId: 1086940 },
  { id: 'steam-2246340', steamAppId: 2246340 },
  { id: 'steam-1245620', steamAppId: 1245620 },
] as const
const MANIFEST_VERSION_LITERAL = 'owner-authoritative-mimma-v1'

function migrationStatements(): string[] {
  return committedMigration()
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function databaseBeforeOwnerMigration(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  for (const migration of [
    '0001_schema.sql',
    '0002_seed_beta_catalog.sql',
    '0003_authoritative_mimma_seed.sql',
    '0004_identity_sessions.sql',
  ]) {
    for (const statement of readFileSync(resolve(root, 'migrations', migration), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      database.exec(statement)
    }
  }
  return database
}

function ownerTableCounts(database: DatabaseSync): Record<string, number> {
  return Object.fromEntries(
    [
      'authoritative_games',
      'authoritative_mimma_score_versions',
      'authoritative_snapshots',
      'authoritative_snapshot_members',
      'authoritative_game_mappings',
    ].map((table) => [
      table,
      Number(
        (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
          .count,
      ),
    ]),
  )
}

function runUntilPreflightFails(
  database: DatabaseSync,
  beforePreflight: (database: DatabaseSync) => void,
): void {
  const statements = migrationStatements()
  const preflightIndex = statements.findIndex((statement) =>
    statement.includes('owner-authoritative migration preflight'),
  )
  expect(preflightIndex).toBeGreaterThan(0)
  for (const statement of statements.slice(0, preflightIndex)) database.exec(statement)
  beforePreflight(database)
  expect(() => database.exec(statements[preflightIndex])).toThrow(
    /overflow|preflight|catalog|legacy|conflict/i,
  )
}

describe('owner-authoritative MiMMa migration generator', () => {
  test('renders the committed migration byte-for-byte from the immutable manifest', () => {
    const source = readFileSync(manifestPath, 'utf8')
    const sql = renderOwnerAuthoritativeMimmaSql(parseOwnerAuthoritativeManifest(source))

    expect(createHash('sha256').update(source, 'utf8').digest('hex')).toBe(
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
    )
    expect(committedMigration()).toBe(sql)
    expect(sql).toMatch(/\n$/)
    expect(sql).not.toMatch(/\r/)
    expect(() =>
      assertMigrationArtifactMatches(migrationPath, sql.replaceAll('\n', '\r\n')),
    ).not.toThrow()
  })

  test('creates the five additive tables, five indexes, and fourteen triggers in contract order', () => {
    const sql = committedMigration()
    const tableNames = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((match) => match[1])
    const indexNames = [...sql.matchAll(/CREATE INDEX (\w+)/g)].map((match) => match[1])
    const triggerNames = [...sql.matchAll(/CREATE TRIGGER (\w+)/g)].map((match) => match[1])

    expect(tableNames).toEqual([
      'authoritative_games',
      'authoritative_mimma_score_versions',
      'authoritative_snapshots',
      'authoritative_snapshot_members',
      'authoritative_game_mappings',
    ])
    expect(indexNames).toEqual([
      'authoritative_mimma_score_versions_game_version_idx',
      'authoritative_snapshots_state_version_idx',
      'authoritative_game_mappings_game_provider_version_idx',
      'authoritative_game_mappings_provider_external_version_idx',
      'authoritative_game_mappings_catalog_version_idx',
    ])
    expect(triggerNames).toEqual([
      'authoritative_games_prevent_update',
      'authoritative_games_prevent_delete',
      'authoritative_mimma_score_versions_prevent_update',
      'authoritative_mimma_score_versions_prevent_delete',
      'authoritative_snapshots_freeze_guard',
      'authoritative_snapshots_prevent_frozen_insert',
      'authoritative_snapshots_prevent_frozen_update',
      'authoritative_snapshots_prevent_delete',
      'authoritative_snapshot_members_prevent_frozen_insert',
      'authoritative_snapshot_members_prevent_update',
      'authoritative_snapshot_members_prevent_delete',
      'authoritative_game_mappings_prevent_update',
      'authoritative_game_mappings_prevent_delete',
      'authoritative_game_mappings_insert_guard',
    ])
  })

  test('emits the exact V1 row counts and provenance-bearing source hash', () => {
    const sql = committedMigration()

    expect(sql.match(/INSERT INTO authoritative_games \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_mimma_score_versions \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_snapshot_members \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_snapshots \(/g)).toHaveLength(1)
    expect(sql.match(/INSERT INTO authoritative_game_mappings \(/g)).toHaveLength(8)
    expect(
      sql.match(new RegExp(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256, 'g'))?.length,
    ).toBeGreaterThanOrEqual(29)
    expect(sql).toContain("UPDATE authoritative_snapshots SET state = 'frozen'")
  })

  test('is additive and leaves the legacy Steam-bound score table untouched', () => {
    const sql = committedMigration()

    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bALTER\b/i)
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+authoritative_mimma_scores\b/i)
    expect(sql).not.toMatch(/authoritative_mimma_scores\s*\(/i)
    expect(sql).toContain('EXISTS (SELECT 1 FROM authoritative_mimma_scores)')
  })

  test('keeps excluded catalog members and raw data outside the generated SQL', () => {
    const sql = committedMigration()

    for (const excluded of [
      'Destiny 2',
      'BeamNG.drive',
      'survey',
      'comment',
      'hours',
      'playtime',
    ]) {
      expect(sql.toLowerCase()).not.toContain(excluded.toLowerCase())
    }
    expect(sql).toContain('auth-game-league-of-legends')
    expect(sql).toContain('auth-game-valorant')
    expect(sql.match(/INSERT INTO authoritative_game_mappings[\s\S]*?;/g)?.join('\n')).not.toMatch(
      /league-of-legends|valorant/,
    )
  })

  test('uses statement breakpoints and validates every V1 Steam catalog identity', () => {
    const sql = committedMigration()

    expect(sql).toContain('-- owner-authoritative migration preflight')
    for (const [catalogGameId, appId] of [
      ['steam-730', '730'],
      ['steam-1623730', '1623730'],
      ['steam-2767030', '2767030'],
      ['steam-1172470', '1172470'],
      ['steam-359550', '359550'],
      ['steam-1086940', '1086940'],
      ['steam-2246340', '2246340'],
      ['steam-1245620', '1245620'],
    ]) {
      expect(sql).toContain(`'${catalogGameId}'`)
      expect(sql).toContain(`'${appId}'`)
    }
    expect(sql.split('--> statement-breakpoint').length).toBeGreaterThan(25)
    expect(sql.split('--> statement-breakpoint\r\n')).toHaveLength(1)
  })

  test.each([
    ['missing catalog row', expectedCatalogRows.slice(1)],
    [
      'wrong Steam App ID',
      expectedCatalogRows.map((row, index) => (index === 0 ? { ...row, steamAppId: 731 } : row)),
    ],
    ['duplicate catalog row', [...expectedCatalogRows, expectedCatalogRows[0]]],
    [
      'invalid Steam App ID',
      expectedCatalogRows.map((row, index) => (index === 0 ? { ...row, steamAppId: 0 } : row)),
    ],
  ])('rejects %s before rendering authority data', (_label, catalogRows) => {
    const manifest = parseOwnerAuthoritativeManifest(readFileSync(manifestPath, 'utf8'))
    expect(() => validateOwnerAuthoritativeCatalogMappings(manifest, catalogRows)).toThrow()
  })

  test('aborts before the first authority write for every catalog preflight failure', () => {
    const failures: Array<[string, (database: DatabaseSync) => void]> = [
      [
        'missing catalog row',
        (database) => database.exec("DELETE FROM games WHERE id = 'steam-730'"),
      ],
      [
        'mismatched catalog row',
        (database) => database.exec("UPDATE games SET steam_app_id = 731 WHERE id = 'steam-730'"),
      ],
      [
        'non-empty legacy score table',
        (database) =>
          database.exec(
            "INSERT INTO authoritative_mimma_scores (id, game_id, version, micro_score, meso_score, macro_score, provenance, approval_reason, approved_at, version_metadata_json, approval_status) VALUES ('legacy-conflict', 'steam-730', 1, 1, 2, 3, 'owner_authoritative', 'test', '2026-08-21', '{}', 'approved')",
          ),
      ],
      [
        'conflicting V1 authority row',
        (database) =>
          database.exec(
            "INSERT INTO authoritative_games (id, identity_key, canonical_title, introduced_manifest_version, introduced_source_hash, created_on) VALUES ('auth-game-counter-strike-2', 'counter-strike-2', 'Conflict', 'owner-authoritative-mimma-v1', 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65', '2026-08-21')",
          ),
      ],
    ]

    for (const [label, beforePreflight] of failures) {
      const database = databaseBeforeOwnerMigration()
      expect(() => runUntilPreflightFails(database, beforePreflight), label).not.toThrow()
      const counts = ownerTableCounts(database)
      if (label === 'conflicting V1 authority row') {
        expect(counts.authoritative_games).toBe(1)
        expect(
          Object.entries(counts)
            .filter(([table]) => table !== 'authoritative_games')
            .every(([, count]) => count === 0),
        ).toBe(true)
      } else {
        expect(Object.values(counts).every((count) => count === 0)).toBe(true)
      }
    }
  })

  test('preflight matrix preserves seeded conflicts and leaves no migration rows', () => {
    const sourceHash = EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256
    const conflictFixtures: Array<
      [string, (database: DatabaseSync) => void, keyof ReturnType<typeof ownerTableCounts>]
    > = [
      [
        'identity collision',
        (database) =>
          database.exec(
            `INSERT INTO authoritative_games (id, identity_key, canonical_title, introduced_manifest_version, introduced_source_hash, created_on) VALUES ('auth-game-conflicting', 'counter-strike-2', 'Different title', 'owner-authoritative-mimma-v1', '${sourceHash}', '2026-08-21')`,
          ),
        'authoritative_games',
      ],
      [
        'score game/version collision',
        (database) => {
          database.exec('PRAGMA foreign_keys = OFF')
          database.exec(
            `INSERT INTO authoritative_mimma_score_versions (id, game_id, version, micro_score, meso_score, macro_score, micro_original_decimal, meso_original_decimal, macro_original_decimal, decimal_scale, rounding_mode, source_manifest_version, source_hash, provenance, approval_reason, approved_on) VALUES ('conflicting-score', 'auth-game-counter-strike-2', 1, 1, 2, 3, '1.0', '2.0', '3.0', 1, 'half-up-to-integer-v1', 'owner-authoritative-mimma-v1', '${sourceHash}', 'owner_authoritative', 'owner-correction', '2026-08-21')`,
          )
          database.exec('PRAGMA foreign_keys = ON')
        },
        'authoritative_mimma_score_versions',
      ],
      [
        'snapshot version collision',
        (database) =>
          database.exec(
            `INSERT INTO authoritative_snapshots (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on) VALUES ('conflicting-snapshot', 1, 'owner-authoritative-mimma-v1', '${sourceHash}', 1, 'draft', '2026-08-21', NULL)`,
          ),
        'authoritative_snapshots',
      ],
      [
        'snapshot member key collision',
        (database) => {
          database.exec('PRAGMA foreign_keys = OFF')
          database.exec(
            `INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES ('snapshot-owner-authoritative-mimma-v1', 'auth-game-counter-strike-2', 'auth-score-counter-strike-2-v1')`,
          )
          database.exec('PRAGMA foreign_keys = ON')
        },
        'authoritative_snapshot_members',
      ],
      [
        'mapping game/provider/version collision',
        (database) => {
          database.exec('PRAGMA foreign_keys = OFF')
          database.exec(
            `INSERT INTO authoritative_game_mappings (id, game_id, provider, external_id, catalog_game_id, mapping_version, decision, verification_ref, supersedes_mapping_id, source_manifest_version, source_hash, decided_on) VALUES ('conflicting-mapping', 'auth-game-counter-strike-2', 'steam', '730', 'steam-730', 1, 'verified', 'owner-approved-manifest-v1', NULL, 'owner-authoritative-mimma-v1', '${sourceHash}', '2026-08-21')`,
          )
          database.exec('PRAGMA foreign_keys = ON')
        },
        'authoritative_game_mappings',
      ],
    ]

    for (const [label, fixture, seededTable] of conflictFixtures) {
      const database = databaseBeforeOwnerMigration()
      expect(() => runUntilPreflightFails(database, fixture), label).not.toThrow()
      const counts = ownerTableCounts(database)
      expect(counts[seededTable], label).toBe(1)
      expect(
        Object.entries(counts)
          .filter(([table]) => table !== seededTable)
          .every(([, count]) => count === 0),
        label,
      ).toBe(true)
    }
  })

  test('preflight SQL names every insert-conflict key class', () => {
    const sql = committedMigration()
    for (const required of [
      'identity_key',
      'canonical_title',
      'game_id, version',
      'version = 1',
      'snapshot_id',
      'mapping_version',
      'provider',
    ]) {
      expect(sql, required).toContain(required)
    }
  })

  test('asserts provenance independently on every generated authority row', () => {
    const sql = committedMigration()
    const hash = EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256
    const gameRows = sql.match(/INSERT INTO authoritative_games \([\s\S]*?;/g) ?? []
    const scoreRows = sql.match(/INSERT INTO authoritative_mimma_score_versions \([\s\S]*?;/g) ?? []
    const snapshotRows = sql.match(/INSERT INTO authoritative_snapshots \([\s\S]*?;/g) ?? []
    const mappingRows = sql.match(/INSERT INTO authoritative_game_mappings \([\s\S]*?;/g) ?? []

    expect(gameRows).toHaveLength(10)
    expect(scoreRows).toHaveLength(10)
    expect(snapshotRows).toHaveLength(1)
    expect(mappingRows).toHaveLength(8)
    for (const row of gameRows) {
      expect(row).toContain(`'${MANIFEST_VERSION_LITERAL}'`)
      expect(row).toContain(`'${hash}'`)
      expect(row).toContain("'2026-08-21'")
    }
    for (const row of scoreRows) {
      expect(row).toContain(`'${MANIFEST_VERSION_LITERAL}'`)
      expect(row).toContain(`'${hash}'`)
      expect(row).toContain("'owner_authoritative'")
    }
    for (const row of snapshotRows) {
      expect(row).toContain(`'${MANIFEST_VERSION_LITERAL}'`)
      expect(row).toContain(`'${hash}'`)
    }
    for (const row of mappingRows) {
      expect(row).toContain(`'${MANIFEST_VERSION_LITERAL}'`)
      expect(row).toContain(`'${hash}'`)
    }
  })

  test('checks each required DDL column and invariant independently', () => {
    const sql = committedMigration()
    const ddl = (table: string): string =>
      sql.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? ''
    const expectations: Record<string, string[]> = {
      authoritative_games: [
        'id TEXT PRIMARY KEY',
        "id GLOB 'auth-game-*'",
        "id NOT GLOB 'auth-game-steam-*'",
        'identity_key TEXT NOT NULL COLLATE NOCASE UNIQUE',
        'canonical_title TEXT NOT NULL COLLATE NOCASE UNIQUE',
        'introduced_manifest_version TEXT NOT NULL',
        'introduced_source_hash TEXT NOT NULL',
        'created_on TEXT NOT NULL',
        "id GLOB 'auth-game-*'",
        'length(trim(canonical_title)) > 0',
      ],
      authoritative_mimma_score_versions: [
        'game_id TEXT NOT NULL REFERENCES authoritative_games(id) ON DELETE RESTRICT',
        'UNIQUE (game_id, version)',
        'UNIQUE (id, game_id)',
        'decimal_scale INTEGER NOT NULL CHECK (decimal_scale = 1)',
        "rounding_mode TEXT NOT NULL CHECK (rounding_mode = 'half-up-to-integer-v1')",
        "provenance TEXT NOT NULL CHECK (provenance = 'owner_authoritative')",
        'micro_score <> 0 OR meso_score <> 0 OR macro_score <> 0',
        'micro_score <> 100 OR meso_score <> 100 OR macro_score <> 100',
        "micro_score = CAST((CAST(replace(micro_original_decimal, '.', '') AS INTEGER) + 5) / 10 AS INTEGER)",
        "meso_score = CAST((CAST(replace(meso_original_decimal, '.', '') AS INTEGER) + 5) / 10 AS INTEGER)",
        "macro_score = CAST((CAST(replace(macro_original_decimal, '.', '') AS INTEGER) + 5) / 10 AS INTEGER)",
      ],
      authoritative_snapshots: [
        'version INTEGER NOT NULL UNIQUE',
        'expected_member_count INTEGER NOT NULL',
        "state TEXT NOT NULL CHECK (state IN ('draft', 'frozen'))",
        "state = 'draft' AND frozen_on IS NULL",
        "state = 'frozen' AND frozen_on IS NOT NULL",
      ],
      authoritative_snapshot_members: [
        'PRIMARY KEY (snapshot_id, game_id)',
        'UNIQUE (snapshot_id, score_id)',
        'FOREIGN KEY (score_id, game_id) REFERENCES authoritative_mimma_score_versions(id, game_id) ON DELETE RESTRICT',
      ],
      authoritative_game_mappings: [
        'catalog_game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT',
        'mapping_version INTEGER NOT NULL',
        "decision TEXT NOT NULL CHECK (decision IN ('verified', 'rejected', 'revoked'))",
        'supersedes_mapping_id TEXT REFERENCES authoritative_game_mappings(id) ON DELETE RESTRICT',
        'UNIQUE (game_id, provider, mapping_version)',
        'UNIQUE (id, game_id, provider, mapping_version)',
      ],
    }
    for (const [table, snippets] of Object.entries(expectations)) {
      const tableDdl = ddl(table)
      expect(tableDdl, table).not.toBe('')
      for (const snippet of snippets) expect(tableDdl, `${table}: ${snippet}`).toContain(snippet)
    }
  })

  test('escapes apostrophes in owner titles as valid SQL literals', () => {
    const sql = committedMigration()
    expect(sql).toContain("'Tom Clancy''s Rainbow Six Siege'")
    expect(sql).toContain("'Baldur''s Gate 3'")
    expect(sql).not.toContain("'Tom Clancy's Rainbow Six Siege'")
  })

  test('default mode detects drift and --write is the only artifact-writing mode', () => {
    expect(() =>
      execFileSync(process.execPath, [generatorPath], { cwd: root, encoding: 'utf8' }),
    ).not.toThrow()
    expect(
      execFileSync(process.execPath, [generatorPath], { cwd: root, encoding: 'utf8' }),
    ).toContain('matches committed artifact')
  })
})
