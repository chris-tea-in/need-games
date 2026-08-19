import { describe, expect, test, vi } from 'vitest'

import {
  assertAnonymousSessionResponse,
  assertProductionSmokeOrigin,
  requestProductionJson,
} from '../scripts/release-production.mjs'

const productionOrigin = 'https://myplayprint.e9k.workers.dev'

describe('production smoke boundary', () => {
  test('accepts only the stable production Worker origin', () => {
    expect(assertProductionSmokeOrigin(`${productionOrigin}/`).origin).toBe(productionOrigin)
    expect(() =>
      assertProductionSmokeOrigin('https://myplayprint-preview.e9k.workers.dev'),
    ).toThrow(/production Worker origin/i)
  })

  test('rejects a response that crosses to another origin without following redirects', async () => {
    const requester = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual')
      return Promise.resolve({
        body: null,
        json: () => Promise.resolve({ datasetVersion: 'catalog-release-v1', games: [] }),
        status: 200,
        url: 'https://myplayprint-preview.e9k.workers.dev/api/catalog',
      } as unknown as Response)
    })

    await expect(
      requestProductionJson('/api/catalog', new URL(productionOrigin), requester),
    ).rejects.toThrow(/cross-origin/i)
  })

  test('rejects malformed anonymous session responses while the route is present', () => {
    expect(() => assertAnonymousSessionResponse(404, undefined)).not.toThrow()
    expect(() => assertAnonymousSessionResponse(200, {})).toThrow(/anonymous session/i)
    expect(() => assertAnonymousSessionResponse(200, { authenticated: true })).toThrow(
      /anonymous session/i,
    )
    expect(() => assertAnonymousSessionResponse(200, { authenticated: false })).not.toThrow()
  })
})
