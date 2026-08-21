export const SESSION_COOKIE_NAME = '__Host-myplayprint_session'
export const LOGIN_TRANSACTION_COOKIE_NAME = '__Host-myplayprint_login_transaction'

export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
export const LOGIN_TRANSACTION_COOKIE_MAX_AGE_SECONDS = 10 * 60

const cookieNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const cookieOctetPattern = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/
const serializedValuePattern = /^[A-Za-z0-9_-]+$/
const authenticationTokenPattern = /^[A-Za-z0-9_-]{43}$/
const authenticationCookieNames = new Set([SESSION_COOKIE_NAME, LOGIN_TRANSACTION_COOKIE_NAME])

function assertCookieName(name: string): void {
  if (!cookieNamePattern.test(name)) {
    throw new TypeError('Cookie name contains an invalid character.')
  }
}

function assertCookieValue(value: string): void {
  if (!serializedValuePattern.test(value)) {
    throw new TypeError('Cookie value contains an invalid character.')
  }
}

function serializeHostCookie(name: string, value: string, maxAge: number): string {
  assertCookieName(name)
  assertCookieValue(value)

  return [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

function serializeClearedHostCookie(name: string): string {
  assertCookieName(name)

  return [
    `${name}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

export function serializeSessionCookie(token: string): string {
  return serializeHostCookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_MAX_AGE_SECONDS)
}

export function serializeLoginTransactionCookie(token: string): string {
  return serializeHostCookie(
    LOGIN_TRANSACTION_COOKIE_NAME,
    token,
    LOGIN_TRANSACTION_COOKIE_MAX_AGE_SECONDS,
  )
}

export function clearSessionCookie(): string {
  return serializeClearedHostCookie(SESSION_COOKIE_NAME)
}

export function clearLoginTransactionCookie(): string {
  return serializeClearedHostCookie(LOGIN_TRANSACTION_COOKIE_NAME)
}

function parseCookiePair(part: string, index: number): { name: string; value: string } | null {
  const pair = index > 0 && part.startsWith(' ') ? part.slice(1) : part
  const separator = pair.indexOf('=')
  if (separator <= 0) {
    return null
  }

  const name = pair.slice(0, separator)
  const value = pair.slice(separator + 1)
  if (!cookieNamePattern.test(name) || !cookieOctetPattern.test(value)) {
    return null
  }

  return { name, value }
}

/** Parse an RFC 6265 Cookie header, ignoring malformed unrelated pairs. */
export function parseCookieHeader(header: string | null): ReadonlyMap<string, string> | null {
  if (header === null || header.trim() === '') {
    return new Map()
  }

  const cookies = new Map<string, string>()
  for (const [index, part] of header.split(';').entries()) {
    const pair = parseCookiePair(part, index)
    if (pair === null) {
      continue
    }
    if (cookies.has(pair.name)) {
      return null
    }

    cookies.set(pair.name, pair.value)
  }

  return cookies
}

export const parseCookies = parseCookieHeader

export function getCookie(request: Request, name: string): string | null {
  assertCookieName(name)
  const header = request.headers.get('Cookie')
  if (header === null || header.trim() === '') {
    return null
  }

  let requestedCount = 0
  let value: string | null = null
  for (const [index, part] of header.split(';').entries()) {
    const pair = index > 0 && part.startsWith(' ') ? part.slice(1) : part
    const separator = pair.indexOf('=')
    const candidateName = separator <= 0 ? pair : pair.slice(0, separator)
    const normalizedCandidateName = candidateName.replace(/^[ \t]+|[ \t]+$/g, '')
    if (candidateName !== name && normalizedCandidateName !== name) {
      continue
    }

    requestedCount += 1
    const parsedPair = parseCookiePair(part, index)
    if (parsedPair === null) {
      return null
    }

    value = parsedPair.value
  }
  if (requestedCount !== 1) {
    return null
  }
  if (value === null) {
    return null
  }

  if (authenticationCookieNames.has(name) && !authenticationTokenPattern.test(value)) {
    return null
  }
  return value
}

export const readCookie = getCookie
