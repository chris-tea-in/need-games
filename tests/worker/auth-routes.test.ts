import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import { routeAuthRequest } from '../../src/worker/routes/auth.js'
import {
  createLoginTransaction,
  createSession,
  getLoginTransaction,
  readSession,
  upsertUserBySteamId,
} from '../../src/worker/repositories/identity.js'
import {
  LOGIN_TRANSACTION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../../src/worker/auth/session-cookie.js'
import { deriveCsrfToken, hashToken } from '../../src/worker/auth/token-hash.js'
import { applyBetaMigrations } from './apply-beta-migrations.js'

const origin = 'https://myplayprint.e9k.workers.dev'

function authEnv(overrides: Record<string, unknown> = {}): Env {
  return {
    ...env,
    PRODUCTION_ORIGIN: origin,
    STEAM_SIGN_IN_ENABLED: 'true',
    CSRF_HMAC_SECRET: 'test-csrf-secret',
    STEAM_WEB_API_KEY: 'test-steam-key',
    ...overrides,
  } as unknown as Env
}

describe('Steam authentication routes', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('returns the disabled result without touching identity storage', async () => {
    const prepare = vi.fn()
    const database = { prepare } as unknown as D1Database
    const response = await routeAuthRequest(
      new Request(`${origin}/api/auth/steam/start?return=%2F`),
      authEnv({ NEED_GAMES_DB: database, STEAM_SIGN_IN_ENABLED: 'false' }),
      new URL(`${origin}/api/auth/steam/start?return=%2F`),
    )

    expect(response?.status).toBe(503)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    await expect(response?.json()).resolves.toEqual({
      error: { code: 'sign_in_disabled', message: 'Steam sign-in is currently unavailable.' },
    })
    expect(prepare).not.toHaveBeenCalled()
  })

  test('invalidates a pending callback transaction when sign-in is disabled', async () => {
    const now = 1_800_020_000
    const loginToken = 'D'.repeat(43)
    const tokenHash = await hashToken(loginToken)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash,
      returnPath: '/games/apex-legends',
      createdAt: now,
    })

    const request = new Request(`${origin}/api/auth/steam/callback`, {
      headers: { Cookie: `${LOGIN_TRANSACTION_COOKIE_NAME}=${loginToken}` },
    })
    const response = await routeAuthRequest(
      request,
      authEnv({ STEAM_SIGN_IN_ENABLED: 'false' }),
      new URL(request.url),
      { now: () => now },
    )

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(`${origin}/games/apex-legends?auth=failed`)
    await expect(getLoginTransaction(env.NEED_GAMES_DB, tokenHash)).resolves.toMatchObject({
      consumedAt: now,
    })
  })

  test('starts Steam authentication with a host-only transaction cookie and trusted callback', async () => {
    const request = new Request(`${origin}/api/auth/steam/start?return=%2Fgames%2Fapex-legends`)
    const response = await routeAuthRequest(request, authEnv(), new URL(request.url), {
      generateToken: () => 'A'.repeat(43),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toContain('https://steamcommunity.com/openid/login?')
    expect(response?.headers.get('location')).toContain(
      encodeURIComponent(`${origin}/api/auth/steam/callback`),
    )
    expect(response?.headers.get('set-cookie')).toContain('__Host-myplayprint_login_transaction=')
    expect(response?.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response?.headers.get('set-cookie')).toContain('SameSite=Lax')
  })

  test('rejects unsupported methods with an explicit Allow header', async () => {
    const request = new Request(`${origin}/api/session`, { method: 'POST' })
    const response = await routeAuthRequest(request, authEnv(), new URL(request.url))

    expect(response?.status).toBe(405)
    expect(response?.headers.get('allow')).toBe('GET')
  })

  test('returns anonymous session state with no-store caching', async () => {
    const request = new Request(`${origin}/api/session`)
    const response = await routeAuthRequest(request, authEnv(), new URL(request.url))

    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    await expect(response?.json()).resolves.toEqual({
      authenticated: false,
      steamSignInEnabled: true,
    })
  })

  test('integrates the disabled session route through the Worker router', async () => {
    const response = await SELF.fetch('https://need-games.test/api/session')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      steamSignInEnabled: false,
    })
  })

  test('revokes an active session on logout while sign-in is disabled', async () => {
    const now = 1_800_023_000
    const rawSessionToken = 'G'.repeat(43)
    const sessionTokenHash = await hashToken(rawSessionToken)
    const user = await upsertUserBySteamId(env.NEED_GAMES_DB, '76561198000000223', {
      userId: 'logout-disabled-user',
      now,
    })
    await createSession(env.NEED_GAMES_DB, {
      tokenHash: sessionTokenHash,
      userId: user.id,
      createdAt: now,
    })
    const csrfToken = await deriveCsrfToken(sessionTokenHash, 'test-csrf-secret')

    const response = await routeAuthRequest(
      new Request(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}`,
          'X-CSRF-Token': csrfToken,
        },
      }),
      authEnv({ STEAM_SIGN_IN_ENABLED: 'false' }),
      new URL(`${origin}/api/auth/logout`),
      { now: () => now },
    )

    expect(response?.status).toBe(204)
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0')
    await expect(readSession(env.NEED_GAMES_DB, sessionTokenHash, now)).resolves.toBeNull()
  })

  test('rejects disabled logout without valid CSRF while clearing the session cookie', async () => {
    const now = 1_800_024_000
    const rawSessionToken = 'H'.repeat(43)
    const sessionTokenHash = await hashToken(rawSessionToken)
    const user = await upsertUserBySteamId(env.NEED_GAMES_DB, '76561198000000224', {
      userId: 'logout-disabled-invalid-csrf-user',
      now,
    })
    await createSession(env.NEED_GAMES_DB, {
      tokenHash: sessionTokenHash,
      userId: user.id,
      createdAt: now,
    })

    const response = await routeAuthRequest(
      new Request(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}` },
      }),
      authEnv({ STEAM_SIGN_IN_ENABLED: 'false' }),
      new URL(`${origin}/api/auth/logout`),
      { now: () => now },
    )

    expect(response?.status).toBe(403)
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0')
    await expect(readSession(env.NEED_GAMES_DB, sessionTokenHash, now)).resolves.not.toBeNull()

    const invalidTokenResponse = await routeAuthRequest(
      new Request(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}`,
          'X-CSRF-Token': 'I'.repeat(43),
        },
      }),
      authEnv({ STEAM_SIGN_IN_ENABLED: 'false' }),
      new URL(`${origin}/api/auth/logout`),
      { now: () => now },
    )

    expect(invalidTokenResponse?.status).toBe(403)
    expect(invalidTokenResponse?.headers.get('set-cookie')).toContain('Max-Age=0')
    await expect(readSession(env.NEED_GAMES_DB, sessionTokenHash, now)).resolves.not.toBeNull()
  })

  test('completes a verified callback, preserves profile failure, and creates a session', async () => {
    const now = 1_800_010_000
    const loginToken = 'B'.repeat(43)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash: await hashToken(loginToken),
      returnPath: '/games/apex-legends',
      createdAt: now,
    })
    const request = new Request(`${origin}/api/auth/steam/callback`, {
      headers: { Cookie: `${LOGIN_TRANSACTION_COOKIE_NAME}=${loginToken}` },
    })

    const response = await routeAuthRequest(request, authEnv(), new URL(request.url), {
      now: () => now,
      generateToken: () => 'C'.repeat(43),
      validateAssertion: vi.fn(() =>
        Promise.resolve({
          steamId: '76561198000000221',
          responseNonce: 'nonce-route-1',
          returnTo: `${origin}/api/auth/steam/callback`,
        }),
      ),
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(`${origin}/games/apex-legends`)
    expect(response?.headers.get('set-cookie')).toContain('__Host-myplayprint_session=')
    expect(response?.headers.get('set-cookie')).toContain('__Host-myplayprint_login_transaction=')

    const session = await routeAuthRequest(
      new Request(`${origin}/api/session`, {
        headers: { Cookie: response?.headers.get('set-cookie')?.split(';')[0] ?? '' },
      }),
      authEnv(),
      new URL(`${origin}/api/session`),
      { now: () => now },
    )
    expect(session?.status).toBe(200)
    const sessionBody = await session?.json()
    expect(sessionBody).toMatchObject({ authenticated: true })
    const csrfToken = (sessionBody as { csrfToken: string }).csrfToken
    const logout = await routeAuthRequest(
      new Request(`${origin}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: response?.headers.get('set-cookie')?.split(';')[0] ?? '',
          'X-CSRF-Token': csrfToken,
        },
      }),
      authEnv(),
      new URL(`${origin}/api/auth/logout`),
      { now: () => now },
    )
    expect(logout?.status).toBe(204)
    expect(logout?.headers.get('set-cookie')).toContain('__Host-myplayprint_session=')
    expect(logout?.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  test('strips a crafted failure marker from a successful return while preserving URL state', async () => {
    const now = 1_800_010_500
    const loginToken = 'J'.repeat(43)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash: await hashToken(loginToken),
      returnPath: '/games/apex-legends?auth=failed&tab=reviews#comments',
      createdAt: now,
    })
    const request = new Request(`${origin}/api/auth/steam/callback`, {
      headers: { Cookie: `${LOGIN_TRANSACTION_COOKIE_NAME}=${loginToken}` },
    })

    const response = await routeAuthRequest(request, authEnv(), new URL(request.url), {
      now: () => now,
      generateToken: () => 'K'.repeat(43),
      validateAssertion: vi.fn(() =>
        Promise.resolve({
          steamId: '76561198000000225',
          responseNonce: 'nonce-route-marker',
          returnTo: `${origin}/api/auth/steam/callback`,
        }),
      ),
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(
      `${origin}/games/apex-legends?tab=reviews#comments`,
    )
  })

  test('invalidates a transaction when an unsafe callback nonce reaches storage', async () => {
    const now = 1_800_021_000
    const loginToken = 'E'.repeat(43)
    const tokenHash = await hashToken(loginToken)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash,
      returnPath: '/',
      createdAt: now,
    })

    const request = new Request(`${origin}/api/auth/steam/callback`, {
      headers: { Cookie: `${LOGIN_TRANSACTION_COOKIE_NAME}=${loginToken}` },
    })
    const response = await routeAuthRequest(request, authEnv(), new URL(request.url), {
      now: () => now,
      validateAssertion: vi.fn(() =>
        Promise.resolve({
          steamId: '76561198000000222',
          responseNonce: 'N'.repeat(513),
          returnTo: `${origin}/api/auth/steam/callback`,
        }),
      ),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(`${origin}/?auth=failed`)
    await expect(getLoginTransaction(env.NEED_GAMES_DB, tokenHash)).resolves.toMatchObject({
      consumedAt: now,
    })
  })

  test('falls back to the catalog root when a persisted return path is tampered', async () => {
    const now = 1_800_022_000
    const loginToken = 'F'.repeat(43)
    const tokenHash = await hashToken(loginToken)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash,
      returnPath: '/',
      createdAt: now,
    })
    await env.NEED_GAMES_DB.prepare(
      'UPDATE steam_login_transactions SET return_path = ? WHERE token_hash = ?',
    )
      .bind('/\\\\evil.example/phish', tokenHash)
      .run()

    const request = new Request(`${origin}/api/auth/steam/callback`, {
      headers: { Cookie: `${LOGIN_TRANSACTION_COOKIE_NAME}=${loginToken}` },
    })
    const response = await routeAuthRequest(request, authEnv(), new URL(request.url), {
      now: () => now,
      validateAssertion: vi.fn(() => Promise.reject(new Error('invalid callback'))),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(`${origin}/?auth=failed`)
  })
})
