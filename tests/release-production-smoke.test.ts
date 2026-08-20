import { describe, expect, test, vi } from 'vitest'

import {
  assertAnonymousSessionResponse,
  assertDisabledAuthStartResponse,
  assertMissingCsrfLogoutResponse,
  assertProductionSteamSignInMode,
  assertProductionSmokeOrigin,
  readOnlySmokeTest,
  requestProductionJson,
} from '../scripts/release-production.mjs'

const productionOrigin = 'https://myplayprint.e9k.workers.dev'

describe('production smoke boundary', () => {
  const trackedConfig = (mode?: string) =>
    JSON.stringify({
      env: {
        production: {
          vars: mode === undefined ? {} : { STEAM_SIGN_IN_ENABLED: mode },
        },
      },
    })

  test.each(['true', 'false'] as const)(
    'accepts explicit %s mode only when it matches the tracked production config',
    (mode) => {
      expect(assertProductionSteamSignInMode(trackedConfig(mode), mode)).toBe(mode)
    },
  )

  test.each([
    { configured: 'true', requested: undefined },
    { configured: 'true', requested: 'false' },
    { configured: 'false', requested: 'true' },
    { configured: 'true', requested: 'TRUE' },
    { configured: 'enabled', requested: 'enabled' },
    { configured: undefined, requested: 'true' },
  ])('rejects missing, invalid, or mismatched mode %#', ({ configured, requested }) => {
    expect(() => assertProductionSteamSignInMode(trackedConfig(configured), requested)).toThrow(
      /Steam sign-in mode/i,
    )
  })

  test('rejects duplicate tracked production mode declarations as ambiguous', () => {
    const ambiguousConfig =
      '{"env":{"production":{"vars":{"STEAM_SIGN_IN_ENABLED":"true","STEAM_SIGN_IN_ENABLED":"false"}}}}'

    expect(() => assertProductionSteamSignInMode(ambiguousConfig, 'true')).toThrow(
      /Steam sign-in mode/i,
    )
  })

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

  test.each([
    { enabled: true, mode: 'true' as const },
    { enabled: false, mode: 'false' as const },
  ])('accepts only the exact $mode anonymous session contract', ({ enabled, mode }) => {
    expect(() => assertAnonymousSessionResponse(404, undefined, mode)).toThrow(/anonymous session/i)
    expect(() => assertAnonymousSessionResponse(200, {}, mode)).toThrow(/anonymous session/i)
    expect(() =>
      assertAnonymousSessionResponse(
        200,
        { authenticated: false, steamSignInEnabled: !enabled },
        mode,
      ),
    ).toThrow(/anonymous session/i)
    expect(() => assertAnonymousSessionResponse(200, { authenticated: false }, mode)).toThrow(
      /anonymous session/i,
    )
    expect(() =>
      assertAnonymousSessionResponse(
        200,
        {
          authenticated: false,
          steamSignInEnabled: enabled,
          extra: 'unexpected',
        },
        mode,
      ),
    ).toThrow(/anonymous session/i)
    expect(() =>
      assertAnonymousSessionResponse(
        200,
        { authenticated: true, steamSignInEnabled: enabled },
        mode,
      ),
    ).toThrow(/anonymous session/i)
    expect(() =>
      assertAnonymousSessionResponse(
        200,
        { authenticated: false, steamSignInEnabled: enabled },
        mode,
      ),
    ).not.toThrow()
  })

  function response(url: URL, status: number, body: unknown): Response {
    return {
      json: () => Promise.resolve(body),
      status,
      url: url.href,
    } as Response
  }

  function requestUrl(input: URL | RequestInfo): URL {
    if (input instanceof URL) return input
    if (typeof input === 'string') return new URL(input)
    return new URL(input.url)
  }

  function smokeRequester(mode: 'true' | 'false') {
    return vi.fn((input: URL | RequestInfo) => {
      const url = requestUrl(input)
      const pathname = `${url.pathname}${url.search}`
      if (url.pathname === '/api/catalog') {
        return Promise.resolve(
          response(url, 200, {
            datasetVersion: 'catalog-release-v1',
            games: Array.from({ length: 10 }, (_, index) => ({ slug: `game-${index}` })),
          }),
        )
      }
      if (url.pathname === '/api/games/counter-strike-2')
        return Promise.resolve(response(url, 200, {}))
      if (url.pathname === '/api/session') {
        return Promise.resolve(
          response(url, 200, {
            authenticated: false,
            steamSignInEnabled: mode === 'true',
          }),
        )
      }
      if (pathname === '/api/auth/steam/start?return=%2F') {
        return Promise.resolve(
          response(url, 503, {
            error: {
              code: 'sign_in_disabled',
              message: 'Steam sign-in is currently unavailable.',
            },
          }),
        )
      }
      if (url.pathname === '/api/auth/logout') {
        return Promise.resolve(
          response(url, 403, {
            error: { code: 'invalid_csrf', message: 'The logout request is invalid.' },
          }),
        )
      }
      return Promise.resolve(response(url, 404, {}))
    })
  }

  test('enabled smoke stays read-only and never starts Steam authentication', async () => {
    const requester = smokeRequester('true')

    await readOnlySmokeTest(productionOrigin, 'true', requester)

    expect(requester.mock.calls.map(([input]) => requestUrl(input).href)).not.toContain(
      `${productionOrigin}/api/auth/steam/start?return=%2F`,
    )
  })

  test('disabled smoke preserves the exact disabled auth-start check', async () => {
    const requester = smokeRequester('false')

    await readOnlySmokeTest(productionOrigin, 'false', requester)

    expect(requester).toHaveBeenCalledWith(
      new URL('/api/auth/steam/start?return=%2F', productionOrigin),
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  test('accepts only the disabled auth-start and missing-CSRF logout contracts', () => {
    expect(() =>
      assertDisabledAuthStartResponse(503, {
        error: {
          code: 'sign_in_disabled',
          message: 'Steam sign-in is currently unavailable.',
        },
      }),
    ).not.toThrow()
    expect(() => assertDisabledAuthStartResponse(302, undefined)).toThrow(/auth start/i)

    expect(() =>
      assertMissingCsrfLogoutResponse(403, {
        error: { code: 'invalid_csrf', message: 'The logout request is invalid.' },
      }),
    ).not.toThrow()
    expect(() => assertMissingCsrfLogoutResponse(204, undefined)).toThrow(/logout/i)
  })
})
