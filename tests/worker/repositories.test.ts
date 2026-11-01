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
      snapshotId: 'snapshot-owner-authoritative-mimma-v2',
      snapshotVersion: 2,
      scoreId: 'auth-score-counter-strike-2-v2',
      scoreVersion: 2,
      macroScore: 60,
      mesoScore: 70,
      microScore: 80,
    })
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1085660'),
    ).resolves.toMatchObject({
      gameId: 'auth-game-destiny-2',
      scoreId: 'auth-score-destiny-2-v1',
      microScore: 60,
      mesoScore: 50,
      macroScore: 70,
    })
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-284160'),
    ).resolves.toMatchObject({ gameId: 'auth-game-beamng-drive', scoreVersion: 1, microScore: 50 })
  })

  test('reads all twelve v2 members including intentionally unmapped identities', async () => {
    const snapshot = await getFrozenAuthoritativeSnapshot(env.NEED_GAMES_DB)
    expect(snapshot?.snapshotId).toBe('snapshot-owner-authoritative-mimma-v2')
    expect(snapshot?.snapshotVersion).toBe(2)
    const expected = [
      ['apex-legends', 'Apex Legends', 2, 80, 80, 70, 1172470],
      ['baldurs-gate-3', "Baldur's Gate 3", 2, 30, 50, 85, 1086940],
      ['beamng-drive', 'BeamNG.drive', 1, 50, 30, 40, 284160],
      ['counter-strike-2', 'Counter-Strike 2', 2, 80, 70, 60, 730],
      ['destiny-2', 'Destiny 2', 1, 60, 50, 70, 1085660],
      ['elden-ring', 'ELDEN RING', 2, 75, 55, 60, 1245620],
      ['league-of-legends', 'League of Legends', 1, 69, 77, 100, null],
      ['marvel-rivals', 'Marvel Rivals', 2, 80, 60, 70, 2767030],
      ['monster-hunter-wilds', 'Monster Hunter Wilds', 2, 80, 50, 60, 2246340],
      ['palworld', 'Palworld', 2, 45, 35, 80, 1623730],
      ['rainbow-six-siege', "Tom Clancy's Rainbow Six Siege", 2, 80, 80, 80, 359550],
      ['valorant', 'Valorant', 1, 100, 73, 80, null],
    ] as const
    expect(snapshot?.members).toEqual(
      expected.map(
        ([identityKey, canonicalTitle, scoreVersion, micro, meso, macro, steamAppId]) => ({
          gameId: `auth-game-${identityKey}`,
          identityKey,
          canonicalTitle,
          snapshotId: 'snapshot-owner-authoritative-mimma-v2',
          snapshotVersion: 2,
          scoreId: `auth-score-${identityKey}-v${scoreVersion}`,
          scoreVersion,
          microScore: micro,
          mesoScore: meso,
          macroScore: macro,
          catalogGameId: steamAppId === null ? null : `steam-${steamAppId}`,
          steamAppId,
        }),
      ),
    )
  })

  test('uses the snapshot score rather than a later appended score version', async () => {
    await insertScoreVersion('auth-score-palworld-v3', 'auth-game-palworld', 3, 50, 60, 70)
    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-1623730'),
    ).resolves.toMatchObject({ scoreId: 'auth-score-palworld-v2', scoreVersion: 2, microScore: 45 })
  })

  test('lets a later frozen snapshot select a new score without rewriting earlier ones', async () => {
    await insertScoreVersion(
      'auth-score-counter-strike-2-v3',
      'auth-game-counter-strike-2',
      3,
      55,
      66,
      77,
    )
    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO authoritative_snapshots
       (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
      .bind('snapshot-test-v3', 3, 'test-v3', sourceHash, 12, 'draft', '2026-11-01')
      .run()
    const v2Members = await env.NEED_GAMES_DB.prepare(
      'SELECT game_id, score_id FROM authoritative_snapshot_members WHERE snapshot_id = ?',
    )
      .bind('snapshot-owner-authoritative-mimma-v2')
      .all<{ game_id: string; score_id: string }>()
    expect(v2Members.results).toHaveLength(12)
    for (const { game_id: gameId, score_id: scoreId } of v2Members.results) {
      await env.NEED_GAMES_DB.prepare(
        'INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (?, ?, ?)',
      )
        .bind(
          'snapshot-test-v3',
          gameId,
          gameId === 'auth-game-counter-strike-2' ? 'auth-score-counter-strike-2-v3' : scoreId,
        )
        .run()
    }
    await env.NEED_GAMES_DB.prepare(
      'UPDATE authoritative_snapshots SET state = ?, frozen_on = ? WHERE id = ?',
    )
      .bind('frozen', '2026-11-01', 'snapshot-test-v3')
      .run()

    await expect(
      getMappedAuthoritativeScoreFromLatestSnapshot(env.NEED_GAMES_DB, 'steam-730'),
    ).resolves.toMatchObject({
      snapshotId: 'snapshot-test-v3',
      snapshotVersion: 3,
      scoreId: 'auth-score-counter-strike-2-v3',
      scoreVersion: 3,
      microScore: 55,
    })
    for (const [snapshotId, scoreId] of [
      ['snapshot-owner-authoritative-mimma-v1', 'auth-score-counter-strike-2-v1'],
      ['snapshot-owner-authoritative-mimma-v2', 'auth-score-counter-strike-2-v2'],
    ]) {
      const member = await env.NEED_GAMES_DB.prepare(
        'SELECT score_id FROM authoritative_snapshot_members WHERE snapshot_id = ? AND game_id = ?',
      )
        .bind(snapshotId, 'auth-game-counter-strike-2')
        .first<{ score_id: string }>()
      expect(member?.score_id).toBe(scoreId)
    }
  })

  test('finds mapped candidates from the frozen snapshot in deterministic catalog order', async () => {
    const candidates = await findScoredSimilarityCandidates(env.NEED_GAMES_DB, 'steam-730')
    const apexTags = candidates.find((candidate) => candidate.title === 'Apex Legends')?.tags

    expect(apexTags).toContain('Battle Royale')

    expect(candidates).toEqual(
      [
        ['auth-game-apex-legends', 'Apex Legends', 1172470, 2],
        ['auth-game-baldurs-gate-3', "Baldur's Gate 3", 1086940, 2],
        ['auth-game-beamng-drive', 'BeamNG.drive', 284160, 1],
        ['auth-game-destiny-2', 'Destiny 2', 1085660, 1],
        ['auth-game-elden-ring', 'ELDEN RING', 1245620, 2],
        ['auth-game-marvel-rivals', 'Marvel Rivals', 2767030, 2],
        ['auth-game-monster-hunter-wilds', 'Monster Hunter Wilds', 2246340, 2],
        ['auth-game-palworld', 'Palworld', 1623730, 2],
        ['auth-game-rainbow-six-siege', "Tom Clancy's Rainbow Six Siege", 359550, 2],
      ].map(([gameId, title, steamAppId, scoreVersion]): unknown =>
        expect.objectContaining({ gameId, title, steamAppId, scoreVersion }),
      ),
    )
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
