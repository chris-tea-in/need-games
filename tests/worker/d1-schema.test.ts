import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import ownerAuthoritativeMigration from '../../migrations/0005_owner_authoritative_mimma_v1.sql?raw'
import {
  applyMigrationWithInjectedFailure,
  prepareMigrationStatements,
  resetBetaDatabase,
} from './apply-beta-migrations.js'

const sourceHash = 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'
const approvedSteamAppIds = [
  730, 1623730, 2767030, 1172470, 359550, 1086940, 1085660, 2246340, 1245620, 284160,
]

async function insertScoreVersion(
  id: string,
  gameId: string,
  version: number,
  micro: number,
  meso: number,
  macro: number,
): Promise<void> {
  await env.NEED_GAMES_DB.prepare(
    `INSERT INTO authoritative_mimma_score_versions (
      id, game_id, version, micro_score, meso_score, macro_score,
      micro_original_decimal, meso_original_decimal, macro_original_decimal,
      decimal_scale, rounding_mode, source_manifest_version, source_hash,
      provenance, approval_reason, approved_on
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      gameId,
      version,
      micro,
      meso,
      macro,
      `${micro}.0`,
      `${meso}.0`,
      `${macro}.0`,
      1,
      'half-up-to-integer-v1',
      'owner-authoritative-mimma-v1',
      sourceHash,
      'owner_authoritative',
      'owner-correction',
      '2026-08-21',
    )
    .run()
}

describe('closed beta D1 schema', () => {
  beforeAll(async () => {
    await resetBetaDatabase(env.NEED_GAMES_DB)
  })

  test('seeds the exact approved catalog and release versions without legacy scores', async () => {
    const games = await env.NEED_GAMES_DB.prepare(
      'SELECT steam_app_id FROM games ORDER BY steam_app_id ASC',
    ).all<{ steam_app_id: number }>()
    const scores = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_scores',
    ).first<{ count: number }>()
    const release = await env.NEED_GAMES_DB.prepare(
      'SELECT dataset_version, schema_version FROM catalog_release_metadata',
    ).first<{ dataset_version: string; schema_version: number }>()

    expect(games.results.map((game) => game.steam_app_id)).toEqual(
      [...approvedSteamAppIds].sort((left, right) => left - right),
    )
    expect(scores?.count).toBe(0)
    expect(release).toEqual({ dataset_version: 'catalog-release-v1', schema_version: 1 })
  })

  test('preserves the 62-row platform-neutral Surnex sample and its immutable boundary', async () => {
    const counts = await env.NEED_GAMES_DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(micro_score = 100) AS pure_micro,
         SUM(meso_score = 100) AS pure_meso,
         SUM(macro_score = 100) AS pure_macro
       FROM authoritative_mimma_seeds`,
    ).first<{ total: number; pure_micro: number; pure_meso: number; pure_macro: number }>()
    expect(counts).toEqual({ total: 62, pure_micro: 24, pure_meso: 17, pure_macro: 21 })

    const governance = await env.NEED_GAMES_DB.prepare(
      `SELECT COUNT(*) AS count
       FROM authoritative_mimma_seeds
       WHERE provenance <> 'authoritative_sample_seed'
          OR dataset_version <> 'authoritative-mimma-seed-v1'`,
    ).first<{ count: number }>()
    expect(governance?.count).toBe(0)

    const columns = await env.NEED_GAMES_DB.prepare(
      'PRAGMA table_info(authoritative_mimma_seeds)',
    ).all<{ name: string }>()
    expect(columns.results.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(['zone', 'label', 'game_id', 'steam_app_id']),
    )
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_mimma_seeds (
          id, conceptual_name, micro_score, meso_score, macro_score,
          provenance, dataset_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'invalid-seed',
          'Invalid Seed',
          80,
          0,
          0,
          'authoritative_sample_seed',
          'authoritative-mimma-seed-v1',
          '2026-08-18T20:02:44Z',
        )
        .run(),
    ).rejects.toThrow()
    await expect(
      env.NEED_GAMES_DB.prepare(
        'UPDATE authoritative_mimma_seeds SET conceptual_name = ? WHERE id = ?',
      )
        .bind('Changed', 'authoritative-mimma-seed-v1-aimlabs')
        .run(),
    ).rejects.toThrow()
    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_mimma_seeds WHERE id = ?')
        .bind('authoritative-mimma-seed-v1-aimlabs')
        .run(),
    ).rejects.toThrow()
  })

  test('stores the exact ten-game frozen snapshot and eight mappings', async () => {
    const counts = await env.NEED_GAMES_DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM authoritative_games) AS games,
         (SELECT COUNT(*) FROM authoritative_mimma_score_versions) AS scores,
         (SELECT COUNT(*) FROM authoritative_snapshots WHERE state = 'frozen') AS snapshots,
         (SELECT COUNT(*) FROM authoritative_snapshot_members) AS members,
         (SELECT COUNT(*) FROM authoritative_game_mappings) AS mappings,
         (SELECT COUNT(*) FROM authoritative_mimma_scores) AS legacy_scores`,
    ).first<{
      games: number
      scores: number
      snapshots: number
      members: number
      mappings: number
      legacy_scores: number
    }>()
    expect(counts).toEqual({
      games: 10,
      scores: 10,
      snapshots: 1,
      members: 10,
      mappings: 8,
      legacy_scores: 0,
    })

    const rows = await env.NEED_GAMES_DB.prepare(
      `SELECT games.identity_key, scores.micro_score, scores.meso_score, scores.macro_score,
              scores.micro_original_decimal, scores.meso_original_decimal, scores.macro_original_decimal
       FROM authoritative_snapshot_members AS members
       JOIN authoritative_games AS games ON games.id = members.game_id
       JOIN authoritative_mimma_score_versions AS scores
         ON scores.id = members.score_id AND scores.game_id = members.game_id
       WHERE members.snapshot_id = ?
       ORDER BY games.identity_key`,
    )
      .bind('snapshot-owner-authoritative-mimma-v1')
      .all<Record<string, string | number>>()
    expect(rows.results).toEqual([
      {
        identity_key: 'apex-legends',
        micro_score: 80,
        meso_score: 80,
        macro_score: 100,
        micro_original_decimal: '80.0',
        meso_original_decimal: '80.0',
        macro_original_decimal: '100.0',
      },
      {
        identity_key: 'baldurs-gate-3',
        micro_score: 20,
        meso_score: 20,
        macro_score: 100,
        micro_original_decimal: '20.0',
        meso_original_decimal: '20.0',
        macro_original_decimal: '100.0',
      },
      {
        identity_key: 'counter-strike-2',
        micro_score: 100,
        meso_score: 65,
        macro_score: 80,
        micro_original_decimal: '100.0',
        meso_original_decimal: '65.0',
        macro_original_decimal: '80.0',
      },
      {
        identity_key: 'elden-ring',
        micro_score: 80,
        meso_score: 100,
        macro_score: 40,
        micro_original_decimal: '80.0',
        meso_original_decimal: '100.0',
        macro_original_decimal: '40.0',
      },
      {
        identity_key: 'league-of-legends',
        micro_score: 69,
        meso_score: 77,
        macro_score: 100,
        micro_original_decimal: '68.6',
        meso_original_decimal: '77.1',
        macro_original_decimal: '100.0',
      },
      {
        identity_key: 'marvel-rivals',
        micro_score: 80,
        meso_score: 60,
        macro_score: 80,
        micro_original_decimal: '80.0',
        meso_original_decimal: '60.0',
        macro_original_decimal: '80.0',
      },
      {
        identity_key: 'monster-hunter-wilds',
        micro_score: 80,
        meso_score: 40,
        macro_score: 60,
        micro_original_decimal: '80.0',
        meso_original_decimal: '40.0',
        macro_original_decimal: '60.0',
      },
      {
        identity_key: 'palworld',
        micro_score: 40,
        meso_score: 20,
        macro_score: 70,
        micro_original_decimal: '40.0',
        meso_original_decimal: '20.0',
        macro_original_decimal: '70.0',
      },
      {
        identity_key: 'rainbow-six-siege',
        micro_score: 80,
        meso_score: 60,
        macro_score: 80,
        micro_original_decimal: '80.0',
        meso_original_decimal: '60.0',
        macro_original_decimal: '80.0',
      },
      {
        identity_key: 'valorant',
        micro_score: 100,
        meso_score: 73,
        macro_score: 80,
        micro_original_decimal: '100.0',
        meso_original_decimal: '73.3',
        macro_original_decimal: '80.0',
      },
    ])

    const unmapped = await env.NEED_GAMES_DB.prepare(
      `SELECT games.identity_key
       FROM authoritative_games AS games
       JOIN authoritative_snapshot_members AS members ON members.game_id = games.id
       LEFT JOIN authoritative_game_mappings AS mappings ON mappings.game_id = games.id
       WHERE members.snapshot_id = ? AND mappings.id IS NULL
       ORDER BY games.identity_key`,
    )
      .bind('snapshot-owner-authoritative-mimma-v1')
      .all<{ identity_key: string }>()
    expect(unmapped.results).toEqual([
      { identity_key: 'league-of-legends' },
      { identity_key: 'valorant' },
    ])
    await expect(
      env.NEED_GAMES_DB.prepare('SELECT 1 FROM authoritative_games WHERE identity_key IN (?, ?)')
        .bind('destiny-2', 'beamng-drive')
        .all(),
    ).resolves.toMatchObject({ results: [] })
  })

  test('rejects immutable authority, score, snapshot, member, and mapping changes', async () => {
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_games
       (id, identity_key, canonical_title, introduced_manifest_version, introduced_source_hash, created_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'auth-game-immutable-test',
        'immutable-test',
        'Immutable Test',
        'test',
        sourceHash,
        '2026-08-21',
      )
      .run()
    await insertScoreVersion(
      'auth-score-immutable-test-v1',
      'auth-game-immutable-test',
      1,
      10,
      20,
      30,
    )
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_snapshots
       (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
      .bind('snapshot-immutable-test', 2, 'test', sourceHash, 1, 'draft', '2026-08-21')
      .run()

    await expect(
      env.NEED_GAMES_DB.prepare('UPDATE authoritative_games SET canonical_title = ? WHERE id = ?')
        .bind('Changed', 'auth-game-counter-strike-2')
        .run(),
    ).rejects.toThrow('authoritative games are immutable')
    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_games WHERE id = ?')
        .bind('auth-game-immutable-test')
        .run(),
    ).rejects.toThrow('authoritative games cannot be deleted')
    await expect(
      env.NEED_GAMES_DB.prepare(
        'UPDATE authoritative_mimma_score_versions SET micro_score = ? WHERE id = ?',
      )
        .bind(1, 'auth-score-counter-strike-2-v1')
        .run(),
    ).rejects.toThrow('authoritative score versions are immutable')
    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_mimma_score_versions WHERE id = ?')
        .bind('auth-score-immutable-test-v1')
        .run(),
    ).rejects.toThrow('authoritative score versions cannot be deleted')
    await expect(
      env.NEED_GAMES_DB.prepare('UPDATE authoritative_snapshots SET version = ? WHERE id = ?')
        .bind(2, 'snapshot-owner-authoritative-mimma-v1')
        .run(),
    ).rejects.toThrow('authoritative snapshots are immutable')
    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_snapshots WHERE id = ?')
        .bind('snapshot-immutable-test')
        .run(),
    ).rejects.toThrow('authoritative snapshots cannot be deleted')
    await expect(
      env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind(
          'snapshot-owner-authoritative-mimma-v1',
          'auth-game-counter-strike-2',
          'auth-score-counter-strike-2-v1',
        )
        .run(),
    ).rejects.toThrow('snapshot members can only be inserted into a draft')
    await expect(
      env.NEED_GAMES_DB.prepare(
        'UPDATE authoritative_snapshot_members SET score_id = ? WHERE snapshot_id = ? AND game_id = ?',
      )
        .bind(
          'auth-score-palworld-v1',
          'snapshot-owner-authoritative-mimma-v1',
          'auth-game-counter-strike-2',
        )
        .run(),
    ).rejects.toThrow('authoritative snapshot members are immutable')
    await expect(
      env.NEED_GAMES_DB.prepare(
        'DELETE FROM authoritative_snapshot_members WHERE snapshot_id = ? AND game_id = ?',
      )
        .bind('snapshot-owner-authoritative-mimma-v1', 'auth-game-counter-strike-2')
        .run(),
    ).rejects.toThrow('authoritative snapshot members cannot be deleted')
    await expect(
      env.NEED_GAMES_DB.prepare('UPDATE authoritative_game_mappings SET decision = ? WHERE id = ?')
        .bind('revoked', 'auth-map-steam-counter-strike-2-v1')
        .run(),
    ).rejects.toThrow('authoritative mapping history is immutable')
    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_game_mappings WHERE id = ?')
        .bind('auth-map-steam-counter-strike-2-v1')
        .run(),
    ).rejects.toThrow('authoritative mapping history cannot be deleted')
  })

  test('rejects invalid vectors, duplicates, mismatched membership, and mapping identity', async () => {
    await expect(
      insertScoreVersion('invalid-zero-score', 'auth-game-counter-strike-2', 2, 0, 0, 0),
    ).rejects.toThrow()
    await expect(
      insertScoreVersion('invalid-all-score', 'auth-game-counter-strike-2', 2, 100, 100, 100),
    ).rejects.toThrow()
    await insertScoreVersion(
      'auth-score-counter-strike-2-v2',
      'auth-game-counter-strike-2',
      2,
      10,
      20,
      30,
    )
    await expect(
      insertScoreVersion('duplicate-score-version', 'auth-game-counter-strike-2', 2, 11, 22, 33),
    ).rejects.toThrow()
    await expect(
      env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind(
          'snapshot-owner-authoritative-mimma-v1',
          'auth-game-counter-strike-2',
          'auth-score-palworld-v1',
        )
        .run(),
    ).rejects.toThrow()
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_game_mappings (
          id, game_id, provider, external_id, catalog_game_id, mapping_version,
          decision, verification_ref, supersedes_mapping_id, source_manifest_version,
          source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'invalid-steam-mapping',
          'auth-game-league-of-legends',
          'steam',
          '731',
          'steam-730',
          1,
          'verified',
          'test',
          null,
          'owner-authoritative-mimma-v1',
          sourceHash,
          '2026-08-21',
        )
        .run(),
    ).rejects.toThrow()
  })

  test('only freezes complete draft snapshots and enforces contiguous mapping supersession', async () => {
    const members = [
      ['auth-game-counter-strike-2', 'auth-score-counter-strike-2-v1'],
      ['auth-game-palworld', 'auth-score-palworld-v1'],
      ['auth-game-marvel-rivals', 'auth-score-marvel-rivals-v1'],
      ['auth-game-apex-legends', 'auth-score-apex-legends-v1'],
      ['auth-game-rainbow-six-siege', 'auth-score-rainbow-six-siege-v1'],
      ['auth-game-baldurs-gate-3', 'auth-score-baldurs-gate-3-v1'],
      ['auth-game-monster-hunter-wilds', 'auth-score-monster-hunter-wilds-v1'],
      ['auth-game-elden-ring', 'auth-score-elden-ring-v1'],
      ['auth-game-league-of-legends', 'auth-score-league-of-legends-v1'],
      ['auth-game-valorant', 'auth-score-valorant-v1'],
    ]
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_snapshots
       (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
      .bind('snapshot-draft-nine', 3, 'test', sourceHash, 10, 'draft', '2026-08-21')
      .run()
    for (const [gameId, scoreId] of members.slice(0, 9)) {
      await env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind('snapshot-draft-nine', gameId, scoreId)
        .run()
    }
    await expect(
      env.NEED_GAMES_DB.prepare(
        'UPDATE authoritative_snapshots SET state = ?, frozen_on = ? WHERE id = ?',
      )
        .bind('frozen', '2026-08-21', 'snapshot-draft-nine')
        .run(),
    ).rejects.toThrow('snapshot freeze requires complete membership')

    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_games
       (id, identity_key, canonical_title, introduced_manifest_version, introduced_source_hash, created_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind('auth-game-test-extra', 'test-extra', 'Test Extra', 'test', sourceHash, '2026-08-21')
      .run()
    await insertScoreVersion('auth-score-test-extra-v1', 'auth-game-test-extra', 1, 10, 20, 30)
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_snapshots
       (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
      .bind('snapshot-draft-eleven', 4, 'test', sourceHash, 10, 'draft', '2026-08-21')
      .run()
    for (const [gameId, scoreId] of members) {
      await env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind('snapshot-draft-eleven', gameId, scoreId)
        .run()
    }
    await env.NEED_GAMES_DB.prepare(
      'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
    )
      .bind('snapshot-draft-eleven', 'auth-game-test-extra', 'auth-score-test-extra-v1')
      .run()
    await expect(
      env.NEED_GAMES_DB.prepare(
        'UPDATE authoritative_snapshots SET state = ?, frozen_on = ? WHERE id = ?',
      )
        .bind('frozen', '2026-08-21', 'snapshot-draft-eleven')
        .run(),
    ).rejects.toThrow('snapshot freeze requires complete membership')

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_game_mappings (
          id, game_id, provider, external_id, catalog_game_id, mapping_version,
          decision, verification_ref, supersedes_mapping_id, source_manifest_version,
          source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'auth-map-steam-league-of-legends-v2',
          'auth-game-league-of-legends',
          'steam',
          '1085660',
          'steam-1085660',
          2,
          'verified',
          'test',
          null,
          'test',
          sourceHash,
          '2026-08-21',
        )
        .run(),
    ).rejects.toThrow('mapping versions must be contiguous')
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_game_mappings (
        id, game_id, provider, external_id, catalog_game_id, mapping_version,
        decision, verification_ref, supersedes_mapping_id, source_manifest_version,
        source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'auth-map-steam-league-of-legends-v1',
        'auth-game-league-of-legends',
        'steam',
        '1085660',
        'steam-1085660',
        1,
        'verified',
        'test',
        null,
        'test',
        sourceHash,
        '2026-08-21',
      )
      .run()
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_game_mappings (
          id, game_id, provider, external_id, catalog_game_id, mapping_version,
          decision, verification_ref, supersedes_mapping_id, source_manifest_version,
          source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'auth-map-steam-league-of-legends-v3',
          'auth-game-league-of-legends',
          'steam',
          '1085660',
          'steam-1085660',
          3,
          'verified',
          'test',
          'auth-map-steam-league-of-legends-v1',
          'test',
          sourceHash,
          '2026-08-21',
        )
        .run(),
    ).rejects.toThrow('mapping versions must be contiguous')
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_game_mappings (
          id, game_id, provider, external_id, catalog_game_id, mapping_version,
          decision, verification_ref, supersedes_mapping_id, source_manifest_version,
          source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'auth-map-steam-league-of-legends-v2-wrong-parent',
          'auth-game-league-of-legends',
          'steam',
          '1085660',
          'steam-1085660',
          2,
          'verified',
          'test',
          'auth-map-steam-counter-strike-2-v1',
          'test',
          sourceHash,
          '2026-08-21',
        )
        .run(),
    ).rejects.toThrow('mapping supersession must name the prior same-game row')
  })

  test('rolls back all 0005 tables when a later batch statement fails', async () => {
    const triggerNames = [
      'authoritative_game_mappings_insert_guard',
      'authoritative_game_mappings_prevent_delete',
      'authoritative_game_mappings_prevent_update',
      'authoritative_snapshot_members_prevent_delete',
      'authoritative_snapshot_members_prevent_update',
      'authoritative_snapshot_members_prevent_frozen_insert',
      'authoritative_snapshots_prevent_delete',
      'authoritative_snapshots_prevent_frozen_update',
      'authoritative_snapshots_freeze_guard',
      'authoritative_mimma_score_versions_prevent_delete',
      'authoritative_mimma_score_versions_prevent_update',
      'authoritative_games_prevent_delete',
      'authoritative_games_prevent_update',
    ]
    await env.NEED_GAMES_DB.batch(
      triggerNames.map((name) => env.NEED_GAMES_DB.prepare(`DROP TRIGGER ${name}`)),
    )
    await env.NEED_GAMES_DB.batch([
      env.NEED_GAMES_DB.prepare('DROP TABLE authoritative_game_mappings'),
      env.NEED_GAMES_DB.prepare('DROP TABLE authoritative_snapshot_members'),
      env.NEED_GAMES_DB.prepare('DROP TABLE authoritative_snapshots'),
      env.NEED_GAMES_DB.prepare('DROP TABLE authoritative_mimma_score_versions'),
      env.NEED_GAMES_DB.prepare('DROP TABLE authoritative_games'),
    ])

    await expect(
      applyMigrationWithInjectedFailure(env.NEED_GAMES_DB, ownerAuthoritativeMigration),
    ).rejects.toThrow()
    for (const table of [
      'authoritative_games',
      'authoritative_mimma_score_versions',
      'authoritative_snapshots',
      'authoritative_snapshot_members',
      'authoritative_game_mappings',
    ]) {
      await expect(
        env.NEED_GAMES_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first(),
      ).rejects.toThrow()
    }
    await env.NEED_GAMES_DB.batch(
      prepareMigrationStatements(env.NEED_GAMES_DB, ownerAuthoritativeMigration),
    )
  })
})
