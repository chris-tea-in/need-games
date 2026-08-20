import { describe, expect, test, vi } from 'vitest'

import {
  STEAM_PROFILE_ENDPOINT,
  synchronizeSteamProfile,
  type SteamProfileLookupEvent,
} from '../../src/worker/auth/steam-profile.js'

const steamId = '76561198000000001'
const apiKey = 'server-only-test-key'

function profileResponse(players: Array<Record<string, unknown>>, status = 200): Response {
  return new Response(JSON.stringify({ response: { players } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function player(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { steamid: steamId, personaname: '  Ada 🔥  ', ...overrides }
}

function immediateTimeoutControls(): {
  setTimeoutFn: (callback: () => void, milliseconds: number) => number
  clearTimeoutFn: (handle: number) => void
} {
  return {
    setTimeoutFn: (callback, milliseconds) => {
      expect(milliseconds).toBe(25)
      callback()
      return 1
    },
    clearTimeoutFn: vi.fn(),
  }
}

describe('Steam profile synchronization', () => {
  test('fetches one matching profile, trims the Unicode name, and keeps the key out of events', async () => {
    const events: SteamProfileLookupEvent[] = []
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const url = new URL(requestUrl)
      expect(url.origin + url.pathname).toBe(STEAM_PROFILE_ENDPOINT)
      expect(url.searchParams.get('key')).toBe(apiKey)
      expect(url.searchParams.get('steamids')).toBe(steamId)
      expect(init?.method).toBe('GET')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Promise.resolve(profileResponse([player()]))
    })

    await expect(
      synchronizeSteamProfile({
        steamId,
        apiKey,
        fetcher,
        now: 1_755_648_000,
        logger: (event) => events.push(event),
      }),
    ).resolves.toEqual({
      status: 'verified',
      personaname: 'Ada 🔥',
      checkedAt: 1_755_648_000,
      attempts: 1,
      shouldWrite: true,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(events).toEqual([])
    expect(JSON.stringify(events)).not.toContain(apiKey)
  })

  test('writes a changed name and re-verifies a name after an unavailable status', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(profileResponse([player({ personaname: 'New Name' })])),
    )

    await expect(
      synchronizeSteamProfile({
        steamId,
        apiKey,
        fetcher,
        storedName: 'Old Name',
        previousStatus: 'verified',
        now: new Date('2026-08-19T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      status: 'verified',
      personaname: 'New Name',
      shouldWrite: true,
    })

    await expect(
      synchronizeSteamProfile({
        steamId,
        apiKey,
        fetcher,
        storedName: 'New Name',
        previousStatus: 'unavailable',
        now: 1_755_648_000,
      }),
    ).resolves.toMatchObject({
      status: 'verified',
      personaname: 'New Name',
      shouldWrite: true,
    })
  })

  test('retries exactly once and succeeds on the second attempt', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporary failure', { status: 503 }))
      .mockResolvedValueOnce(profileResponse([player({ personaname: 'Retry Name' })]))
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() => Promise.resolve())

    await expect(
      synchronizeSteamProfile({
        steamId,
        apiKey,
        fetcher,
        retryDelayMs: 10,
        sleep,
      }),
    ).resolves.toMatchObject({
      status: 'verified',
      personaname: 'Retry Name',
      attempts: 2,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(10)
  })

  test('caps an injected retry budget at two attempts', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('unavailable', { status: 429 })),
    )

    await expect(
      synchronizeSteamProfile({ steamId, apiKey, fetcher, maxAttempts: 99 }),
    ).resolves.toMatchObject({ status: 'unavailable', attempts: 2 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test.each([
    ['network error', () => Promise.reject(new Error(`key=${apiKey}`)), 'network_error'],
    [
      'mismatched SteamID',
      () => Promise.resolve(profileResponse([player({ steamid: '76561198000000002' })])),
      'mismatched_steam_id',
    ],
    [
      'malformed JSON',
      () => Promise.resolve(new Response('{not-json', { status: 200 })),
      'malformed_json',
    ],
    ['empty player list', () => Promise.resolve(profileResponse([])), 'empty_player_list'],
    [
      'invalid name',
      () => Promise.resolve(profileResponse([player({ personaname: 'bad\u0000name' })])),
      'invalid_personaname',
    ],
  ])(
    'returns unavailable after two %s failures without leaking the secret',
    async (_label, response, reason) => {
      const fetcher = vi.fn<typeof fetch>(response)
      const messages: string[] = []

      await expect(
        synchronizeSteamProfile({
          steamId,
          apiKey,
          fetcher,
          logger: (event) => messages.push(event.message),
        }),
      ).resolves.toMatchObject({
        status: 'unavailable',
        attempts: 2,
        reason,
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(messages.length).toBe(2)
      expect(messages.join('\n')).not.toContain(apiKey)
    },
  )

  test('bounds each fetch attempt with an injected timeout', async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined))
    const timeoutControls = immediateTimeoutControls()

    await expect(
      synchronizeSteamProfile({
        steamId,
        apiKey,
        fetcher,
        timeoutMs: 25,
        ...timeoutControls,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      attempts: 2,
      reason: 'timeout',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(timeoutControls.clearTimeoutFn).toHaveBeenCalledTimes(2)
  })

  test('rejects invalid Steam IDs and empty API keys without making a request', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      synchronizeSteamProfile({ steamId: 'not-a-steam-id', apiKey, fetcher }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'invalid_steam_id', attempts: 0 })
    await expect(synchronizeSteamProfile({ steamId, apiKey: '', fetcher })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'invalid_api_key',
      attempts: 0,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
