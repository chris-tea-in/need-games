import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import { applyBetaMigrations } from './apply-beta-migrations.js'

const validHash = 'a'.repeat(64)

async function insertUser(
  id: string,
  steamId: string,
  options: {
    displayName?: string | null
    profileStatus?: string
  } = {},
): Promise<void> {
  const displayName = options.displayName === undefined ? 'Steam User' : options.displayName
  const profileStatus = options.profileStatus ?? 'verified'

  await env.NEED_GAMES_DB.prepare(
    `INSERT INTO users (
      id, steam_id, steam_display_name, profile_lookup_status,
      profile_checked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, steamId, displayName, profileStatus, 1_755_648_000, 1_755_648_000)
    .run()
}

describe('Steam identity and session D1 schema', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('creates only the approved identity, transaction, and session columns', async () => {
    const expectedColumns = {
      sessions: ['token_hash', 'user_id', 'created_at', 'expires_at', 'revoked_at'],
      steam_login_transactions: [
        'token_hash',
        'return_path',
        'created_at',
        'expires_at',
        'consumed_at',
        'steam_response_nonce',
      ],
      users: [
        'id',
        'steam_id',
        'steam_display_name',
        'profile_lookup_status',
        'profile_checked_at',
        'created_at',
      ],
    } as const

    for (const [table, expected] of Object.entries(expectedColumns)) {
      const columns = await env.NEED_GAMES_DB.prepare(`PRAGMA table_info(${table})`).all<{
        name: string
      }>()

      expect(columns.results.map((column) => column.name)).toEqual(expected)
      expect(columns.results.map((column) => column.name)).not.toEqual(
        expect.arrayContaining(['token', 'csrf_token', 'csrf_token_hash', 'steam_api_key']),
      )
    }
  })

  test.each([
    ['765611980000000', '76561198000000011'],
    ['765611980000000000', '76561198000000012'],
    ['76561198000000abc', '76561198000000013'],
  ])('rejects invalid SteamID %s', async (steamId, controlSteamId) => {
    await insertUser(`valid-control-${controlSteamId}`, controlSteamId)
    await expect(insertUser(`invalid-${steamId}`, steamId)).rejects.toThrow()
  })

  test('enforces one internal user per SteamID', async () => {
    await insertUser('unique-steam-user-1', '76561198000000001')

    await expect(insertUser('unique-steam-user-2', '76561198000000001')).rejects.toThrow()
  })

  test('enforces profile states and keeps an unavailable stale name private by state', async () => {
    await expect(
      insertUser('invalid-profile-state', '76561198000000002', {
        profileStatus: 'stale',
      }),
    ).rejects.toThrow()

    await expect(
      insertUser('verified-without-name', '76561198000000003', {
        displayName: null,
      }),
    ).rejects.toThrow()

    await expect(
      insertUser('unavailable-with-stale-name', '76561198000000004', {
        displayName: 'Previous Name',
        profileStatus: 'unavailable',
      }),
    ).resolves.toBeUndefined()
  })

  test('enforces token hashes, safe return paths, expiry order, and nonce uniqueness', async () => {
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO steam_login_transactions (
          token_hash, return_path, created_at, expires_at
        ) VALUES (?, ?, ?, ?)`,
      )
        .bind('plaintext-token', '/games/counter-strike-2', 100, 700)
        .run(),
    ).rejects.toThrow()

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO steam_login_transactions (
          token_hash, return_path, created_at, expires_at
        ) VALUES (?, ?, ?, ?)`,
      )
        .bind('b'.repeat(64), 'https://example.com/steal', 100, 700)
        .run(),
    ).rejects.toThrow()

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO steam_login_transactions (
          token_hash, return_path, created_at, expires_at
        ) VALUES (?, ?, ?, ?)`,
      )
        .bind('c'.repeat(64), '/games/counter-strike-2', 700, 700)
        .run(),
    ).rejects.toThrow()

    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO steam_login_transactions (
        token_hash, return_path, created_at, expires_at, consumed_at, steam_response_nonce
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind('d'.repeat(64), '/games/counter-strike-2', 100, 700, 200, 'nonce-1')
      .run()

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO steam_login_transactions (
          token_hash, return_path, created_at, expires_at, consumed_at, steam_response_nonce
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind('e'.repeat(64), '/', 100, 700, 200, 'nonce-1')
        .run(),
    ).rejects.toThrow()
  })

  test('enforces session ownership and expiry while cascading user deletion', async () => {
    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind('f'.repeat(64), 'missing-user', 100, 200)
        .run(),
    ).rejects.toThrow()

    await insertUser('session-user', '76561198000000005')

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind('not-a-hash', 'session-user', 100, 200)
        .run(),
    ).rejects.toThrow()

    await expect(
      env.NEED_GAMES_DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(validHash, 'session-user', 200, 200)
        .run(),
    ).rejects.toThrow()

    await env.NEED_GAMES_DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(validHash, 'session-user', 100, 200)
      .run()

    await env.NEED_GAMES_DB.prepare('DELETE FROM users WHERE id = ?').bind('session-user').run()

    const remaining = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?',
    )
      .bind('session-user')
      .first<{ count: number }>()
    expect(remaining?.count).toBe(0)
  })

  test('indexes expiry and user session queries without migration triggers', async () => {
    const transactionIndexes = await env.NEED_GAMES_DB.prepare(
      'PRAGMA index_list(steam_login_transactions)',
    ).all<{ name: string }>()
    const sessionIndexes = await env.NEED_GAMES_DB.prepare('PRAGMA index_list(sessions)').all<{
      name: string
    }>()
    const sessionColumns = await env.NEED_GAMES_DB.prepare('PRAGMA table_info(sessions)').all<{
      name: string
      pk: number
    }>()
    const migrationTriggers = await env.NEED_GAMES_DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger'
         AND tbl_name IN ('users', 'steam_login_transactions', 'sessions')`,
    ).all<{ name: string }>()

    expect(transactionIndexes.results.map((index) => index.name)).toContain(
      'steam_login_transactions_expiry_idx',
    )
    expect(sessionIndexes.results.map((index) => index.name)).toEqual(
      expect.arrayContaining(['sessions_expiry_idx', 'sessions_user_idx']),
    )
    expect(sessionColumns.results.find((column) => column.name === 'token_hash')?.pk).toBe(1)
    expect(migrationTriggers.results).toEqual([])
  })
})
