import { isValidSteamId } from './steam-openid.js'

import type { ProfileLookupStatus } from '../../shared/session-contract.js'

export const STEAM_PROFILE_ENDPOINT =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2'

export const STEAM_PROFILE_MAX_ATTEMPTS = 2
export const STEAM_PROFILE_TIMEOUT_MS = 5_000
export const STEAM_PROFILE_MAX_RESPONSE_LENGTH = 64 * 1024
export const STEAM_DISPLAY_NAME_MAX_LENGTH = 64

export type SteamProfileLookupFailureReason =
  | 'invalid_steam_id'
  | 'invalid_api_key'
  | 'network_error'
  | 'timeout'
  | 'http_error'
  | 'rate_limited'
  | 'oversized_response'
  | 'malformed_json'
  | 'empty_player_list'
  | 'mismatched_steam_id'
  | 'invalid_personaname'

export interface SteamProfileLookupEvent {
  message: string
  reason: SteamProfileLookupFailureReason
  /** Present only when Steam returned a non-success HTTP response. */
  httpStatus?: number
  attempt: number
  attempts: number
}

export type SteamProfileLookupLogger = (event: SteamProfileLookupEvent) => void

// Cloudflare timers are numeric handles; keeping the seam numeric also makes the
// Worker module straightforward to exercise under Node's Timeout object typings.
type TimerHandle = number

export interface SteamProfileLookupOptions {
  /** The SteamID already verified by the Steam OpenID callback. */
  steamId: string
  /** The server-only Steam Web API credential. */
  apiKey: string
  /** Injectable network boundary; defaults to the Worker fetch implementation. */
  fetcher?: typeof fetch
  /** The maximum number of requests. It is always capped at two. */
  maxAttempts?: number
  /** Per-attempt timeout in milliseconds. */
  timeoutMs?: number
  /** Optional delay before the single retry. */
  retryDelayMs?: number
  /** Injectable retry delay boundary. */
  sleep?: (milliseconds: number) => Promise<void>
  /** Injectable timer boundary for deterministic timeout tests. */
  setTimeoutFn?: (callback: () => void, milliseconds: number) => TimerHandle
  clearTimeoutFn?: (handle: TimerHandle) => void
  /** Existing state used to decide whether a verified result must be persisted. */
  storedName?: string | null
  previousStatus?: ProfileLookupStatus
  /** Unix seconds or a Date used for profile_checked_at. */
  now?: number | Date
  logger?: SteamProfileLookupLogger
  onError?: SteamProfileLookupLogger
}

export interface SteamProfileVerifiedResult {
  status: 'verified'
  personaname: string
  checkedAt: number
  attempts: number
  shouldWrite: boolean
}

export interface SteamProfileUnavailableResult {
  status: 'unavailable'
  personaname: null
  checkedAt: number
  attempts: number
  shouldWrite: true
  reason: SteamProfileLookupFailureReason
  /** Present only when the final failed attempt received an HTTP response. */
  httpStatus?: number
}

export type SteamProfileLookupResult = SteamProfileVerifiedResult | SteamProfileUnavailableResult

class ProfileAttemptError extends Error {
  readonly reason: SteamProfileLookupFailureReason
  readonly httpStatus?: number

  constructor(reason: SteamProfileLookupFailureReason, httpStatus?: number) {
    super(reason)
    this.name = 'ProfileAttemptError'
    this.reason = reason
    this.httpStatus = httpStatus
  }
}

const timeoutMarker = new Error('steam-profile-timeout')

function epochSeconds(value: number | Date | undefined): number {
  const candidate = value instanceof Date ? value.getTime() : value
  if (candidate !== undefined && Number.isFinite(candidate)) {
    // Accept both the Worker-friendly Unix-second form and Date.now-style milliseconds.
    return Math.floor(candidate > 100_000_000_000 ? candidate / 1_000 : candidate)
  }
  return Math.floor(Date.now() / 1_000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        return true
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/** Return a trimmed, bounded Steam display name or null when it is unsafe to store. */
export function validateSteamPersonaname(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    hasUnpairedSurrogate(trimmed) ||
    /\p{Cc}/u.test(trimmed) ||
    Array.from(trimmed).length > STEAM_DISPLAY_NAME_MAX_LENGTH
  ) {
    return null
  }

  return trimmed
}

export const validateSteamDisplayName = validateSteamPersonaname

function normalizeAttempts(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return STEAM_PROFILE_MAX_ATTEMPTS
  }
  return Math.min(STEAM_PROFILE_MAX_ATTEMPTS, Math.max(1, Math.floor(value)))
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return STEAM_PROFILE_TIMEOUT_MS
  }
  return Math.max(1, Math.floor(value))
}

function unavailable(
  reason: SteamProfileLookupFailureReason,
  attempts: number,
  options: SteamProfileLookupOptions,
  httpStatus?: number,
): SteamProfileUnavailableResult {
  const checkedAt = epochSeconds(options.now)
  return {
    status: 'unavailable',
    personaname: null,
    checkedAt,
    attempts,
    shouldWrite: true,
    reason,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  }
}

function reportFailure(
  logger: SteamProfileLookupLogger | undefined,
  reason: SteamProfileLookupFailureReason,
  httpStatus: number | undefined,
  attempt: number,
  attempts: number,
): void {
  if (logger === undefined) {
    return
  }

  // Never pass through the URL, fetch error, response body, API key, or SteamID.
  const event: SteamProfileLookupEvent = {
    message: `Steam profile lookup unavailable (${reason}).`,
    reason,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    attempt,
    attempts,
  }
  try {
    logger(event)
  } catch {
    // Diagnostics must never turn optional profile enrichment into failed login.
  }
}

