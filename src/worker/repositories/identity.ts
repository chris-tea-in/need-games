import { isValidSteamId, STEAM_OPENID_RESPONSE_NONCE_MAX_LENGTH } from '../auth/steam-openid.js'
import { validateSteamPersonaname } from '../auth/steam-profile.js'
import { constantTimeEqual, isTokenHash } from '../auth/token-hash.js'

import {
  SESSION_LIFETIME_SECONDS,
  STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS,
} from '../../shared/session-contract.js'
import type { ProfileLookupStatus } from '../../shared/session-contract.js'

const DEFAULT_CLEANUP_LIMIT = 100
const MAX_CLEANUP_LIMIT = 500

interface LoginTransactionRow {
  return_path: string
  created_at: number
  expires_at: number
  consumed_at: number
  steam_response_nonce: string
}

interface StoredLoginTransactionRow {
  return_path: string
  created_at: number
  expires_at: number
  consumed_at: number | null
  steam_response_nonce: string | null
}

interface UserRow {
  id: string
  steam_id: string
  steam_display_name: string | null
  profile_lookup_status: ProfileLookupStatus
  profile_checked_at: number
  created_at: number
}

interface SessionRow {
  token_hash: string
  user_id: string
  created_at: number
  expires_at: number
  revoked_at: number | null
  steam_display_name: string | null
  profile_lookup_status: ProfileLookupStatus
}

export interface CreateLoginTransactionInput {
  tokenHash: string
  returnPath: string
  createdAt: number
  expiresAt?: number
}

export interface LoginTransaction {
  returnPath: string
  createdAt: number
  expiresAt: number
  consumedAt: number | null
  steamResponseNonce: string | null
}

/** Read the stored return path so rejected callbacks can fail safely in place. */
export async function getLoginTransaction(
  database: D1Database,
  tokenHash: string,
): Promise<LoginTransaction | null> {
  if (!isTokenHash(tokenHash)) {
    return null
  }

  const row = await database
    .prepare(
      `SELECT return_path, created_at, expires_at,
              consumed_at, steam_response_nonce
       FROM steam_login_transactions
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<StoredLoginTransactionRow>()

  if (row === null) {
    return null
  }

  return {
    returnPath: row.return_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    steamResponseNonce: row.steam_response_nonce,
  }
}

/** Invalidate an unconsumed transaction after a failed or cancelled callback. */
export async function invalidateLoginTransaction(
  database: D1Database,
  tokenHash: string,
  now: number,
): Promise<boolean> {
  if (!isTokenHash(tokenHash)) {
    return false
  }
  assertTimestamp(now, 'The transaction invalidation time')

  const result = await database
    .prepare(
      `UPDATE steam_login_transactions
       SET consumed_at = ?
       WHERE token_hash = ?
         AND consumed_at IS NULL`,
    )
    .bind(now, tokenHash)
    .run()
  return result.meta.changes === 1
}

export interface UserRecord {
  id: string
  steamId: string
  steamDisplayName: string | null
  profileLookupStatus: ProfileLookupStatus
  profileCheckedAt: number
  createdAt: number
}

export interface UpsertUserOptions {
  userId?: string
  now: number
}

export interface UserProfileUpdate {
  status: ProfileLookupStatus
  personaname: string | null
  checkedAt: number
}

export interface PublicUserProfile {
  id: string
  displayName: string | null
  profileLookupStatus: ProfileLookupStatus
}

export interface CreateSessionInput {
  tokenHash: string
  userId: string
  createdAt: number
  expiresAt?: number
}

export interface SessionRecord {
  id: string
  userId: string
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  profile: {
    displayName: string | null
    profileLookupStatus: ProfileLookupStatus
  }
}

export interface CleanupResult {
  transactions: number
  sessions: number
}

function assertHash(value: string, label: string): void {
  if (!isTokenHash(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 hash.`)
  }
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`)
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function assertSafeReturnPath(value: string): void {
  if (
    value.length === 0 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasControlCharacters(value)
  ) {
    throw new TypeError('The login return path must be a safe relative path.')
  }
}

function assertNonce(value: string): void {
  if (
    value.length < 1 ||
    value.length > STEAM_OPENID_RESPONSE_NONCE_MAX_LENGTH ||
    hasControlCharacters(value)
  ) {
    throw new TypeError('The Steam response nonce is invalid.')
  }
}

function assertUserId(value: string): void {
  if (value.length === 0 || value.length > 256 || hasControlCharacters(value)) {
    throw new TypeError('The internal user ID is invalid.')
  }
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    steamId: row.steam_id,
    steamDisplayName: row.steam_display_name,
    profileLookupStatus: row.profile_lookup_status,
    profileCheckedAt: row.profile_checked_at,
    createdAt: row.created_at,
  }
}

function normalizeCleanupLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_CLEANUP_LIMIT
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('The cleanup limit must be a positive integer.')
  }
  return Math.min(MAX_CLEANUP_LIMIT, limit)
}

export async function createLoginTransaction(
  database: D1Database,
  input: CreateLoginTransactionInput,
): Promise<void> {
  assertHash(input.tokenHash, 'The login transaction token hash')
  assertSafeReturnPath(input.returnPath)
  assertTimestamp(input.createdAt, 'The login transaction creation time')
  const expiresAt = input.expiresAt ?? input.createdAt + STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS
  assertTimestamp(expiresAt, 'The login transaction expiry time')
  if (expiresAt <= input.createdAt) {
    throw new TypeError('The login transaction must expire after creation.')
  }

  await database
    .prepare(
      `INSERT INTO steam_login_transactions
       (token_hash, return_path, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.tokenHash, input.returnPath, input.createdAt, expiresAt)
    .run()
}

