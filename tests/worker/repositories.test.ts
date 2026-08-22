import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { findCatalogGames, findGameBySlug } from '../../src/worker/repositories/games.js'
import { getCatalogReleaseMetadata } from '../../src/worker/repositories/catalog-release.js'
import {
  findScoredSimilarityCandidates,
  getFrozenAuthoritativeSnapshot,
  getMappedAuthoritativeScoreFromLatestSnapshot,
} from '../../src/worker/repositories/authoritative-scores.js'
import { applyBetaMigrations, resetBetaDatabase } from './apply-beta-migrations.js'

const sourceHash = 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'

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

async function insertMapping(
  id: string,
  gameId: string,
  externalId: string,
  catalogGameId: string,
  version: number,
  decision: 'verified' | 'rejected' | 'revoked',
  supersedes: string,
): Promise<void> {
  await env.NEED_GAMES_DB.prepare(
    `INSERT INTO authoritative_game_mappings (
      id, game_id, provider, external_id, catalog_game_id, mapping_version,
      decision, verification_ref, supersedes_mapping_id, source_manifest_version,
      source_hash, decided_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      gameId,
      'steam',
      externalId,
      catalogGameId,
      version,
      decision,
      'owner-approved-test',
      supersedes,
      'owner-authoritative-mimma-v1',
      sourceHash,
      '2026-08-21',
    )
    .run()
}

describe('catalog repositories', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  beforeEach(async () => {
    await resetBetaDatabase(env.NEED_GAMES_DB)
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

  test('reads exact score and provenance through the latest frozen snapshot and mapping', async () => {
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-730'),
    ).resolves.toEqual({
      gameId: 'auth-game-counter-strike-2',
      snapshotId: 'snapshot-owner-authoritative-mimma-v1',
      snapshotVersion: 1,
      scoreId: 'auth-score-counter-strike-2-v1',
      scoreVersion: 1,
      macroScore: 80,
      mesoScore: 65,
      microScore: 100,
    })
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1085660'),
    ).resolves.toBeNull()
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-284160'),
    ).resolves.toBeNull()
  })

  test('reads all ten frozen members including intentionally unmapped identities', async () => {
    const snapshot = await getFrozenAuthoritativeSnapshot(env.NEED_GAMES_DB)
    expect(snapshot?.snapshotId).toBe('snapshot-owner-authoritative-mimma-v1')
    expect(snapshot?.snapshotVersion).toBe(1)
    expect(snapshot?.members.map((member) => member.identityKey)).toEqual([
      'apex-legends',
      'baldurs-gate-3',
      'counter-strike-2',
      'elden-ring',
      'league-of-legends',
      'marvel-rivals',
      'monster-hunter-wilds',
      'palworld',
      'rainbow-six-siege',
      'valorant',
    ])
    expect(snapshot?.members).toEqual([
      {
        gameId: 'auth-game-apex-legends',
        identityKey: 'apex-legends',
        canonicalTitle: 'Apex Legends',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-apex-legends-v1',
        scoreVersion: 1,
        microScore: 80,
        mesoScore: 80,
        macroScore: 100,
        catalogGameId: 'steam-1172470',
        steamAppId: 1172470,
      },
      {
        gameId: 'auth-game-baldurs-gate-3',
        identityKey: 'baldurs-gate-3',
        canonicalTitle: "Baldur's Gate 3",
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-baldurs-gate-3-v1',
        scoreVersion: 1,
        microScore: 20,
        mesoScore: 20,
        macroScore: 100,
        catalogGameId: 'steam-1086940',
        steamAppId: 1086940,
      },
      {
        gameId: 'auth-game-counter-strike-2',
        identityKey: 'counter-strike-2',
        canonicalTitle: 'Counter-Strike 2',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-counter-strike-2-v1',
        scoreVersion: 1,
        microScore: 100,
        mesoScore: 65,
        macroScore: 80,
        catalogGameId: 'steam-730',
        steamAppId: 730,
      },
      {
        gameId: 'auth-game-elden-ring',
        identityKey: 'elden-ring',
        canonicalTitle: 'ELDEN RING',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-elden-ring-v1',
        scoreVersion: 1,
        microScore: 80,
        mesoScore: 100,
        macroScore: 40,
        catalogGameId: 'steam-1245620',
        steamAppId: 1245620,
      },
      {
        gameId: 'auth-game-league-of-legends',
        identityKey: 'league-of-legends',
        canonicalTitle: 'League of Legends',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-league-of-legends-v1',
        scoreVersion: 1,
        microScore: 69,
        mesoScore: 77,
        macroScore: 100,
        catalogGameId: null,
        steamAppId: null,
      },
      {
        gameId: 'auth-game-marvel-rivals',
        identityKey: 'marvel-rivals',
        canonicalTitle: 'Marvel Rivals',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-marvel-rivals-v1',
        scoreVersion: 1,
        microScore: 80,
        mesoScore: 60,
        macroScore: 80,
        catalogGameId: 'steam-2767030',
        steamAppId: 2767030,
      },
      {
        gameId: 'auth-game-monster-hunter-wilds',
        identityKey: 'monster-hunter-wilds',
        canonicalTitle: 'Monster Hunter Wilds',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-monster-hunter-wilds-v1',
        scoreVersion: 1,
        microScore: 80,
        mesoScore: 40,
        macroScore: 60,
        catalogGameId: 'steam-2246340',
        steamAppId: 2246340,
      },
      {
        gameId: 'auth-game-palworld',
        identityKey: 'palworld',
        canonicalTitle: 'Palworld',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-palworld-v1',
        scoreVersion: 1,
        microScore: 40,
        mesoScore: 20,
        macroScore: 70,
        catalogGameId: 'steam-1623730',
        steamAppId: 1623730,
      },
      {
        gameId: 'auth-game-rainbow-six-siege',
        identityKey: 'rainbow-six-siege',
        canonicalTitle: "Tom Clancy's Rainbow Six Siege",
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-rainbow-six-siege-v1',
        scoreVersion: 1,
        microScore: 80,
        mesoScore: 60,
        macroScore: 80,
        catalogGameId: 'steam-359550',
        steamAppId: 359550,
      },
      {
        gameId: 'auth-game-valorant',
        identityKey: 'valorant',
        canonicalTitle: 'Valorant',
        snapshotId: 'snapshot-owner-authoritative-mimma-v1',
        snapshotVersion: 1,
        scoreId: 'auth-score-valorant-v1',
        scoreVersion: 1,
        microScore: 100,
        mesoScore: 73,
        macroScore: 80,
        catalogGameId: null,
        steamAppId: null,
      },
    ])
  })

  test('uses the V1 snapshot score rather than a later appended score version', async () => {
    await insertScoreVersion('auth-score-palworld-v2', 'auth-game-palworld', 2, 50, 60, 70)
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1623730'),
    ).resolves.toMatchObject({ scoreId: 'auth-score-palworld-v1', scoreVersion: 1, microScore: 40 })
  })

  test('lets a later frozen snapshot select a new score without rewriting V1', async () => {
    await insertScoreVersion(
      'auth-score-counter-strike-2-v2',
      'auth-game-counter-strike-2',
      2,
      55,
      66,
      77,
    )
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_snapshots
       (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(
        'snapshot-owner-authoritative-mimma-v2',
        2,
        'owner-authoritative-mimma-v2',
        sourceHash,
        10,
        'draft',
        '2026-08-21',
      )
      .run()
    const members = [
      ['auth-game-counter-strike-2', 'auth-score-counter-strike-2-v2'],
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
    for (const [gameId, scoreId] of members) {
      await env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind('snapshot-owner-authoritative-mimma-v2', gameId, scoreId)
        .run()
    }
    await env.NEED_GAMES_DB.prepare(
      'UPDATE authoritative_snapshots SET state = ?, frozen_on = ? WHERE id = ?',
    )
      .bind('frozen', '2026-08-21', 'snapshot-owner-authoritative-mimma-v2')
      .run()

    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-730'),
    ).resolves.toMatchObject({
      snapshotId: 'snapshot-owner-authoritative-mimma-v2',
      snapshotVersion: 2,
      scoreId: 'auth-score-counter-strike-2-v2',
      scoreVersion: 2,
      microScore: 55,
    })
    const v1 = await env.NEED_GAMES_DB.prepare(
      'SELECT score_id FROM authoritative_snapshot_members WHERE snapshot_id = ? AND game_id = ?',
    )
      .bind('snapshot-owner-authoritative-mimma-v1', 'auth-game-counter-strike-2')
      .first<{ score_id: string }>()
    expect(v1?.score_id).toBe('auth-score-counter-strike-2-v1')
  })

  test('finds mapped candidates from the frozen snapshot in deterministic catalog order', async () => {
    const candidates = await findScoredSimilarityCandidates(env.NEED_GAMES_DB, 'steam-730')

    expect(candidates).toEqual([
      expect.objectContaining({
        gameId: 'auth-game-apex-legends',
        title: 'Apex Legends',
        steamAppId: 1172470,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-baldurs-gate-3',
        title: "Baldur's Gate 3",
        steamAppId: 1086940,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-elden-ring',
        title: 'ELDEN RING',
        steamAppId: 1245620,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-marvel-rivals',
        title: 'Marvel Rivals',
        steamAppId: 2767030,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-monster-hunter-wilds',
        title: 'Monster Hunter Wilds',
        steamAppId: 2246340,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-palworld',
        title: 'Palworld',
        steamAppId: 1623730,
        scoreVersion: 1,
      }),
      expect.objectContaining({
        gameId: 'auth-game-rainbow-six-siege',
        title: "Tom Clancy's Rainbow Six Siege",
        steamAppId: 359550,
        scoreVersion: 1,
      }),
    ])
  })

  test('treats a latest rejected mapping as unmapped without deleting its history', async () => {
    await insertMapping(
      'auth-map-steam-palworld-v2',
      'auth-game-palworld',
      '1623730',
      'steam-1623730',
      2,
      'revoked',
      'auth-map-steam-palworld-v1',
    )
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1623730'),
    ).resolves.toBeNull()
    await expect(
      env.NEED_GAMES_DB.prepare(
        'SELECT id, decision FROM authoritative_game_mappings WHERE game_id = ? ORDER BY mapping_version',
      )
        .bind('auth-game-palworld')
        .all(),
    ).resolves.toMatchObject({
      results: [
        { id: 'auth-map-steam-palworld-v1', decision: 'verified' },
        { id: 'auth-map-steam-palworld-v2', decision: 'revoked' },
      ],
    })
  })

  test('fails closed when latest verified mappings collide on provider identity', async () => {
    await insertMapping(
      'auth-map-steam-palworld-v2',
      'auth-game-palworld',
      '1623730',
      'steam-1623730',
      2,
      'revoked',
      'auth-map-steam-palworld-v1',
    )
    await insertMapping(
      'auth-map-steam-palworld-v3',
      'auth-game-palworld',
      '730',
      'steam-730',
      3,
      'verified',
      'auth-map-steam-palworld-v2',
    )
    await insertMapping(
      'auth-map-steam-marvel-rivals-v2',
      'auth-game-marvel-rivals',
      '730',
      'steam-730',
      2,
      'verified',
      'auth-map-steam-marvel-rivals-v1',
    )
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-730'),
    ).resolves.toBeNull()
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1623730'),
    ).resolves.toBeNull()
    await expect(
      findScoredSimilarityCandidates(env.NEED_GAMES_DB, 'steam-730'),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ gameId: 'auth-game-palworld' })]),
    )
  })
})
