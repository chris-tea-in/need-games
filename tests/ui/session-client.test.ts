import { describe, expect, test, vi } from 'vitest'

import {
  buildSteamSignInUrl,
  fetchSession,
  logoutSession,
  SessionClientError,
} from '../../src/ui/session-client.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const authenticatedResponse = {
  authenticated: true,
  csrfToken: 'OqtRhl8vRN75EUQ3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ',
  steamSignInEnabled: true,
}

describe('Steam session client', () => {
  test('requests session status with same-origin credentials and no client cache', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ authenticated: false, steamSignInEnabled: true }))

    await expect(fetchSession({ fetcher })).resolves.toEqual({
      authenticated: false,
      steamSignInEnabled: true,
    })
    expect(fetcher).toHaveBeenCalledWith('/api/session', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
  })

  test('rejects an unsuccessful or malformed session response without exposing its body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ token: 'secret' }, 503))

    await expect(fetchSession({ fetcher })).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    })
    await expect(
      fetchSession({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})) }),
    ).rejects.toBeInstanceOf(SessionClientError)
  })

  test('sends only the in-memory CSRF token in the logout header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const csrfToken = authenticatedResponse.csrfToken

    await expect(logoutSession(csrfToken, { fetcher })).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      method: 'POST',
    })
  })

  test('builds a same-origin sign-in URL with a bounded relative return path', () => {
    expect(buildSteamSignInUrl('/games/counter-strike-2')).toBe(
      '/api/auth/steam/start?return=%2Fgames%2Fcounter-strike-2',
    )
    expect(buildSteamSignInUrl('https://attacker.example/steal')).toBe(
      '/api/auth/steam/start?return=%2F',
    )
    expect(buildSteamSignInUrl('//attacker.example/steal')).toBe('/api/auth/steam/start?return=%2F')
  })
})