/**
 * Atomically claim a fresh login transaction and persist the callback nonce.
 * The conditional update is the single-use boundary: a concurrent callback can
 * never observe a second successful claim for the same token hash.
 */
export async function consumeLoginTransaction(
  database: D1Database,
  tokenHash: string,
  steamResponseNonce: string,
  now: number,
): Promise<LoginTransaction | null> {
  if (!isTokenHash(tokenHash)) {
    return null
  }
  assertNonce(steamResponseNonce)
  assertTimestamp(now, 'The transaction consumption time')

  const result = await database
    .prepare(
      `UPDATE steam_login_transactions
       SET consumed_at = ?, steam_response_nonce = ?
       WHERE token_hash = ?
         AND consumed_at IS NULL
         AND steam_response_nonce IS NULL
         AND expires_at > ?
         AND NOT EXISTS (
           SELECT 1
           FROM steam_login_transactions
           WHERE steam_response_nonce = ?
         )
       RETURNING return_path, created_at, expires_at, consumed_at, steam_response_nonce`,
    )
    .bind(now, steamResponseNonce, tokenHash, now, steamResponseNonce)
    .all<LoginTransactionRow>()

  const row = result.results[0]
  if (row === undefined) {
    return null
  }

  return {
    returnPath: row.return_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    steamResponseNonce: row.steam_response_nonce,
  }
}

export async function getUserBySteamId(
  database: D1Database,
  steamId: string,
): Promise<UserRecord | null> {
  if (!isValidSteamId(steamId)) {
    return null
  }
  const row = await database
    .prepare(
      `SELECT id, steam_id, steam_display_name, profile_lookup_status,
              profile_checked_at, created_at
       FROM users
       WHERE steam_id = ?
       LIMIT 1`,
    )
    .bind(steamId)
    .first<UserRow>()
  return row === null ? null : toUser(row)
}

