import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  isSimilarGamesResponse,
  type SimilarGamesResponse,
} from '../../src/shared/catalog-contract.js'
import { applyBetaMigrations } from './apply-beta-migrations.js'

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) {
    throw new Error('Expected a JSON object response')
  }

  return body as Record<string, unknown>
}

function gamesIn(body: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(body.games)) {
    throw new Error('Expected a games array')
  }

  return body.games.map((game) => {
    if (typeof game !== 'object' || game === null) {
      throw new Error('Expected every game to be an object')
    }
    return game as Record<string, unknown>
  })
}

// Every catalog game has an owner score since snapshot v2, so the unscored paths use a test row.
async function insertUnscoredGame(): Promise<void> {
  await env.NEED_GAMES_DB.prepare(
    `INSERT OR IGNORE INTO games (id, slug, steam_app_id, title, steam_title, short_description,
       source_tags_json, review_category, review_count, review_scope, catalog_status,
       source_app_details_url, source_store_page_url, source_fetched_at, title_mapping_note)
     VALUES ('steam-999999', 'zz-unscored-test', 999999, 'Zz Unscored Test', 'Zz Unscored Test',
       'A test game with no owner score.', '["Test"]', 'Mixed', 1,
       'All Reviews: English Reviews', 'main_catalog',
       'https://store.steampowered.com/api/appdetails?appids=999999&l=english&cc=us',
       'https://store.steampowered.com/app/999999/?l=english&cc=us', '2026-08-14T19:17:05Z', NULL)`,
  ).run()
}

describe('read-only catalog routes', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('returns catalog cards in requested title and review-count order', async () => {
    const titleResponse = await SELF.fetch('https://need-games.test/api/catalog?sort=title_asc')
    const reviewResponse = await SELF.fetch(
      'https://need-games.test/api/catalog?sort=review_count_desc',
    )

    expect(titleResponse.status).toBe(200)
    expect(titleResponse.headers.get('content-type')).toContain('application/json')
    const titleData = await responseJson(titleResponse)
    const reviewData = await responseJson(reviewResponse)
    expect(titleData.datasetVersion).toBe('catalog-release-v1')
    expect(titleData.schemaVersion).toBe(1)
    expect(gamesIn(titleData)[0]?.title).toBe('Apex Legends')
    expect(gamesIn(reviewData)[0]?.title).toBe('Counter-Strike 2')
  })

  test('searches within the bounded catalog query', async () => {
    const response = await SELF.fetch('https://need-games.test/api/catalog?search=ring&limit=1')

    expect(gamesIn(await responseJson(response))).toEqual([
      expect.objectContaining({ slug: 'elden-ring' }),
    ])
  })

  test.each([
    'https://need-games.test/api/catalog?search=',
    `https://need-games.test/api/catalog?search=${'a'.repeat(101)}`,
    'https://need-games.test/api/catalog?limit=51',
    'https://need-games.test/api/catalog?limit=1.5',
    'https://need-games.test/api/catalog?sort=review_count',
    'https://need-games.test/api/catalog?unexpected=value',
  ])('rejects invalid catalog query %s', async (url) => {
    const response = await SELF.fetch(url)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_query' },
    })
  })

  test('returns detail for a known game and JSON not-found for an unknown slug', async () => {
    const detailResponse = await SELF.fetch('https://need-games.test/api/games/apex-legends')
    const missingResponse = await SELF.fetch('https://need-games.test/api/games/not-a-game')

    const detail = await responseJson(detailResponse)
    expect(detail.game).toMatchObject({
      authoritativeScore: { macro: 70, meso: 80, micro: 80, snapshotVersion: 2 },
      slug: 'apex-legends',
      title: 'Apex Legends',
    })
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: { code: 'game_not_found' },
    })
  })

  test('marks JSON API responses nosniff, because static asset headers do not cover them', async () => {
    for (const path of ['/api/catalog', '/api/games/apex-legends', '/api/games/not-a-game']) {
      const response = await SELF.fetch(`https://need-games.test${path}`)
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
    }
  })

  test('returns null for a catalog game without an authoritative score', async () => {
    await insertUnscoredGame()
    const detail = await responseJson(
      await SELF.fetch('https://need-games.test/api/games/zz-unscored-test'),
    )

    expect(detail.game).toMatchObject({ authoritativeScore: null, slug: 'zz-unscored-test' })
  })

  test('serves the two games owner snapshot v2 added', async () => {
    for (const slug of ['destiny-2', 'beamng-drive']) {
      const detail = await responseJson(
        await SELF.fetch(`https://need-games.test/api/games/${slug}`),
      )
      expect(detail.game, slug).toMatchObject({ authoritativeScore: { snapshotVersion: 2 }, slug })
    }
  })

  test('ranks the close scored games by MiMMa distance and shared tags', async () => {
    const response = await SELF.fetch('https://need-games.test/api/games/counter-strike-2/similar')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    const body: unknown = await response.json()
    expect(isSimilarGamesResponse(body)).toBe(true)
    expect(body).toMatchObject({
      datasetVersion: 'catalog-release-v1',
      game: { id: 'steam-730', slug: 'counter-strike-2', title: 'Counter-Strike 2' },
    })
    const similarGames = (body as SimilarGamesResponse).similarGames
    expect(similarGames.map((game) => [game.slug, game.distance, game.sharedTags])).toEqual([
      ['apex-legends', 14.14, ['FPS', 'Shooter', 'Multiplayer']],
      ['marvel-rivals', 14.14, ['Multiplayer']],
      ['tom-clancys-rainbow-six-siege', 22.36, ['FPS', 'Shooter', 'Multiplayer']],
      ['elden-ring', 15.81, []],
      ['monster-hunter-wilds', 20, ['Multiplayer', 'Action']],
    ])
    expect(similarGames.map((game) => game.slug)).not.toContain('destiny-2')
    expect(similarGames.map((game) => game.slug)).not.toContain('counter-strike-2')
  })

  test('returns the documented unscored response for a game without a score', async () => {
    await insertUnscoredGame()
    const response = await SELF.fetch('https://need-games.test/api/games/zz-unscored-test/similar')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unscored_game' },
    })
  })

  test('returns not-found for similar games of an unknown slug', async () => {
    const response = await SELF.fetch('https://need-games.test/api/games/not-a-game/similar')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'game_not_found' },
    })
  })
})
