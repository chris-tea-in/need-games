import { describe, expect, test, vi } from 'vitest'

import worker from '../../src/worker/index.js'

describe('Worker API error handling', () => {
  test('redacts D1 failures into a stable unavailable response and safe log event', async () => {
    const error = new Error('database password=very-secret query=select * from users')
    const database = {
      prepare: vi.fn(() => {
        throw error
      }),
    } as unknown as D1Database
    const assets = { fetch: vi.fn() } as unknown as Fetcher
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const response = await worker.fetch(
        new Request(
          'https://need-games.test/api/catalog?search=private-title',
        ) as unknown as Parameters<typeof worker.fetch>[0],
        { ASSETS: assets, NEED_GAMES_DB: database },
      )

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        datasetVersion: 'unavailable',
        schemaVersion: 1,
        error: {
          code: 'catalog_temporarily_unavailable',
          message: 'The catalog is temporarily unavailable. Please try again later.',
        },
      })
      expect(logError).toHaveBeenCalledWith({
        datasetVersion: 'unavailable',
        errorCode: 'catalog_temporarily_unavailable',
        route: '/api/catalog',
        status: 503,
      })
      expect(JSON.stringify(logError.mock.calls)).not.toContain(error.message)
      expect(JSON.stringify(logError.mock.calls)).not.toContain('private-title')
    } finally {
      logError.mockRestore()
    }
  })
})
