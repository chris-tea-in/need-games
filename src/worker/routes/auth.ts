import {
  LOGIN_TRANSACTION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearLoginTransactionCookie,
  clearSessionCookie,
  getCookie,
  serializeLoginTransactionCookie,
  serializeSessionCookie,
} from '../auth/session-cookie.js'
import { validateSteamAssertion } from '../auth/steam-openid.js'
import { synchronizeSteamProfile, type SteamProfileLookupResult } from '../auth/steam-profile.js'
import {
  constantTimeEqual,
  deriveCsrfToken,
  deriveLoginTransactionState,
  generateToken,
  hashToken,
  isToken,
  verifyCsrfToken,
} from '../auth/token-hash.js'
import {
  cleanupExpiredAuthRows,
  consumeLoginTransaction,
  createLoginTransaction,
  createSession,
  getLoginTransaction,
  invalidateLoginTransaction,
  readSession,
  revokeSession,
  synchronizeUserProfile,
  upsertUserBySteamId,
} from '../repositories/identity.js'
import {
  AUTH_FAILURE_QUERY_PARAMETER,
  AUTH_FAILURE_QUERY_VALUE,
  AUTH_RESULT_CODES,
  AUTH_ROUTES,
  SESSION_CACHE_CONTROL,
  STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS,
  type AuthResultCode,
  type ProfileLookupStatus,
} from '../../shared/session-contract.js'
import { jsonResponse } from '../http.js'
import { gameExists, isValidSlug } from './similar-games.js'

const STEAM_OPENID_NAMESPACE = 'https://specs.openid.net/auth/2.0'
const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'
const STEAM_OPENID_IDENTIFIER_SELECT = 'https://specs.openid.net/auth/2.0/identifier_select'
const AUTH_FAILURE_MESSAGE = 'Authentication failed. Please try again later.'
const AUTH_UNAVAILABLE_MESSAGE = 'Authentication is temporarily unavailable.'
const SIGN_IN_DISABLED_MESSAGE = 'Steam sign-in is currently unavailable.'
const LOGOUT_INVALID_MESSAGE = 'The logout request is invalid.'
const SAFE_RETURN_PATH_MAX_LENGTH = 200
const CLEANUP_LIMIT = 25

const authResultCodeSet: ReadonlySet<string> = new Set(AUTH_RESULT_CODES)

export interface AuthEnvironment {
  NEED_GAMES_DB: D1Database
  STEAM_SIGN_IN_ENABLED?: string
  PRODUCTION_ORIGIN?: string
  CSRF_HMAC_SECRET?: string
  STEAM_WEB_API_KEY?: string
}

export interface AuthEvent {
  event:
    | 'sign_in_disabled'
    | 'callback_rejected'
    | 'profile_refresh'
    | 'session_created'
    | 'logout'
    | 'identity_unavailable'
  code?: AuthResultCode
  profileStatus?: ProfileLookupStatus
  attempts?: number
  success?: boolean
  reason?: string
}

export interface AuthRouteOptions {
  now?: () => number
  fetcher?: typeof fetch
  generateToken?: () => string
  validateAssertion?: typeof validateSteamAssertion
  logger?: (event: AuthEvent) => void
}

type RuntimeEnvironment = AuthEnvironment & {
  ASSETS?: Fetcher
}

function currentUnixSeconds(now: () => number): number {
  const value = now()
  if (!Number.isFinite(value)) {
    return Math.floor(Date.now() / 1_000)
  }
  return Math.floor(value > 100_000_000_000 ? value / 1_000 : value)
}

function loggerFor(options: AuthRouteOptions): (event: AuthEvent) => void {
  const logger = options.logger ?? ((event: AuthEvent) => console.log(event))
  return (event) => {
    try {
      logger(event)
    } catch {
      // Diagnostics are optional and never affect authentication behavior.
    }
  }
}

