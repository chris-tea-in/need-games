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
