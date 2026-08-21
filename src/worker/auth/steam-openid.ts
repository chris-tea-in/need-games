export const STEAM_OPENID_NAMESPACE = 'http://specs.openid.net/auth/2.0'
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'
export const STEAM_OPENID_IDENTIFIER_SELECT = `${STEAM_OPENID_NAMESPACE}/identifier_select`
export const STEAM_OPENID_ID_PREFIX = 'https://steamcommunity.com/openid/id/'
export const STEAM_OPENID_RESPONSE_NONCE_MAX_LENGTH = 512

const REQUIRED_SIGNED_FIELDS = [
  'op_endpoint',
  'return_to',
  'response_nonce',
  'assoc_handle',
] as const

const DEFAULT_MAX_FIELD_COUNT = 32
const MINIMUM_ASSERTION_FIELD_COUNT = 10
const DEFAULT_MAX_VALUE_LENGTH = 2048
const DEFAULT_NONCE_MAX_AGE_SECONDS = 10 * 60
const DEFAULT_NONCE_FUTURE_SKEW_SECONDS = 60
const MAX_CONFIRMATION_BODY_LENGTH = 16 * 1024
const steamIdPattern = /^[0-9]{17}$/
const noncePattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z([^\s]+)$/
const openIdFieldNamePattern = /^openid\.[A-Za-z0-9][A-Za-z0-9_.-]*$/

export type SteamAssertionInput = Request | URL | URLSearchParams | Readonly<Record<string, string>>

export interface SteamNonceReplayGuard {
  has(nonce: string): boolean | Promise<boolean>
  add(nonce: string): void | Promise<void>
  checkAndStore?(nonce: string): boolean | Promise<boolean>
}

export interface SteamOpenIdValidationOptions {
  /** Trusted production origin, including scheme and host but no path. */
  expectedOrigin?: string
  /** Alias used by callers that name this value after its deployment role. */
  productionOrigin?: string
  /** The callback URL that Steam was expected to return to. */
  callbackUrl?: string | URL
  /** Alias for callbackUrl when the URL comes directly from the request. */
  actualCallbackUrl?: string | URL
  /** Optional exact callback URL stored by the login transaction. */
  expectedReturnTo?: string | URL
  now?: number | Date
  nonceMaxAgeSeconds?: number
  nonceFutureSkewSeconds?: number
  maxFieldCount?: number
  maxValueLength?: number
  fetcher?: typeof fetch
  fetch?: typeof fetch
  replayGuard?: SteamNonceReplayGuard | Set<string>
  nonceReplayGuard?: SteamNonceReplayGuard | Set<string>
}

export interface SteamAssertion {
  steamId: string
  responseNonce: string
  returnTo: string
}

export type SteamOpenIdErrorCode =
  'invalid_steam_assertion' | 'steam_assertion_replay' | 'steam_confirmation_failed'

export class SteamOpenIdValidationError extends Error {
  readonly code: SteamOpenIdErrorCode

  constructor(code: SteamOpenIdErrorCode, message: string) {
    super(message)
    this.name = 'SteamOpenIdValidationError'
    this.code = code
  }
}

function invalidAssertion(message = 'The Steam assertion is invalid.'): SteamOpenIdValidationError {
  return new SteamOpenIdValidationError('invalid_steam_assertion', message)
}

function sourceEntries(input: SteamAssertionInput): Iterable<[string, string]> {
  if (input instanceof URLSearchParams) {
    return input.entries()
  }

  if (input instanceof URL) {
    if (input.search.length > 64 * 1024) {
      throw invalidAssertion()
    }
    return input.searchParams.entries()
  }

  if (input instanceof Request) {
    const url = new URL(input.url)
    if (url.search.length > 64 * 1024) {
      throw invalidAssertion()
    }
    return url.searchParams.entries()
  }

  return Object.entries(input)
}