function isSignInEnabled(env: AuthEnvironment): boolean {
  return env.STEAM_SIGN_IN_ENABLED?.trim().toLowerCase() === 'true'
}

function parseTrustedOrigin(value: string | undefined): URL | null {
  if (value === undefined || value.trim().length === 0) {
    return null
  }

  try {
    const origin = new URL(value)
    if (
      origin.protocol !== 'https:' ||
      origin.username !== '' ||
      origin.password !== '' ||
      origin.pathname !== '/' ||
      origin.search !== '' ||
      origin.hash !== ''
    ) {
      return null
    }
    return origin
  } catch {
    return null
  }
}

function messageFor(code: AuthResultCode): string {
  switch (code) {
    case 'sign_in_disabled':
      return SIGN_IN_DISABLED_MESSAGE
    case 'invalid_csrf':
      return LOGOUT_INVALID_MESSAGE
    case 'identity_storage_unavailable':
      return AUTH_UNAVAILABLE_MESSAGE
    default:
      return AUTH_FAILURE_MESSAGE
  }
}

function authErrorResponse(code: AuthResultCode, status: number, headers?: HeadersInit): Response {
  return jsonResponse(
    { error: { code, message: messageFor(code) } },
    { cacheControl: SESSION_CACHE_CONTROL, headers, status },
  )
}

function methodNotAllowed(allow: string): Response {
  return authErrorResponse('authentication_failed', 405, { Allow: allow })
}

function appendCookie(headers: Headers, cookie: string): void {
  headers.append('Set-Cookie', cookie)
}

function redirectResponse(location: URL, headers?: Headers): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Location', location.href)
  responseHeaders.set('Cache-Control', SESSION_CACHE_CONTROL)
  return new Response(null, { status: 302, headers: responseHeaders })
}

function safeFailureLocation(origin: URL, returnPath: string): URL {
  const location = safePersistedReturnLocation(origin, returnPath)
  location.searchParams.delete(AUTH_FAILURE_QUERY_PARAMETER)
  location.searchParams.set(AUTH_FAILURE_QUERY_PARAMETER, AUTH_FAILURE_QUERY_VALUE)
  return location
}

function safeReturnLocation(origin: URL, returnPath: string): URL {
  const location = safePersistedReturnLocation(origin, returnPath)
  location.searchParams.delete(AUTH_FAILURE_QUERY_PARAMETER)
  return location
}

function safePersistedReturnLocation(origin: URL, returnPath: string): URL {
  if (!isSafeRelativeReturnPath(returnPath)) {
    return new URL('/', origin)
  }

  try {
    const location = new URL(returnPath, origin)
    if (location.origin === origin.origin && location.username === '' && location.password === '') {
      return location
    }
  } catch {
    // Fall through to the catalog root.
  }
  return new URL('/', origin)
}

function failureRedirect(
  origin: URL | null,
  returnPath: string,
  code: AuthResultCode,
  log: (event: AuthEvent) => void,
  headers?: Headers,
): Response {
  log({ event: 'callback_rejected', code })
  const responseHeaders = new Headers(headers)
  appendCookie(responseHeaders, clearLoginTransactionCookie())
  if (origin === null) {
    return authErrorResponse(code, 503, responseHeaders)
  }
  return redirectResponse(safeFailureLocation(origin, returnPath), responseHeaders)
}

function isSafeRelativeReturnPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > SAFE_RETURN_PATH_MAX_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return false
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f || value.charCodeAt(index) === 0x7f) {
      return false
    }
  }
  return true
}

async function allowlistedReturnPath(
  database: D1Database,
  value: string | null,
): Promise<string | null> {
  if (value === null || !isSafeRelativeReturnPath(value)) {
    return null
  }

  let location: URL
  try {
    location = new URL(value, 'https://myplayprint.invalid')
  } catch {
    return null
  }
  if (location.origin !== 'https://myplayprint.invalid' || location.username || location.password) {
    return null
  }

  if (location.pathname === '/') {
    return value
  }

  const gameMatch = /^\/games\/([^/]+)\/?$/.exec(location.pathname)
  if (gameMatch === null || !isValidSlug(gameMatch[1] ?? '')) {
    return null
  }

  try {
    return (await gameExists(database, gameMatch[1] ?? '')) ? value : null
  } catch {
    return null
  }
}