function parseProfilePayload(body: string, steamId: string): string {
  if (body.length > STEAM_PROFILE_MAX_RESPONSE_LENGTH) {
    throw new ProfileAttemptError('oversized_response')
  }

  let payload: unknown
  try {
    payload = JSON.parse(body) as unknown
  } catch {
    throw new ProfileAttemptError('malformed_json')
  }

  if (
    !isRecord(payload) ||
    !isRecord(payload.response) ||
    !Array.isArray(payload.response.players)
  ) {
    throw new ProfileAttemptError('empty_player_list')
  }

  const players = payload.response.players as unknown[]

  // One requested SteamID must yield exactly one matching player. Extra or mismatched
  // entries are rejected instead of allowing an attacker-controlled name through.
  if (players.length === 0) {
    throw new ProfileAttemptError('empty_player_list')
  }
  if (players.length !== 1) {
    throw new ProfileAttemptError('mismatched_steam_id')
  }

  const candidate = players[0]
  if (!isRecord(candidate) || candidate.steamid !== steamId) {
    throw new ProfileAttemptError('mismatched_steam_id')
  }

  const personaname = validateSteamPersonaname(candidate.personaname)
  if (personaname === null) {
    throw new ProfileAttemptError('invalid_personaname')
  }
  return personaname
}

async function runAttempt(options: SteamProfileLookupOptions, timeoutMs: number): Promise<string> {
  const fetcher = options.fetcher ?? globalThis.fetch
  const setTimeoutFn =
    options.setTimeoutFn ??
    ((callback: () => void, milliseconds: number) =>
      globalThis.setTimeout(callback, milliseconds) as unknown as TimerHandle)
  const clearTimeoutFn =
    options.clearTimeoutFn ??
    ((handle: TimerHandle) =>
      globalThis.clearTimeout(handle as unknown as ReturnType<typeof globalThis.setTimeout>))
  const controller = new AbortController()
  const url = new URL(STEAM_PROFILE_ENDPOINT)
  url.searchParams.set('key', options.apiKey)
  url.searchParams.set('steamids', options.steamId)

  const requestPromise = (async () => {
    let response: Response
    try {
      response = await fetcher(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch {
      throw new ProfileAttemptError('network_error')
    }

    if (response.status === 429) {
      throw new ProfileAttemptError('rate_limited', response.status)
    }
    if (!response.ok) {
      throw new ProfileAttemptError('http_error', response.status)
    }

    let body: string
    try {
      body = await response.text()
    } catch {
      throw new ProfileAttemptError('network_error')
    }
    return parseProfilePayload(body, options.steamId)
  })()

  let timeoutHandle: TimerHandle | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeoutFn(() => {
      controller.abort()
      reject(timeoutMarker)
    }, timeoutMs)
  })

  try {
    return await Promise.race([requestPromise, timeoutPromise])
  } catch (error) {
    if (error === timeoutMarker) {
      throw new ProfileAttemptError('timeout')
    }
    if (error instanceof ProfileAttemptError) {
      throw error
    }
    throw new ProfileAttemptError('network_error')
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeoutFn(timeoutHandle)
    }
    // A timed-out fetch may reject after this attempt has moved to its retry.
    void requestPromise.catch(() => undefined)
  }
}

/**
 * Refresh a verified Steam identity's display name without making profile lookup
 * part of authentication success. The retry budget is structurally capped at two.
 */
export async function synchronizeSteamProfile(
  options: SteamProfileLookupOptions,
): Promise<SteamProfileLookupResult> {
  const attemptsAllowed = normalizeAttempts(options.maxAttempts)
  const checkedAt = epochSeconds(options.now)

  if (!isValidSteamId(options.steamId)) {
    return unavailable('invalid_steam_id', 0, { ...options, now: checkedAt })
  }
  if (typeof options.apiKey !== 'string' || options.apiKey.trim().length === 0) {
    return unavailable('invalid_api_key', 0, { ...options, now: checkedAt })
  }

  const timeoutMs = normalizeTimeout(options.timeoutMs)
  const sleep = options.sleep ?? (() => Promise.resolve())
  const retryDelayMs =
    options.retryDelayMs !== undefined && Number.isFinite(options.retryDelayMs)
      ? Math.max(0, Math.floor(options.retryDelayMs))
      : 0

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    try {
      const personaname = await runAttempt(options, timeoutMs)
      const shouldWrite =
        options.previousStatus === 'unavailable' ||
        options.storedName === undefined ||
        options.storedName === null ||
        options.storedName !== personaname
      return {
        status: 'verified',
        personaname,
        checkedAt,
        attempts: attempt,
        shouldWrite,
      }
    } catch (error) {
      const reason = error instanceof ProfileAttemptError ? error.reason : 'network_error'
      const httpStatus = error instanceof ProfileAttemptError ? error.httpStatus : undefined
      reportFailure(options.logger ?? options.onError, reason, httpStatus, attempt, attemptsAllowed)

      if (attempt < attemptsAllowed && retryDelayMs > 0) {
        try {
          await sleep(retryDelayMs)
        } catch {
          // A retry delay is optional coordination; continue immediately if it fails.
        }
      }
      if (attempt === attemptsAllowed) {
        return unavailable(reason, attempt, { ...options, now: checkedAt }, httpStatus)
      }
    }
  }

  // The loop always returns, but retaining a safe fallback keeps future edits fail-closed.
  return unavailable('network_error', attemptsAllowed, { ...options, now: checkedAt })
}

export const lookupSteamProfile = synchronizeSteamProfile
export const synchronizeSteamUsername = synchronizeSteamProfile
export const fetchSteamProfile = synchronizeSteamProfile