function collectFields(
  input: SteamAssertionInput,
  maxFieldCount: number,
  maxValueLength: number,
): Map<string, string[]> {
  const fields = new Map<string, string[]>()
  let fieldCount = 0

  for (const [name, value] of sourceEntries(input)) {
    fieldCount += 1
    if (
      fieldCount > maxFieldCount ||
      name.length === 0 ||
      name.length > 128 ||
      value.length > maxValueLength
    ) {
      throw invalidAssertion()
    }

    const values = fields.get(name)
    if (values === undefined) {
      fields.set(name, [value])
    } else {
      values.push(value)
    }
  }

  if (fields.size === 0) {
    throw invalidAssertion()
  }

  for (const name of fields.keys()) {
    if (name !== 'state' && !openIdFieldNamePattern.test(name)) {
      throw invalidAssertion()
    }
  }

  return fields
}

function oneField(fields: Map<string, string[]>, name: string): string
function oneField(fields: Map<string, string[]>, name: string, required: false): string | null
function oneField(fields: Map<string, string[]>, name: string, required = true): string | null {
  const values = fields.get(name)
  if (values === undefined) {
    if (required) {
      throw invalidAssertion()
    }
    return null
  }
  if (values.length !== 1 || values[0] === undefined || values[0].length === 0) {
    throw invalidAssertion()
  }
  return values[0]
}

function parseHttpsOrigin(value: string, message: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidAssertion(message)
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw invalidAssertion(message)
  }
  return url
}

function parseCallbackUrl(value: string | URL): URL {
  try {
    return typeof value === 'string' ? new URL(value) : new URL(value.href)
  } catch {
    throw invalidAssertion()
  }
}

function callbackReference(input: SteamAssertionInput, options: SteamOpenIdValidationOptions): URL {
  const configured = options.callbackUrl ?? options.actualCallbackUrl
  if (configured !== undefined) {
    return parseCallbackUrl(configured)
  }

  if (input instanceof Request || input instanceof URL) {
    return input instanceof Request ? new URL(input.url) : new URL(input.href)
  }

  throw invalidAssertion('A trusted callback URL is required.')
}

function removeOpenIdFields(url: URL): URL {
  const copy = new URL(url.href)
  for (const key of [...copy.searchParams.keys()]) {
    if (key.startsWith('openid.')) {
      copy.searchParams.delete(key)
    }
  }
  return copy
}

function canonicalReturnTo(value: string, expectedOrigin: URL): URL {
  let returnTo: URL
  try {
    returnTo = new URL(value)
  } catch {
    throw invalidAssertion()
  }
  if (
    returnTo.protocol !== 'https:' ||
    returnTo.username !== '' ||
    returnTo.password !== '' ||
    returnTo.origin !== expectedOrigin.origin ||
    returnTo.hash !== ''
  ) {
    throw invalidAssertion()
  }
  for (const key of returnTo.searchParams.keys()) {
    if (key.startsWith('openid.')) {
      throw invalidAssertion()
    }
  }
  return returnTo
}

function validateReturnTo(
  returnToValue: string,
  expectedOrigin: URL,
  callbackUrl: URL,
  expectedReturnTo: string | URL | undefined,
): URL {
  const returnTo = canonicalReturnTo(returnToValue, expectedOrigin)
  const configured =
    expectedReturnTo === undefined
      ? removeOpenIdFields(callbackUrl)
      : parseCallbackUrl(expectedReturnTo)
  const configuredCanonical = canonicalReturnTo(configured.href, expectedOrigin)
  if (returnTo.href !== configuredCanonical.href) {
    throw invalidAssertion()
  }
  return returnTo
}

function validateSteamIdentity(value: string): string {
  if (!value.startsWith(STEAM_OPENID_ID_PREFIX)) {
    throw invalidAssertion()
  }

  let identity: URL
  try {
    identity = new URL(value)
  } catch {
    throw invalidAssertion()
  }
  if (
    identity.origin !== 'https://steamcommunity.com' ||
    identity.search !== '' ||
    identity.hash !== ''
  ) {
    throw invalidAssertion()
  }

  const steamId = identity.pathname.slice('/openid/id/'.length)
  if (!steamIdPattern.test(steamId)) {
    throw invalidAssertion()
  }
  return steamId
}