async function cleanupAuthRows(
  database: D1Database,
  now: number,
  log: (event: AuthEvent) => void,
): Promise<void> {
  try {
    await cleanupExpiredAuthRows(database, now, CLEANUP_LIMIT)
  } catch {
    log({ event: 'identity_unavailable', reason: 'cleanup_failed' })
  }
}

function classifyAssertionError(error: unknown): AuthResultCode {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && authResultCodeSet.has(code)) {
      return code as AuthResultCode
    }
    if (code === 'steam_assertion_replay') {
      return 'callback_replayed'
    }
  }
  return 'invalid_steam_assertion'
}

async function startSteamAuthentication(
  request: Request,
  env: AuthEnvironment,
  origin: URL | null,
  options: AuthRouteOptions,
  log: (event: AuthEvent) => void,
): Promise<Response> {
  if (!isSignInEnabled(env)) {
    log({ event: 'sign_in_disabled', code: 'sign_in_disabled' })
    return authErrorResponse('sign_in_disabled', 503)
  }
  if (origin === null || new URL(request.url).origin !== origin.origin) {
    return authErrorResponse('authentication_failed', 400)
  }

  const requestedReturn = new URL(request.url).searchParams.getAll('return')
  const returnPath =
    requestedReturn.length === 1
      ? await allowlistedReturnPath(env.NEED_GAMES_DB, requestedReturn[0] ?? null)
      : null
  if (returnPath === null) {
    return authErrorResponse('authentication_failed', 400)
  }

  const now = currentUnixSeconds(options.now ?? (() => Date.now()))
  await cleanupAuthRows(env.NEED_GAMES_DB, now, log)
  const rawTransactionToken = (options.generateToken ?? generateToken)()
  let transactionHash: string
  let callbackState: string
  try {
    transactionHash = await hashToken(rawTransactionToken)
    if (env.CSRF_HMAC_SECRET === undefined || env.CSRF_HMAC_SECRET.length === 0) {
      throw new Error('csrf-secret-missing')
    }
    callbackState = await deriveLoginTransactionState(transactionHash, env.CSRF_HMAC_SECRET)
    await createLoginTransaction(env.NEED_GAMES_DB, {
      tokenHash: transactionHash,
      returnPath,
      createdAt: now,
      expiresAt: now + STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS,
    })
  } catch {
    log({ event: 'identity_unavailable', reason: 'transaction_create_failed' })
    return authErrorResponse('identity_storage_unavailable', 503)
  }

  const callback = new URL(AUTH_ROUTES.steamCallback, origin)
  callback.searchParams.set('state', callbackState)
  const steamUrl = new URL(STEAM_OPENID_ENDPOINT)
  steamUrl.searchParams.set('openid.ns', STEAM_OPENID_NAMESPACE)
  steamUrl.searchParams.set('openid.mode', 'checkid_setup')
  steamUrl.searchParams.set('openid.return_to', callback.href)
  steamUrl.searchParams.set('openid.realm', `${origin.origin}/`)
  steamUrl.searchParams.set('openid.identity', STEAM_OPENID_IDENTIFIER_SELECT)
  steamUrl.searchParams.set('openid.claimed_id', STEAM_OPENID_IDENTIFIER_SELECT)

  const headers = new Headers()
  appendCookie(headers, serializeLoginTransactionCookie(rawTransactionToken))
  return redirectResponse(steamUrl, headers)
}

