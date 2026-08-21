import { describe, expect, test } from 'vitest'

type SecretListAssertion = (secretList: unknown) => void

describe('production authentication secret boundary', () => {
  test('requires both encrypted auth secret names and rejects value-bearing output', async () => {
    const productionRelease = (await import('../scripts/release-production.mjs')) as Record<
      string,
      unknown
    >
    const assertion = productionRelease.assertProductionSecretList

    expect(assertion).toBeTypeOf('function')
    if (typeof assertion !== 'function') return

    const assertSecretList = assertion as SecretListAssertion
    expect(() =>
      assertSecretList([
        { name: 'STEAM_WEB_API_KEY', type: 'secret_text' },
        { name: 'CSRF_HMAC_SECRET', type: 'secret_text' },
      ]),
    ).not.toThrow()

    expect(() => assertSecretList([{ name: 'STEAM_WEB_API_KEY', type: 'secret_text' }])).toThrow(
      /required production secrets/i,
    )
    expect(() =>
      assertSecretList([
        { name: 'STEAM_WEB_API_KEY', type: 'secret_text', value: 'must-not-be-returned' },
        { name: 'CSRF_HMAC_SECRET', type: 'secret_text' },
      ]),
    ).toThrow(/secret value/i)
  })
})
