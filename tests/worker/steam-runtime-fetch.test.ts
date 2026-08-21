import { SELF } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'

import { validateSteamAssertion } from '../../src/worker/auth/steam-openid.js'

const callbackUrl = 'https://myplayprint.e9k.workers.dev/api/auth/steam/callback'
const steamId = '76561198000000001'
const now = Date.parse('2026-08-19T12:00:00.000Z')

function assertion(): URLSearchParams {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': callbackUrl,
    'openid.response_nonce': '2026-08-19T11:55:00Z-runtime-boundary',
    'openid.assoc_handle': 'handle-1',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'encoded-signature',
  })
}

describe('Steam fetch runtime boundary', () => {
  test('lets pinned workerd parse the confirmation fetch options at a local destination', async () => {
    const runtimeFetcher: typeof fetch = async (_input, init) => {
      await SELF.fetch(new Request('https://need-games.test/api/session', init))
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', {
        status: 200,
      })
    }

    await expect(
      runtimeFetcher('https://local.test', { method: 'GET', redirect: 'manual' }),
    ).resolves.toMatchObject({ status: 200 })

    await expect(
      validateSteamAssertion(assertion(), {
        callbackUrl,
        expectedOrigin: 'https://myplayprint.e9k.workers.dev',
        expectedReturnTo: callbackUrl,
        now,
        fetcher: runtimeFetcher,
      }),
    ).resolves.toMatchObject({ steamId })

    const response = await SELF.fetch('https://need-games.test/api/session')
    expect(response.status).toBe(200)
  })
})
