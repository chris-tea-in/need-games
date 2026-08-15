import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

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
      authoritativeScore: null,
      slug: 'apex-legends',
      title: 'Apex Legends',
    })
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: { code: 'game_not_found' },
    })
  })

  test('returns the documented unscored response for a known similar-game request', async () => {
    const response = await SELF.fetch('https://need-games.test/api/games/counter-strike-2/similar')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unscored_game' },
    })
  })
})
