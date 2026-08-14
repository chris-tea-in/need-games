import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import { findCatalogGames, findGameBySlug } from '../../src/worker/repositories/games.js'
import { getCatalogReleaseMetadata } from '../../src/worker/repositories/catalog-release.js'
import {
  findScoredSimilarityCandidates,
  getCurrentAuthoritativeScore,
} from '../../src/worker/repositories/authoritative-scores.js'
import { applyBetaMigrations } from './apply-beta-migrations.js'

describe('catalog repositories', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('searches and sorts the catalog through validated, parameterized values', async () => {
    const games = await findCatalogGames(env.NEED_GAMES_DB, {
      search: 'ring',
      sort: 'review_count_desc',
    })

    expect(games).toEqual([
      expect.objectContaining({ slug: 'elden-ring', steamAppId: 1245620, title: 'ELDEN RING' }),
    ])
    await expect(
      findCatalogGames(env.NEED_GAMES_DB, { sort: 'review_count' as never }),
    ).rejects.toThrow('Unsupported catalog sort')
  })

  test('loads one catalog detail and its release metadata', async () => {
    await expect(findGameBySlug(env.NEED_GAMES_DB, 'apex-legends')).resolves.toMatchObject({
      slug: 'apex-legends',
      steamAppId: 1172470,
      title: 'Apex Legends',
    })
    await expect(getCatalogReleaseMetadata(env.NEED_GAMES_DB)).resolves.toEqual({
      datasetVersion: 'catalog-release-v1',
      schemaVersion: 1,
    })
  })

  test('uses the highest approved score version as the similarity candidate', async () => {
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_mimma_scores (
        id, game_id, version, micro_score, meso_score, macro_score,
        provenance, approval_reason, approved_at, version_metadata_json, approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'palworld-score-v1',
        'steam-1623730',
        1,
        20,
        30,
        40,
        'owner_authoritative',
        'Initial authoritative score',
        '2026-08-14T00:00:00Z',
        '{}',
        'approved',
      )
      .run()
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_mimma_scores (
        id, game_id, version, micro_score, meso_score, macro_score,
        provenance, approval_reason, approved_at, version_metadata_json, approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        'palworld-score-v2',
        'steam-1623730',
        2,
        50,
        60,
        70,
        'owner_authoritative',
        'Corrected authoritative score',
        '2026-08-14T00:01:00Z',
        '{}',
        'approved',
      )
      .run()

    const candidates = await findScoredSimilarityCandidates(env.NEED_GAMES_DB, 'steam-730')

    expect(candidates).toEqual([
      expect.objectContaining({ gameId: 'steam-1623730', microScore: 50, version: 2 }),
    ])
    await expect(getCurrentAuthoritativeScore(env.NEED_GAMES_DB, 'steam-1623730')).resolves.toEqual(
      {
        gameId: 'steam-1623730',
        macroScore: 70,
        mesoScore: 60,
        microScore: 50,
        version: 2,
      },
    )
  })
})
