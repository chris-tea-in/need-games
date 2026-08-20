import { describe, expect, test, vi } from 'vitest'

import {
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_NAMESPACE,
  createSteamNonceReplayGuard,
  validateSteamAssertion,
} from '../../src/worker/auth/steam-openid.js'

const callbackUrl = 'https://myplayprint.e9k.workers.dev/api/auth/steam/callback'
const steamId = '76561198000000001'
const now = Date.parse('2026-08-19T12:00:00.000Z')

function assertion(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': STEAM_OPENID_NAMESPACE,
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': callbackUrl,
    'openid.response_nonce': '2026-08-19T11:55:00Z-unique',
    'openid.assoc_handle': 'handle-1',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'encoded-signature',
    ...overrides,
  })
}

function validOptions(
  fetcher: typeof fetch,
  replayGuard = createSteamNonceReplayGuard(),
): Parameters<typeof validateSteamAssertion>[1] {
  return {
    callbackUrl,
    expectedOrigin: 'https://myplayprint.e9k.workers.dev',
    expectedReturnTo: callbackUrl,
    now,
    fetcher,
    replayGuard,
  }
}

describe('Steam OpenID assertion validation', () => {
  test('validates the assertion and confirms it with Steam check_authentication', async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      expect(_input).toBe(STEAM_OPENID_ENDPOINT)
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded',
      })
      const body =
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : ''
      expect(body).toContain('openid.mode=check_authentication')
      expect(body).toContain(
        `openid.identity=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F${steamId}`,
      )
      return Promise.resolve(
        new Response('ns:https://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 }),
      )
    })

    await expect(validateSteamAssertion(assertion(), validOptions(fetcher))).resolves.toEqual({
      steamId,
      responseNonce: '2026-08-19T11:55:00Z-unique',
      returnTo: callbackUrl,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['namespace', { 'openid.ns': 'https://example.test/openid' }],
    ['mode', { 'openid.mode': 'cancel' }],
    ['endpoint', { 'openid.op_endpoint': 'https://example.test/login' }],
    [
      'claimed identity',
      { 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000002' },
    ],
    [
      'identity equality',
      { 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000002' },
    ],
    ['SteamID form', { 'openid.identity': 'https://steamcommunity.com/openid/id/not-a-steam-id' }],
    ['return origin', { 'openid.return_to': 'https://evil.example/callback' }],
    [
      'signed fields',
      { 'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce' },
    ],
    ['response nonce', { 'openid.response_nonce': '2020-01-01T00:00:00Z-old' }],
  ])(
    'rejects invalid %s before making a server confirmation request',
    async (_label, overrides) => {
      const fetcher = vi.fn<typeof fetch>()

      await expect(
        validateSteamAssertion(assertion(overrides), validOptions(fetcher)),
      ).rejects.toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  test('rejects mismatched callback URLs, oversized fields, and extra signed fields', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      validateSteamAssertion(
        assertion({ 'openid.return_to': `${callbackUrl}?unexpected=value` }),
        validOptions(fetcher),
      ),
    ).rejects.toThrow()
    await expect(
      validateSteamAssertion(
        assertion({
          'openid.signed':
            'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle,extra',
        }),
        validOptions(fetcher),
      ),
    ).rejects.toThrow()
    await expect(
      validateSteamAssertion(assertion({ 'openid.sig': 'x'.repeat(5000) }), validOptions(fetcher)),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('accepts a nonce at the D1 limit but rejects one character beyond it', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('is_valid:true\n', { status: 200 })),
    )
    const noncePrefix = '2026-08-19T11:55:00Z-'
    const nonceAtLimit = `${noncePrefix}${'n'.repeat(512 - noncePrefix.length)}`
    const nonceOverLimit = `${noncePrefix}${'o'.repeat(513 - noncePrefix.length)}`

    await expect(
      validateSteamAssertion(
        assertion({ 'openid.response_nonce': nonceAtLimit }),
        validOptions(fetcher),
      ),
    ).resolves.toMatchObject({ responseNonce: nonceAtLimit })
    await expect(
      validateSteamAssertion(
        assertion({ 'openid.response_nonce': nonceOverLimit }),
        validOptions(fetcher),
      ),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('rejects a replayed nonce even when the remote assertion is otherwise valid', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('is_valid:true\n')))
    const replayGuard = createSteamNonceReplayGuard()
    const options = validOptions(fetcher, replayGuard)

    await expect(validateSteamAssertion(assertion(), options)).resolves.toMatchObject({ steamId })
    await expect(validateSteamAssertion(assertion(), options)).rejects.toThrow(/replay/i)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('rejects assertions that Steam does not confirm', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('is_valid:false\n', { status: 200 })),
    )

    await expect(validateSteamAssertion(assertion(), validOptions(fetcher))).rejects.toThrow()
  })
})
