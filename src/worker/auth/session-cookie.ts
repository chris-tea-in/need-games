export const SESSION_COOKIE_NAME = '__Host-myplayprint_session'
export const LOGIN_TRANSACTION_COOKIE_NAME = '__Host-myplayprint_login_transaction'

export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
export const LOGIN_TRANSACTION_COOKIE_MAX_AGE_SECONDS = 10 * 60

const cookieNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const cookieValuePattern = /^[A-Za-z0-9_-]+$/

function assertCookieName(name: string): void {
  if (!cookieNamePattern.test(name)) {
    throw new TypeError('Cookie name contains an invalid character.')
  }
}

function assertCookieValue(value: string): void {
  if (!cookieValuePattern.test(value)) {
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

/** Parse an RFC 6265 Cookie header, rejecting ambiguous or malformed values. */
export function parseCookieHeader(header: string | null): ReadonlyMap<string, string> | null {
  if (header === null || header.trim() === '') {
    return new Map()
  }

  const cookies = new Map<string, string>()
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) {
      return null
    }

    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!cookieNamePattern.test(name) || !cookieValuePattern.test(value) || cookies.has(name)) {
      return null
    }

    cookies.set(name, value)
  }

  return cookies
}

export const parseCookies = parseCookieHeader

export function getCookie(request: Request, name: string): string | null {
  assertCookieName(name)
  const cookies = parseCookieHeader(request.headers.get('Cookie'))
  return cookies?.get(name) ?? null
}

export const readCookie = getCookie