function validateNonce(
  value: string,
  now: number | Date | undefined,
  maxAgeSeconds: number,
  futureSkewSeconds: number,
): void {
  if (value.length < 1 || value.length > STEAM_OPENID_RESPONSE_NONCE_MAX_LENGTH) {
    throw invalidAssertion()
  }
  const match = noncePattern.exec(value)
  if (match === null) {
    throw invalidAssertion()
  }

  const timestamp = Date.parse(`${match[1]}Z`)
  const nowMs = now instanceof Date ? now.getTime() : (now ?? Date.now())
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) {
    throw invalidAssertion()
  }

  const ageSeconds = (nowMs - timestamp) / 1000
  if (ageSeconds > maxAgeSeconds || ageSeconds < -futureSkewSeconds) {
    throw invalidAssertion()
  }
}

function validateSignedFields(fields: Map<string, string[]>): void {
  const signed = oneField(fields, 'openid.signed')
  const names = signed.split(',')
  if (names.some((name) => name.length === 0) || new Set(names).size !== names.length) {
    throw invalidAssertion()
  }

  for (const name of names) {
    oneField(fields, `openid.${name}`)
  }

  for (const name of REQUIRED_SIGNED_FIELDS) {
    if (!names.includes(name)) {
      throw invalidAssertion()
    }
  }

  for (const name of ['claimed_id', 'identity'] as const) {
    if (fields.has(`openid.${name}`) && !names.includes(name)) {
      throw invalidAssertion()
    }
  }
}

function replayGuard(
  candidate: SteamNonceReplayGuard | Set<string> | undefined,
): SteamNonceReplayGuard | undefined {
  if (candidate === undefined) {
    return undefined
  }
  if (candidate instanceof Set) {
    return {
      has: (nonce) => candidate.has(nonce),
      add: (nonce) => {
        candidate.add(nonce)
      },
      checkAndStore: (nonce) => {
        if (candidate.has(nonce)) {
          return false
        }
        candidate.add(nonce)
        return true
      },
    }
  }
  return candidate
}

async function checkSeenNonce(
  guard: SteamNonceReplayGuard | undefined,
  nonce: string,
): Promise<void> {
  if (guard !== undefined && (await guard.has(nonce))) {
    throw new SteamOpenIdValidationError(
      'steam_assertion_replay',
      'The Steam assertion was replayed.',
    )
  }
}

async function storeNonce(guard: SteamNonceReplayGuard | undefined, nonce: string): Promise<void> {
  if (guard === undefined) {
    return
  }

  if (guard.checkAndStore !== undefined) {
    if (!(await guard.checkAndStore(nonce))) {
      throw new SteamOpenIdValidationError(
        'steam_assertion_replay',
        'The Steam assertion was replayed.',
      )
    }
    return
  }

  await guard.add(nonce)
}

async function confirmWithSteam(
  fields: Map<string, string[]>,
  fetcher: typeof fetch,
): Promise<void> {
  const body = new URLSearchParams()
  for (const [name, values] of fields) {
    if (!name.startsWith('openid.')) {
      continue
    }
    for (const value of values) {
      body.append(name, value)
    }
  }
  body.set('openid.mode', 'check_authentication')

  let response: Response
  try {
    response = await fetcher(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    })
  } catch {
    throw new SteamOpenIdValidationError(
      'steam_confirmation_failed',
      'Steam could not confirm the assertion.',
    )
  }

  if (!response.ok) {
    throw new SteamOpenIdValidationError(
      'steam_confirmation_failed',
      'Steam could not confirm the assertion.',
    )
  }

  let confirmation: string
  try {
    confirmation = await response.text()
  } catch {
    throw new SteamOpenIdValidationError(
      'steam_confirmation_failed',
      'Steam could not confirm the assertion.',
    )
  }
  if (confirmation.length > MAX_CONFIRMATION_BODY_LENGTH) {
    throw new SteamOpenIdValidationError(
      'steam_confirmation_failed',
      'Steam could not confirm the assertion.',
    )
  }

  const lines = confirmation.split(/\r?\n/)
  const namespaces = lines.flatMap((line) => {
    const match = /^ns:(.*)$/.exec(line)
    return match === null ? [] : [match[1]]
  })
  const valid = lines.some((line) => /^is_valid\s*:\s*true\s*$/.test(line))
  if (
    !valid ||
    namespaces.length > 1 ||
    (namespaces.length === 1 && namespaces[0] !== STEAM_OPENID_NAMESPACE)
  ) {
    throw new SteamOpenIdValidationError(
      'steam_confirmation_failed',
      'Steam could not confirm the assertion.',
    )
  }
}

