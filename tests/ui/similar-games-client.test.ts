import { describe, expect, test, vi } from 'vitest'

import { loadSimilarGames } from '../../src/ui/api-client.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const versioned = { datasetVersion: 'catalog-release-v1', schemaVersion: 1 }

describe('similar games client', () => {
  test('returns the API ranking when the response is valid', async () => {
    const body = {
      ...versioned,
      game: { id: 'steam-730', slug: 'counter-strike-2', title: 'Counter-Strike 2' },
      similarGames: [
        {
          authoritativeScore: { macro: 80, meso: 60, micro: 80, snapshotVersion: 1 },
          distance: 20.62,
          id: 'steam-2767030',
          sharedTags: ['Multiplayer'],
          slug: 'marvel-rivals',
          steamAppId: 2767030,
          title: 'Marvel Rivals',
        },
      ],
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body))

    const result = await loadSimilarGames('counter-strike-2', { fetcher })

    expect(fetcher).toHaveBeenCalledWith(
      '/api/games/counter-strike-2/similar',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
    expect(result).toEqual({ games: body.similarGames, kind: 'data', source: 'api' })
  })

  test('reports an unscored game from the API error code', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { ...versioned, error: { code: 'unscored_game', message: 'Unavailable.' } },
          404,
        ),
      )

    await expect(loadSimilarGames('destiny-2', { fetcher })).resolves.toEqual({ kind: 'unscored' })
  })

  test('reports an error for an unknown game', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ ...versioned, error: { code: 'game_not_found', message: 'Missing.' } }, 404),
      )

    await expect(loadSimilarGames('not-a-game', { fetcher })).resolves.toMatchObject({
      kind: 'error',
    })
  })

  test.each([
    ['a network failure', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))],
    ['a server error', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 503))],
    ['a malformed success', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ games: [] }))],
  ])('ranks from the bundled snapshot after %s', async (_label, fetcher) => {
    const result = await loadSimilarGames('counter-strike-2', { fetcher })

    expect(result).toMatchObject({ kind: 'data', source: 'snapshot' })
    if (result.kind === 'data') {
      expect(result.games.map((game) => [game.slug, game.sharedTags])).toEqual([
        ['tom-clancys-rainbow-six-siege', ['FPS', 'Shooter', 'Multiplayer']],
        ['marvel-rivals', ['Multiplayer']],
        ['apex-legends', ['FPS', 'Shooter', 'Multiplayer']],
        ['monster-hunter-wilds', ['Multiplayer', 'Action']],
      ])
    }
  })

  test('reports an unscored game from the snapshot when offline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))

    await expect(loadSimilarGames('beamng-drive', { fetcher })).resolves.toEqual({
      kind: 'unscored',
    })
  })
})
