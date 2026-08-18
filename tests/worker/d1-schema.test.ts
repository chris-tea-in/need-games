import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import { applyBetaMigrations } from './apply-beta-migrations.js'

const approvedSteamAppIds = [
  730, 1623730, 2767030, 1172470, 359550, 1086940, 1085660, 2246340, 1245620, 284160,
]

describe('closed beta D1 schema', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('seeds the exact approved catalog and release versions without scores', async () => {
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

  test('seeds the exact platform-neutral authoritative sample', async () => {
    const total = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_seeds',
    ).first<{ count: number }>()
    const pureMicro = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_seeds WHERE micro_score = 100',
    ).first<{ count: number }>()
    const pureMeso = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_seeds WHERE meso_score = 100',
    ).first<{ count: number }>()
    const pureMacro = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_seeds WHERE macro_score = 100',
    ).first<{ count: number }>()

    expect(total?.count).toBe(62)
    expect(pureMicro?.count).toBe(24)
    expect(pureMeso?.count).toBe(17)
    expect(pureMacro?.count).toBe(21)
  })

  test('keeps authoritative seeds separate and immutable', async () => {
    const columns = await env.NEED_GAMES_DB.prepare(
      'PRAGMA table_info(authoritative_mimma_seeds)',
    ).all<{ name: string }>()
    expect(columns.results.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(['zone', 'label', 'game_id', 'steam_app_id']),
    )

    const governance = await env.NEED_GAMES_DB.prepare(
      `SELECT COUNT(*) AS count
       FROM authoritative_mimma_seeds
       WHERE provenance <> 'authoritative_sample_seed'
          OR dataset_version <> 'authoritative-mimma-seed-v1'`,
    ).first<{ count: number }>()
    const catalogScores = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM authoritative_mimma_scores',
    ).first<{ count: number }>()

    expect(governance?.count).toBe(0)
    expect(catalogScores?.count).toBe(0)

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

  test('rejects invalid score vectors and immutable score history changes', async () => {
    const gameId = 'steam-730'

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_mimma_scores (
          id, game_id, version, micro_score, meso_score, macro_score,
          provenance, approval_reason, approved_at, version_metadata_json, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'invalid-zero-score',
          gameId,
          1,
          0,
          0,
          0,
          'owner_authoritative',
          'Test invalid vector',
          '2026-08-14T00:00:00Z',
          '{}',
          'approved',
        )
        .run(),
    ).rejects.toThrow()

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO authoritative_mimma_scores (
          id, game_id, version, micro_score, meso_score, macro_score,
          provenance, approval_reason, approved_at, version_metadata_json, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'invalid-maximum-score',
          gameId,
          1,
          100,
          100,
          100,
          'owner_authoritative',
          'Test invalid vector',
          '2026-08-14T00:00:00Z',
          '{}',
          'approved',
        )
        .run(),
    ).rejects.toThrow()

    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_mimma_scores (
        id, game_id, version, micro_score, meso_score, macro_score,
        provenance, approval_reason, approved_at, version_metadata_json, approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'immutable-score',
        gameId,
        1,
        10,
        20,
        30,
        'owner_authoritative',
        'Test valid vector',
        '2026-08-14T00:00:00Z',
        '{}',
        'approved',
      )
      .run()

    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM authoritative_mimma_scores WHERE id = ?')
        .bind('immutable-score')
        .run(),
    ).rejects.toThrow()

    await expect(
      env.NEED_GAMES_DB.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run(),
    ).rejects.toThrow()
  })

  test('indexes supported catalog reads and current-score lookups', async () => {
    const gameIndexes = await env.NEED_GAMES_DB.prepare('PRAGMA index_list(games)').all<{
      name: string
    }>()
    const scoreIndexes = await env.NEED_GAMES_DB.prepare(
      'PRAGMA index_list(authoritative_mimma_scores)',
    ).all<{ name: string }>()

    expect(gameIndexes.results.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        'games_slug_lookup_idx',
        'games_steam_app_id_lookup_idx',
        'games_catalog_title_idx',
        'games_catalog_review_count_idx',
      ]),
    )
    expect(scoreIndexes.results.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        'authoritative_mimma_scores_game_version_idx',
        'authoritative_mimma_scores_latest_approved_idx',
      ]),
    )
  })
})