export function isValidSteamId(value: string): boolean {
  return steamIdPattern.test(value)
}

export function steamIdFromIdentity(value: string): string | null {
  try {
    return validateSteamIdentity(value)
  } catch {
    return null
  }
}

export function createSteamNonceReplayGuard(): SteamNonceReplayGuard {
  const seen = new Set<string>()
  return {
    has: (nonce) => seen.has(nonce),
    add: (nonce) => {
      seen.add(nonce)
    },
    checkAndStore: (nonce) => {
      if (seen.has(nonce)) {
        return false
      }
      seen.add(nonce)
      return true
    },
  }
}

export async function validateSteamAssertion(
  input: SteamAssertionInput,
  options: SteamOpenIdValidationOptions,
): Promise<SteamAssertion> {
  const maxFieldCount = options.maxFieldCount ?? DEFAULT_MAX_FIELD_COUNT
  const maxValueLength = options.maxValueLength ?? DEFAULT_MAX_VALUE_LENGTH
  if (
    !Number.isSafeInteger(maxFieldCount) ||
    maxFieldCount < MINIMUM_ASSERTION_FIELD_COUNT ||
    !Number.isSafeInteger(maxValueLength) ||
    maxValueLength < 1
  ) {
    throw invalidAssertion()
  }

  const fields = collectFields(input, maxFieldCount, maxValueLength)
  const expectedOriginValue = options.expectedOrigin ?? options.productionOrigin
  if (expectedOriginValue === undefined) {
    throw invalidAssertion('A trusted production origin is required.')
  }
  const expectedOrigin = parseHttpsOrigin(expectedOriginValue, 'The production origin is invalid.')
  const callbackUrl = callbackReference(input, options)
  if (
    callbackUrl.protocol !== 'https:' ||
    callbackUrl.username !== '' ||
    callbackUrl.password !== '' ||
    callbackUrl.origin !== expectedOrigin.origin
  ) {
    throw invalidAssertion()
  }

  const namespace = oneField(fields, 'openid.ns')
  const mode = oneField(fields, 'openid.mode')
  const endpoint = oneField(fields, 'openid.op_endpoint')
  const claimedIdentity = oneField(fields, 'openid.claimed_id')
  const identity = oneField(fields, 'openid.identity')
  const returnTo = oneField(fields, 'openid.return_to')
  const responseNonce = oneField(fields, 'openid.response_nonce')
  oneField(fields, 'openid.assoc_handle')
  oneField(fields, 'openid.sig')
  oneField(fields, 'state', false)

  if (
    namespace !== STEAM_OPENID_NAMESPACE ||
    mode !== 'id_res' ||
    endpoint !== STEAM_OPENID_ENDPOINT
  ) {
    throw invalidAssertion()
  }
  if (claimedIdentity !== identity) {
    throw invalidAssertion()
  }
  const steamId = validateSteamIdentity(claimedIdentity)
  validateReturnTo(returnTo, expectedOrigin, callbackUrl, options.expectedReturnTo)
  validateSignedFields(fields)
  validateNonce(
    responseNonce,
    options.now,
    options.nonceMaxAgeSeconds ?? DEFAULT_NONCE_MAX_AGE_SECONDS,
    options.nonceFutureSkewSeconds ?? DEFAULT_NONCE_FUTURE_SKEW_SECONDS,
  )

  const guard = replayGuard(options.replayGuard ?? options.nonceReplayGuard)
  await checkSeenNonce(guard, responseNonce)
  await confirmWithSteam(fields, options.fetcher ?? options.fetch ?? globalThis.fetch)
  await storeNonce(guard, responseNonce)

  return { steamId, responseNonce, returnTo }
}

export const validateSteamOpenIdAssertion = validateSteamAssertion