async function callbackSteamAuthentication(
  request: Request,
  env: AuthEnvironment,
  origin: URL | null,
  options: AuthRouteOptions,
  log: (event: AuthEvent) => void,
): Promise<Response> {
  if (!isSignInEnabled(env)) {
    log({ event: 'sign_in_disabled', code: 'sign_in_disabled' })
    const now = currentUnixSeconds(options.now ?? (() => Date.now()))
    let returnPath = '/'
    let transactionHash: string | null = null
    const loginToken = getCookie(request, LOGIN_TRANSACTION_COOKIE_NAME)
    if (loginToken !== null) {
      try {
        transactionHash = await hashToken(loginToken)
        const transaction = await getLoginTransaction(env.NEED_GAMES_DB, transactionHash)
        returnPath = transaction?.returnPath ?? '/'
      } catch {
        log({ event: 'identity_unavailable', reason: 'disabled_transaction_read_failed' })
      }
    }
    if (transactionHash !== null) {
      try {
        await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
      } catch {
        log({ event: 'identity_unavailable', reason: 'disabled_transaction_invalidate_failed' })
      }
    }
    return failureRedirect(origin, returnPath, 'sign_in_disabled', log)
  }
  if (origin === null || new URL(request.url).origin !== origin.origin) {
    return failureRedirect(origin, '/', 'authentication_failed', log)
  }

  const now = currentUnixSeconds(options.now ?? (() => Date.now()))
  const loginToken = getCookie(request, LOGIN_TRANSACTION_COOKIE_NAME)
  let transactionHash: string | null = null
  let transaction = null
  if (loginToken !== null) {
    try {
      transactionHash = await hashToken(loginToken)
      transaction = await getLoginTransaction(env.NEED_GAMES_DB, transactionHash)
    } catch {
      log({ event: 'identity_unavailable', reason: 'transaction_read_failed' })
      return failureRedirect(origin, '/', 'identity_storage_unavailable', log)
    }
  }

  const returnPath = transaction?.returnPath ?? '/'
  if (transactionHash === null || transaction === null) {
    return failureRedirect(origin, returnPath, 'invalid_login_transaction', log)
  }
  if (transaction.consumedAt !== null) {
    return failureRedirect(origin, returnPath, 'callback_replayed', log)
  }
  if (transaction.expiresAt <= now) {
    try {
      await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
    } catch {
      log({ event: 'identity_unavailable', reason: 'expired_transaction_invalidate_failed' })
    }
    return failureRedirect(origin, returnPath, 'expired_login_transaction', log)
  }

  const callbackUrl = new URL(request.url)
  const callbackStates = callbackUrl.searchParams.getAll('state')
  if (
    callbackStates.length !== 1 ||
    !isToken(callbackStates[0] ?? '') ||
    env.CSRF_HMAC_SECRET === undefined ||
    env.CSRF_HMAC_SECRET.length === 0
  ) {
    try {
      await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
    } catch {
      log({ event: 'identity_unavailable', reason: 'state_invalidate_failed' })
    }
    return failureRedirect(origin, returnPath, 'invalid_login_transaction', log)
  }

  let expectedCallbackState: string
  try {
    expectedCallbackState = await deriveLoginTransactionState(transactionHash, env.CSRF_HMAC_SECRET)
  } catch {
    return failureRedirect(origin, returnPath, 'identity_storage_unavailable', log)
  }
  if (!constantTimeEqual(callbackStates[0] ?? '', expectedCallbackState)) {
    try {
      await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
    } catch {
      log({ event: 'identity_unavailable', reason: 'state_invalidate_failed' })
    }
    return failureRedirect(origin, returnPath, 'invalid_login_transaction', log)
  }

  const expectedCallback = new URL(AUTH_ROUTES.steamCallback, origin)
  expectedCallback.searchParams.set('state', expectedCallbackState)

  const validate = options.validateAssertion ?? validateSteamAssertion
  let assertion: Awaited<ReturnType<typeof validate>>
  try {
    assertion = await validate(request, {
      productionOrigin: origin.origin,
      callbackUrl: request.url,
      expectedReturnTo: expectedCallback.href,
      fetcher: options.fetcher,
    })
  } catch (error) {
    if (transactionHash !== null) {
      try {
        await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
      } catch {
        log({ event: 'identity_unavailable', reason: 'transaction_invalidate_failed' })
      }
    }
    return failureRedirect(origin, returnPath, classifyAssertionError(error), log)
  }

  let consumed
  try {
    consumed = await consumeLoginTransaction(
      env.NEED_GAMES_DB,
      transactionHash,
      assertion.responseNonce,
      now,
    )
  } catch {
    try {
      await invalidateLoginTransaction(env.NEED_GAMES_DB, transactionHash, now)
    } catch {
      log({ event: 'identity_unavailable', reason: 'transaction_invalidate_failed' })
    }
    log({ event: 'identity_unavailable', reason: 'transaction_consume_failed' })
    return failureRedirect(origin, returnPath, 'identity_storage_unavailable', log)
  }
  if (consumed === null) {
    const code = transaction.expiresAt <= now ? 'expired_login_transaction' : 'callback_replayed'
    return failureRedirect(origin, returnPath, code, log)
  }

  let profileResult: SteamProfileLookupResult
  let user
  try {
    user = await upsertUserBySteamId(env.NEED_GAMES_DB, assertion.steamId, { now })
    profileResult = await synchronizeSteamProfile({
      steamId: assertion.steamId,
      apiKey: env.STEAM_WEB_API_KEY ?? '',
      fetcher: options.fetcher,
      storedName: user.steamDisplayName,
      previousStatus: user.profileLookupStatus,
      now,
    })
    log({
      event: 'profile_refresh',
      profileStatus: profileResult.status,
      attempts: profileResult.attempts,
      reason: profileResult.status === 'unavailable' ? profileResult.reason : undefined,
    })
    const updatedUser = await synchronizeUserProfile(env.NEED_GAMES_DB, user.id, {
      status: profileResult.status,
      personaname: profileResult.personaname,
      checkedAt: profileResult.checkedAt,
    })
    if (updatedUser === null) {
      throw new Error('identity-missing')
    }

    const rawSessionToken = (options.generateToken ?? generateToken)()
    const sessionHash = await hashToken(rawSessionToken)
    await createSession(env.NEED_GAMES_DB, {
      tokenHash: sessionHash,
      userId: updatedUser.id,
      createdAt: now,
    })
    log({ event: 'session_created', success: true })

    const headers = new Headers()
    appendCookie(headers, serializeSessionCookie(rawSessionToken))
    appendCookie(headers, clearLoginTransactionCookie())
    return redirectResponse(safeReturnLocation(origin, consumed.returnPath), headers)
  } catch {
    log({ event: 'identity_unavailable', reason: 'identity_or_session_write_failed' })
    return failureRedirect(origin, consumed.returnPath, 'identity_storage_unavailable', log)
  }
}

