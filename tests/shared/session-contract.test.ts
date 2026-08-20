import { describe, expect, test } from 'vitest'

import {
  AUTH_FAILURE_QUERY_PARAMETER,
  AUTH_FAILURE_QUERY_VALUE,
  AUTH_ROUTES,
  AUTH_RESULT_CODES,
  PROFILE_LOOKUP_STATUSES,
  SESSION_CACHE_CONTROL,
  SESSION_LIFETIME_SECONDS,
  STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS,
  isSessionResponse,
  type SessionResponse,
} from '../../src/shared/session-contract.js'

describe('shared Steam session contract', () => {
  test('freezes the stable authentication result codes', () => {
    expect(AUTH_RESULT_CODES).toEqual([
      'sign_in_disabled',
      'authentication_failed',
      'invalid_login_transaction',
      'invalid_steam_assertion',
      'expired_login_transaction',
      'callback_replayed',
      'invalid_csrf',
      'identity_storage_unavailable',
    ])
  })

  test('freezes the profile states, failure marker, and fixed lifetimes', () => {
    expect(PROFILE_LOOKUP_STATUSES).toEqual(['verified', 'unavailable'])
    expect(AUTH_FAILURE_QUERY_PARAMETER).toBe('auth')
    expect(AUTH_FAILURE_QUERY_VALUE).toBe('failed')
    expect(STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS).toBe(10 * 60)
    expect(SESSION_LIFETIME_SECONDS).toBe(7 * 24 * 60 * 60)
  })

  test('freezes the same-origin routes and no-store session policy', () => {
    expect(AUTH_ROUTES).toEqual({
      logout: '/api/auth/logout',
      session: '/api/session',
      steamCallback: '/api/auth/steam/callback',
      steamStart: '/api/auth/steam/start',
    })
    expect(SESSION_CACHE_CONTROL).toBe('no-store')
  })

  test('accepts the anonymous and authenticated response variants', () => {
    const responses: readonly SessionResponse[] = [
      { authenticated: false, steamSignInEnabled: true },
      {
        authenticated: true,
        csrfToken: 'OqtRhl8vRN75EUQ3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ',
        steamSignInEnabled: true,
      },
    ]

    for (const response of responses) {
      expect(isSessionResponse(response)).toBe(true)
    }
  })

  test.each(['steamId', 'sessionToken', 'tokenHash', 'steamApiKey', 'displayName'])(
    'rejects a session response that exposes %s',
    (sensitiveField) => {
      expect(
        isSessionResponse({
          authenticated: false,
          steamSignInEnabled: true,
          [sensitiveField]: 'sensitive',
        }),
      ).toBe(false)
    },
  )

  test('rejects missing, malformed, or anonymous CSRF fields', () => {
    expect(isSessionResponse({ authenticated: true, steamSignInEnabled: true })).toBe(false)
    expect(
      isSessionResponse({
        authenticated: true,
        csrfToken: 'not-a-256-bit-base64url-token',
        steamSignInEnabled: true,
      }),
    ).toBe(false)
    expect(
      isSessionResponse({
        authenticated: false,
        csrfToken: 'OqtRhl8vRN75EUQ3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ',
        steamSignInEnabled: true,
      }),
    ).toBe(false)
  })
})
