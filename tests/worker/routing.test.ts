import { SELF, env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import { applyBetaMigrations } from './apply-beta-migrations.js'

describe('Worker routing boundary', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('returns JSON for a browser navigation to an API route instead of SPA HTML', async () => {
    const response = await SELF.fetch('https://need-games.test/api/games/not-a-game', {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'game_not_found' },
    })
  })

  test('returns a JSON API error for an unknown API route', async () => {
    const response = await SELF.fetch('https://need-games.test/api/unknown', {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'game_not_found' },
    })
  })

  test('allows only GET and HEAD on API routes', async () => {
    const methodNotAllowed = await SELF.fetch('https://need-games.test/api/catalog', {
      method: 'POST',
    })
    const headResponse = await SELF.fetch('https://need-games.test/api/catalog', { method: 'HEAD' })

    expect(methodNotAllowed.status).toBe(405)
    expect(methodNotAllowed.headers.get('allow')).toBe('GET, HEAD')
    expect(methodNotAllowed.headers.get('content-type')).toContain('application/json')
    await expect(methodNotAllowed.json()).resolves.toMatchObject({
      error: { code: 'invalid_query' },
    })
    expect(headResponse.status).toBe(200)
    expect(headResponse.headers.get('content-type')).toContain('application/json')
    await expect(headResponse.text()).resolves.toBe('')
  })
})