async function sessionResponse(
  request: Request,
  env: AuthEnvironment,
  options: AuthRouteOptions,
  log: (event: AuthEvent) => void,
): Promise<Response> {
  const signInEnabled = isSignInEnabled(env)
  if (!signInEnabled) {
    return jsonResponse(
      { authenticated: false, steamSignInEnabled: false },
      {
        cacheControl: SESSION_CACHE_CONTROL,
      },
    )
  }

  const sessionToken = getCookie(request, SESSION_COOKIE_NAME)
  if (sessionToken === null) {
    return jsonResponse(
      { authenticated: false, steamSignInEnabled: true },
      {
        cacheControl: SESSION_CACHE_CONTROL,
      },
    )
  }

  try {
    const tokenHash = await hashToken(sessionToken)
    const session = await readSession(
      env.NEED_GAMES_DB,
      tokenHash,
      currentUnixSeconds(options.now ?? (() => Date.now())),
    )
    if (session === null) {
      return jsonResponse(
        { authenticated: false, steamSignInEnabled: true },
        {
          cacheControl: SESSION_CACHE_CONTROL,
        },
      )
    }
    if (env.CSRF_HMAC_SECRET === undefined || env.CSRF_HMAC_SECRET.length === 0) {
      throw new Error('csrf-secret-missing')
    }
    const csrfToken = await deriveCsrfToken(tokenHash, env.CSRF_HMAC_SECRET)
    return jsonResponse(
      { authenticated: true, csrfToken, steamSignInEnabled: true },
      {
        cacheControl: SESSION_CACHE_CONTROL,
      },
    )
  } catch {
    log({ event: 'identity_unavailable', reason: 'session_read_failed' })
    return authErrorResponse('identity_storage_unavailable', 503)
  }
}

