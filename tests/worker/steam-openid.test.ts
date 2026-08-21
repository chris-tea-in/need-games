import { describe, expect, test, vi } from 'vitest'

import {
  createSteamNonceReplayGuard,
  validateSteamAssertion,
} from '../../src/worker/auth/steam-openid.js'

const callbackUrl = 'https://myplayprint.e9k.workers.dev/api/auth/steam/callback'
const steamId = '76561198000000001'
const now = Date.parse('2026-08-19T12:00:00.000Z')

// These OpenID wire values are deliberately independent from the adapter exports.
const specificationNamespace = 'http://specs.openid.net/auth/2.0'
const specificationEndpoint = 'https://steamcommunity.com/openid/login'

function specificationAssertion(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': specificationNamespace,
    'openid.mode': 'id_res',
    'openid.op_endpoint': specificationEndpoint,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': `${callbackUrl}?state=${'S'.repeat(43)}`,
    'openid.response_nonce': '2026-08-19T11:55:00Z-provider-contract',
    'openid.assoc_handle': 'handle-1',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'encoded-signature',
    state: 'S'.repeat(43),
    ...overrides,
  })
}

function assertion(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': specificationNamespace,
    'openid.mode': 'id_res',
    'openid.op_endpoint': specificationEndpoint,
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
  test('forwards a specification-correct Steam assertion to confirmation without application state', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      expect(input).toBe(specificationEndpoint)
      const body = new URLSearchParams(
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : '',
      )
      expect(body.get('openid.return_to')).toBe(`${callbackUrl}?state=${'S'.repeat(43)}`)
      expect(body.get('state')).toBeNull()
      expect(body.get('openid.mode')).toBe('check_authentication')
      return Promise.resolve(
        new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 }),
      )
    })

    await expect(
      validateSteamAssertion(specificationAssertion(), {
        ...validOptions(fetcher),
        expectedReturnTo: `${callbackUrl}?state=${'S'.repeat(43)}`,
      }),
    ).resolves.toMatchObject({ steamId })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('rejects the HTTPS namespace variant before confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      validateSteamAssertion(
        specificationAssertion({ 'openid.ns': 'https://specs.openid.net/auth/2.0' }),
        {
          ...validOptions(fetcher),
          expectedReturnTo: `${callbackUrl}?state=${'S'.repeat(43)}`,
        },
      ),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('accepts an additional signed extension field with one corresponding assertion field', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('is_valid:true\n')))
    const fields = specificationAssertion({
      'openid.signed':
        'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle,ax.type.email',
      'openid.ax.type.email': 'http://axschema.org/contact/email',
    })

    await expect(
      validateSteamAssertion(fields, {
        ...validOptions(fetcher),
        expectedReturnTo: `${callbackUrl}?state=${'S'.repeat(43)}`,
      }),
    ).resolves.toMatchObject({ steamId })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('accepts a bounded optional OpenID field without weakening required signed fields', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('is_valid:true\n')))

    await expect(
      validateSteamAssertion(
        specificationAssertion({ 'openid.invalidate_handle': 'obsolete-association' }),
        {
          ...validOptions(fetcher),
          expectedReturnTo: `${callbackUrl}?state=${'S'.repeat(43)}`,
        },
      ),
    ).resolves.toMatchObject({ steamId })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('validates the assertion and confirms it with Steam check_authentication', async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      expect(_input).toBe(specificationEndpoint)
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('manual')
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
        new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 }),
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

  test('rejects mismatched callback URLs and oversized fields', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      validateSteamAssertion(
        assertion({ 'openid.return_to': `${callbackUrl}?unexpected=value` }),
        validOptions(fetcher),
      ),
    ).rejects.toThrow()
    await expect(
      validateSteamAssertion(assertion({ 'openid.sig': 'x'.repeat(5000) }), validOptions(fetcher)),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('requires the transaction state in the exact signed return_to URL', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('is_valid:true\n')))
    const state = 'S'.repeat(43)
    const expectedReturnTo = `${callbackUrl}?state=${state}`
    const options = {
      ...validOptions(fetcher),
      expectedReturnTo,
    }

    await expect(
      validateSteamAssertion(
        assertion({
          state,
          'openid.return_to': expectedReturnTo,
        }),
        options,
      ),
    ).resolves.toMatchObject({ returnTo: expectedReturnTo })

    await expect(
      validateSteamAssertion(
        assertion({
          state,
          'openid.return_to': callbackUrl,
        }),
        { ...options, replayGuard: createSteamNonceReplayGuard() },
      ),
    ).rejects.toThrow()
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

  test('rejects a redirect response from the Steam confirmation endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(null, { status: 302, headers: { Location: 'https://example.test' } }),
      ),
    )

    await expect(validateSteamAssertion(assertion(), validOptions(fetcher))).rejects.toMatchObject({
      code: 'steam_confirmation_failed',
    })
  })

  test('aborts confirmation when Steam does not finish its response body', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>((_input, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                )
              },
            }),
            { status: 200 },
          ),
        ),
      )

      let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'
      const validation = validateSteamAssertion(assertion(), validOptions(fetcher)).then(
        (result) => {
          outcome = 'resolved'
          return result
        },
        (error: unknown) => {
          outcome = 'rejected'
          return error
        },
      )

      await vi.advanceTimersByTimeAsync(4_999)
      expect(outcome).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      expect(outcome).toBe('rejected')

      await expect(validation).resolves.toMatchObject({
        code: 'steam_confirmation_failed',
      })
    } finally {
      vi.useRealTimers()
    }
  }, 1_000)

  test('rejects a present incorrect confirmation namespace but accepts an absent namespace', async () => {
    const incorrectNamespace = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('ns:https://specs.openid.net/auth/2.0\nis_valid:true\n')),
    )
    await expect(
      validateSteamAssertion(assertion(), validOptions(incorrectNamespace)),
    ).rejects.toThrow()

    const absentNamespace = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('is_valid:true\n')),
    )
    await expect(
      validateSteamAssertion(assertion(), validOptions(absentNamespace)),
    ).resolves.toMatchObject({
      steamId,
    })
  })

  test('rejects duplicate, empty, and missing required signed assertion fields before confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const duplicateReturnTo = specificationAssertion()
    duplicateReturnTo.append('openid.return_to', `${callbackUrl}?state=${'S'.repeat(43)}`)
    const emptyAssociation = specificationAssertion({ 'openid.assoc_handle': '' })
    const missingAssociation = specificationAssertion()
    missingAssociation.delete('openid.assoc_handle')

    for (const fields of [duplicateReturnTo, emptyAssociation, missingAssociation]) {
      await expect(
        validateSteamAssertion(fields, {
          ...validOptions(fetcher),
          expectedReturnTo: `${callbackUrl}?state=${'S'.repeat(43)}`,
        }),
      ).rejects.toThrow()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('keeps the ten-field validation floor without double-counting openid.signed', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('is_valid:true\n')))

    await expect(
      validateSteamAssertion(assertion(), {
        ...validOptions(fetcher),
        maxFieldCount: 10,
      }),
    ).resolves.toMatchObject({ steamId })

    await expect(
      validateSteamAssertion(assertion(), {
        ...validOptions(fetcher),
        maxFieldCount: 9,
      }),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
