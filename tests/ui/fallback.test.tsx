import { describe, expect, test, vi } from 'vitest'

import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { loadCatalog, loadGameDetail } from '../../src/ui/api-client.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('catalog API fallback', () => {
  test('uses the generated snapshot after a network failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network unavailable'))

    const result = await loadCatalog({ fetcher })

    expect(result.kind).toBe('data')
    if (result.kind === 'data') {
      expect(result.source).toBe('snapshot')
      expect(result.data.datasetVersion).toBe('catalog-release-v1')
      expect(result.data.games.some((game) => game.slug === 'counter-strike-2')).toBe(true)
    }
  })

  test('uses the generated snapshot after a server error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503))

    const result = await loadCatalog({ fetcher })

    expect(result).toMatchObject({ kind: 'data', source: 'snapshot' })
    expect(result.kind === 'data' && result.data.games).toHaveLength(catalogSnapshot.games.length)
  })

  test('uses the generated snapshot after a malformed successful response', async () => {
    const response = jsonResponse({ games: [] })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)

    const result = await loadCatalog({ fetcher })

    expect(result).toMatchObject({ kind: 'data', source: 'snapshot' })
    expect(result.kind === 'data' && result.data.games).toHaveLength(catalogSnapshot.games.length)
  })

  test.each([
    [
      'a non-HTTPS provenance URL',
      (game: Record<string, unknown>) => {
        ;(game.provenance as Record<string, unknown>).storePageUrl = 'not a URL'
      },
    ],
    [
      'a fractional review count',
      (game: Record<string, unknown>) => {
        ;(game.review as Record<string, unknown>).count = 1.5
      },
    ],
    [
      'an invalid provenance timestamp',
      (game: Record<string, unknown>) => {
        ;(game.provenance as Record<string, unknown>).fetchedAt = 'not a timestamp'
      },
    ],
  ])('uses the snapshot when the API returns %s', async (_description, mutate) => {
    const game = structuredClone(catalogSnapshot.games[0]) as unknown as Record<string, unknown>
    mutate(game)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ datasetVersion: 'catalog-release-v1', schemaVersion: 1, game }),
      )

    const result = await loadGameDetail('counter-strike-2', { fetcher })

    expect(result).toMatchObject({ kind: 'data', source: 'snapshot' })
  })

  test('keeps a valid empty catalog response instead of treating it as an outage', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ datasetVersion: 'catalog-release-v1', schemaVersion: 1, games: [] }),
      )

    const result = await loadCatalog({ fetcher })

    expect(result).toEqual({
      kind: 'data',
      source: 'api',
      data: { datasetVersion: 'catalog-release-v1', schemaVersion: 1, games: [] },
    })
  })

  test('keeps a game 404 distinct from an outage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          datasetVersion: 'catalog-release-v1',
          schemaVersion: 1,
          error: { code: 'game_not_found', message: 'Game not found.' },
        },
        404,
      ),
    )

    const result = await loadGameDetail('unknown-game', { fetcher })

    expect(result).toEqual({ kind: 'not-found' })
  })
})