async function logoutAuthentication(
  request: Request,
  env: AuthEnvironment,
  options: AuthRouteOptions,
  log: (event: AuthEvent) => void,
): Promise<Response> {
  const headers = new Headers()
  appendCookie(headers, clearSessionCookie())
  headers.set('Cache-Control', SESSION_CACHE_CONTROL)

  const submittedToken = request.headers.get('X-CSRF-Token')
  const sessionToken = getCookie(request, SESSION_COOKIE_NAME)
  if (
    submittedToken === null ||
    sessionToken === null ||
    env.CSRF_HMAC_SECRET === undefined ||
    env.CSRF_HMAC_SECRET.length === 0
  ) {
    log({ event: 'logout', success: false })
    return authErrorResponse('invalid_csrf', 403, headers)
  }

  try {
    const tokenHash = await hashToken(sessionToken)
    const now = currentUnixSeconds(options.now ?? (() => Date.now()))
    const session = await readSession(env.NEED_GAMES_DB, tokenHash, now)
    if (
      session === null ||
      !(await verifyCsrfToken(submittedToken, tokenHash, env.CSRF_HMAC_SECRET))
    ) {
      log({ event: 'logout', success: false })
      return authErrorResponse('invalid_csrf', 403, headers)
    }

    await revokeSession(env.NEED_GAMES_DB, tokenHash, now)
    log({ event: 'logout', success: true })
    return new Response(null, { status: 204, headers })
  } catch {
    log({ event: 'identity_unavailable', reason: 'logout_failed' })
    return authErrorResponse('identity_storage_unavailable', 503, headers)
  }
}

/** Route the frozen authentication/session surface; return null for non-auth paths. */
export async function routeAuthRequest(
  request: Request,
  environment: AuthEnvironment,
  url: URL,
  options: AuthRouteOptions = {},
): Promise<Response | null> {
  const env = environment as RuntimeEnvironment
  const log = loggerFor(options)
  const origin = parseTrustedOrigin(env.PRODUCTION_ORIGIN)

  if (url.pathname === AUTH_ROUTES.steamStart) {
    if (request.method !== 'GET') {
      return methodNotAllowed('GET')
    }
    return startSteamAuthentication(request, env, origin, options, log)
  }
  if (url.pathname === AUTH_ROUTES.steamCallback) {
    if (request.method !== 'GET') {
      return methodNotAllowed('GET')
    }
    return callbackSteamAuthentication(request, env, origin, options, log)
  }
  if (url.pathname === AUTH_ROUTES.session) {
    if (request.method !== 'GET') {
      return methodNotAllowed('GET')
    }
    return sessionResponse(request, env, options, log)
  }
  if (url.pathname === AUTH_ROUTES.logout) {
    if (request.method !== 'POST') {
      return methodNotAllowed('POST')
    }
    return logoutAuthentication(request, env, options, log)
  }

  return null
}

export function authUnavailableResponse(): Response {
  return authErrorResponse('identity_storage_unavailable', 503)
}

export { parseTrustedOrigin, isSafeRelativeReturnPath }
