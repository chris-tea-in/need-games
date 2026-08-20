const TOKEN_BYTE_LENGTH = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function assertSessionTokenHash(value: string): void {
  if (!HASH_PATTERN.test(value)) {
    throw new TypeError('A session token hash must be 64 lowercase hexadecimal characters.')
  }
}

function assertSecret(value: string): void {
  if (value.length === 0) {
    throw new TypeError('The CSRF HMAC secret must not be empty.')
  }
}

/** Return a cryptographically random, URL-safe 256-bit opaque token. */
export function generateToken(
  randomValues: (array: Uint8Array) => Uint8Array = (array) =>
    crypto.getRandomValues(array as Uint8Array<ArrayBuffer>),
): string {
  const bytes = randomValues(new Uint8Array(TOKEN_BYTE_LENGTH))
  if (bytes.length !== TOKEN_BYTE_LENGTH) {
    throw new TypeError('The token random source returned an invalid length.')
  }
  return toBase64Url(bytes)
}

/** Return the lowercase SHA-256 digest of an opaque token as hexadecimal text. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const hashTokenHex = hashToken

/** Compare strings without returning early for a length or byte mismatch. */
export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }

  return difference === 0
}

export const timingSafeEqual = constantTimeEqual

/** Derive the browser-facing CSRF value from the stored session hash. */
export async function deriveCsrfToken(
  sessionTokenHash: string,
  csrfHmacSecret: string,
): Promise<string> {
  assertSessionTokenHash(sessionTokenHash)
  assertSecret(csrfHmacSecret)

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(csrfHmacSecret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionTokenHash))
  return toBase64Url(new Uint8Array(signature))
}

/** Verify a submitted CSRF value against the active session hash. */
export async function verifyCsrfToken(
  submittedToken: string,
  sessionTokenHash: string,
  csrfHmacSecret: string,
): Promise<boolean> {
  if (!TOKEN_PATTERN.test(submittedToken)) {
    return false
  }

  const expectedToken = await deriveCsrfToken(sessionTokenHash, csrfHmacSecret)
  return constantTimeEqual(submittedToken, expectedToken)
}

export function isToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export function isTokenHash(value: string): boolean {
  return HASH_PATTERN.test(value)
}