export async function getUserById(
  database: D1Database,
  userId: string,
): Promise<UserRecord | null> {
  assertUserId(userId)
  const row = await database
    .prepare(
      `SELECT id, steam_id, steam_display_name, profile_lookup_status,
              profile_checked_at, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first<UserRow>()
  return row === null ? null : toUser(row)
}

/** Insert the internal user once; a unique SteamID makes repeated callbacks idempotent. */
export async function upsertUserBySteamId(
  database: D1Database,
  steamId: string,
  options: UpsertUserOptions,
): Promise<UserRecord> {
  if (!isValidSteamId(steamId)) {
    throw new TypeError('The SteamID is invalid.')
  }
  assertTimestamp(options.now, 'The user creation time')
  const userId = options.userId ?? crypto.randomUUID()
  assertUserId(userId)

  await database
    .prepare(
      `INSERT INTO users (
         id, steam_id, steam_display_name, profile_lookup_status,
         profile_checked_at, created_at
       ) VALUES (?, ?, NULL, 'unavailable', ?, ?)
       ON CONFLICT (steam_id) DO NOTHING`,
    )
    .bind(userId, steamId, options.now, options.now)
    .run()

  const user = await getUserBySteamId(database, steamId)
  if (user === null) {
    throw new Error('The Steam identity could not be persisted.')
  }
  return user
}

export async function synchronizeUserProfile(
  database: D1Database,
  userId: string,
  profile: UserProfileUpdate,
): Promise<UserRecord | null> {
  assertUserId(userId)
  assertTimestamp(profile.checkedAt, 'The profile checked time')
  if (profile.status !== 'verified' && profile.status !== 'unavailable') {
    throw new TypeError('The profile lookup status is invalid.')
  }
  if (profile.status === 'verified') {
    const validatedName = validateSteamPersonaname(profile.personaname)
    if (validatedName === null) {
      throw new TypeError('A verified profile requires a display name.')
    }
    profile = { ...profile, personaname: validatedName }
  } else {
    profile = { ...profile, personaname: null }
  }

  const row = await database
    .prepare(
      `UPDATE users
       SET steam_display_name = CASE
             WHEN ? = 'verified' THEN ?
             ELSE steam_display_name
           END,
           profile_lookup_status = ?,
           profile_checked_at = ?
       WHERE id = ?
       RETURNING id, steam_id, steam_display_name, profile_lookup_status,
                 profile_checked_at, created_at`,
    )
    .bind(profile.status, profile.personaname, profile.status, profile.checkedAt, userId)
    .first<UserRow>()

  return row === null ? null : toUser(row)
}

export async function getPublicUserProfile(
  database: D1Database,
  userId: string,
): Promise<PublicUserProfile | null> {
  const user = await getUserById(database, userId)
  if (user === null) {
    return null
  }
  return {
    id: user.id,
    displayName: user.profileLookupStatus === 'verified' ? user.steamDisplayName : null,
    profileLookupStatus: user.profileLookupStatus,
  }
}

export async function createSession(
  database: D1Database,
  input: CreateSessionInput,
): Promise<void> {
  assertHash(input.tokenHash, 'The session token hash')
  assertUserId(input.userId)
  assertTimestamp(input.createdAt, 'The session creation time')
  const expiresAt = input.expiresAt ?? input.createdAt + SESSION_LIFETIME_SECONDS
  assertTimestamp(expiresAt, 'The session expiry time')
  if (expiresAt <= input.createdAt) {
    throw new TypeError('The session must expire after creation.')
  }

  await database
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.tokenHash, input.userId, input.createdAt, expiresAt)
    .run()
}

export async function readSession(
  database: D1Database,
  tokenHash: string,
  now: number,
): Promise<SessionRecord | null> {
  if (!isTokenHash(tokenHash)) {
    return null
  }
  assertTimestamp(now, 'The session read time')
  const row = await database
    .prepare(
      `SELECT sessions.token_hash, sessions.user_id, sessions.created_at,
              sessions.expires_at, sessions.revoked_at,
              users.steam_display_name, users.profile_lookup_status
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > ?
       LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<SessionRow>()

  if (row === null || !constantTimeEqual(row.token_hash, tokenHash)) {
    return null
  }
  return {
    id: row.token_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    profile: {
      displayName: row.profile_lookup_status === 'verified' ? row.steam_display_name : null,
      profileLookupStatus: row.profile_lookup_status,
    },
  }
}

export async function revokeSession(
  database: D1Database,
  tokenHash: string,
  revokedAt: number,
): Promise<boolean> {
  if (!isTokenHash(tokenHash)) {
    return false
  }
  assertTimestamp(revokedAt, 'The session revocation time')
  const result = await database
    .prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE token_hash = ?
         AND revoked_at IS NULL`,
    )
    .bind(revokedAt, tokenHash)
    .run()
  return result.meta.changes === 1
}

export async function cleanupExpiredAuthRows(
  database: D1Database,
  now: number,
  limit?: number,
): Promise<CleanupResult> {
  assertTimestamp(now, 'The cleanup time')
  const boundedLimit = normalizeCleanupLimit(limit)
  const results = await database.batch([
    database
      .prepare(
        `DELETE FROM steam_login_transactions
         WHERE rowid IN (
           SELECT rowid FROM steam_login_transactions
           WHERE expires_at <= ?
           ORDER BY expires_at ASC
           LIMIT ?
         )`,
      )
      .bind(now, boundedLimit),
    database
      .prepare(
        `DELETE FROM sessions
         WHERE rowid IN (
           SELECT rowid FROM sessions
           WHERE expires_at <= ?
           ORDER BY expires_at ASC
           LIMIT ?
         )`,
      )
      .bind(now, boundedLimit),
  ])
  return {
    transactions: results[0]?.meta.changes ?? 0,
    sessions: results[1]?.meta.changes ?? 0,
  }
}

// Stable aliases keep the repository vocabulary readable at route call sites.
export const getSession = readSession
export const revokeAuthSession = revokeSession
export const cleanupExpiredRows = cleanupExpiredAuthRows
export const upsertUser = upsertUserBySteamId
export const updateUserProfile = synchronizeUserProfile
