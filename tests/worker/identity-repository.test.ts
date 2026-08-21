import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupExpiredAuthRows,
  consumeLoginTransaction,
  createLoginTransaction,
  createSession,
  getPublicUserProfile,
  getUserBySteamId,
  readSession,
  revokeSession,
  synchronizeUserProfile,
  upsertUserBySteamId,
} from '../../src/worker/repositories/identity.js'
import { applyBetaMigrations } from './apply-beta-migrations.js'

const steamId = '76561198000000111'
const secondSteamId = '76561198000000112'
const transactionHash = '1'.repeat(64)
const sessionHash = '2'.repeat(64)

describe('identity and session repositories', () => {
  beforeAll(async () => {
    await applyBetaMigrations(env.NEED_GAMES_DB)
  })

  test('creates a login transaction and consumes it once with its callback nonce', async () => {
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash: transactionHash,
      returnPath: '/games/elden-ring',
      createdAt: 1_800_000_000,
    })

    const consumed = await consumeLoginTransaction(
      env.NEED_GAMES_DB,
      transactionHash,
      'callback-nonce-1',
      1_800_000_001,
    )

    expect(consumed).toEqual({
      returnPath: '/games/elden-ring',
      createdAt: 1_800_000_000,
      expiresAt: 1_800_000_600,
      consumedAt: 1_800_000_001,
      steamResponseNonce: 'callback-nonce-1',
    })
    await expect(
      consumeLoginTransaction(
        env.NEED_GAMES_DB,
        transactionHash,
        'callback-nonce-1',
        1_800_000_002,
      ),
    ).resolves.toBeNull()
  })

  test('allows only one of concurrent callbacks to consume a transaction and create a session', async () => {
    const concurrentTransactionHash = '3'.repeat(64)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash: concurrentTransactionHash,
      returnPath: '/',
      createdAt: 1_800_000_010,
    })
    const user = await upsertUserBySteamId(env.NEED_GAMES_DB, secondSteamId, {
      userId: 'identity-user-concurrent',
      now: 1_800_000_010,
    })

    const results = await Promise.all([
      consumeLoginTransaction(
        env.NEED_GAMES_DB,
        concurrentTransactionHash,
        'concurrent-nonce',
        1_800_000_011,
      ),
      consumeLoginTransaction(
        env.NEED_GAMES_DB,
        concurrentTransactionHash,
        'concurrent-nonce',
        1_800_000_011,
      ),
    ])
    const successful = results.filter((result) => result !== null)
    expect(successful).toHaveLength(1)

    if (successful.length === 1) {
      await createSession(env.NEED_GAMES_DB, {
        tokenHash: sessionHash,
        userId: user.id,
        createdAt: 1_800_000_011,
      })
    }
    const sessionCount = await env.NEED_GAMES_DB.prepare(
      'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?',
    )
      .bind(user.id)
      .first<{ count: number }>()
    expect(sessionCount?.count).toBe(1)
  })

  test('upserts by unique SteamID and records verified then unavailable profile state safely', async () => {
    const first = await upsertUserBySteamId(env.NEED_GAMES_DB, steamId, {
      userId: 'identity-user-1',
      now: 1_800_000_100,
    })
    const repeated = await upsertUserBySteamId(env.NEED_GAMES_DB, steamId, {
      userId: 'identity-user-ignored',
      now: 1_800_000_100,
    })

    expect(repeated.id).toBe(first.id)
    await synchronizeUserProfile(env.NEED_GAMES_DB, first.id, {
      status: 'verified',
      personaname: '  Verified Player  ',
      checkedAt: 1_800_000_101,
    })
    await expect(getPublicUserProfile(env.NEED_GAMES_DB, first.id)).resolves.toEqual({
      id: first.id,
      displayName: 'Verified Player',
      profileLookupStatus: 'verified',
    })

    await synchronizeUserProfile(env.NEED_GAMES_DB, first.id, {
      status: 'unavailable',
      personaname: null,
      checkedAt: 1_800_000_102,
    })
    await expect(getPublicUserProfile(env.NEED_GAMES_DB, first.id)).resolves.toEqual({
      id: first.id,
      displayName: null,
      profileLookupStatus: 'unavailable',
    })
    const privateName = await env.NEED_GAMES_DB.prepare(
      'SELECT steam_display_name FROM users WHERE id = ?',
    )
      .bind(first.id)
      .first<{ steam_display_name: string | null }>()
    expect(privateName?.steam_display_name).toBe('Verified Player')
  })

  test('reads only active sessions and revokes them without deleting the user', async () => {
    const user = await getUserBySteamId(env.NEED_GAMES_DB, secondSteamId)
    expect(user).not.toBeNull()
    await expect(readSession(env.NEED_GAMES_DB, sessionHash, 1_800_000_011)).resolves.toEqual({
      id: sessionHash,
      userId: user?.id,
      createdAt: 1_800_000_011,
      expiresAt: 1_800_604_811,
      revokedAt: null,
      profile: {
        displayName: null,
        profileLookupStatus: 'unavailable',
      },
    })

    await expect(revokeSession(env.NEED_GAMES_DB, sessionHash, 1_800_000_012)).resolves.toBe(true)
    await expect(readSession(env.NEED_GAMES_DB, sessionHash, 1_800_000_013)).resolves.toBeNull()
    await expect(getUserBySteamId(env.NEED_GAMES_DB, steamId)).resolves.not.toBeNull()
  })

  test('cleans expired rows with a per-table bound', async () => {
    for (const [index, hash] of ['4', '5', '6'].entries()) {
      await createLoginTransaction(env.NEED_GAMES_DB, {
        tokenHash: hash.repeat(64),
        returnPath: '/',
        createdAt: 1_700_000_000 + index,
        expiresAt: 1_700_000_010 + index,
      })
    }
    const user = await getUserBySteamId(env.NEED_GAMES_DB, steamId)
    expect(user).not.toBeNull()
    for (const [index, hash] of ['7', '8', '9'].entries()) {
      await createSession(env.NEED_GAMES_DB, {
        tokenHash: hash.repeat(64),
        userId: user?.id ?? '',
        createdAt: 1_700_000_000 + index,
        expiresAt: 1_700_000_010 + index,
      })
    }

    await expect(cleanupExpiredAuthRows(env.NEED_GAMES_DB, 1_700_000_100, 2)).resolves.toEqual({
      transactions: 2,
      sessions: 2,
    })
    const remaining = await env.NEED_GAMES_DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM steam_login_transactions WHERE expires_at <= ?) AS transactions,
         (SELECT COUNT(*) FROM sessions WHERE expires_at <= ?) AS sessions`,
    )
      .bind(1_700_000_100, 1_700_000_100)
      .first<{ transactions: number; sessions: number }>()
    expect(remaining).toEqual({ transactions: 1, sessions: 1 })
  })
})
