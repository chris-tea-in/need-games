import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  constantTimeEqual,
  deriveCsrfToken,
  generateToken,
  hashToken,
  verifyCsrfToken,
} from '../../src/worker/auth/token-hash.js'
import {
  LOGIN_TRANSACTION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearLoginTransactionCookie,
  clearSessionCookie,
  getCookie,
  serializeLoginTransactionCookie,
  serializeSessionCookie,
} from '../../src/worker/auth/session-cookie.js'

describe('auth token primitives', () => {
  test('generates 256-bit base64url tokens and hashes them deterministically', async () => {
    const first = generateToken()
    const second = generateToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
    await expect(hashToken('A'.repeat(43))).resolves.toBe(
      '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a',
    )
  })

  test('derives a stable session-bound CSRF token and compares it in constant time', async () => {
    const sessionHash = 'a'.repeat(64)
    const first = await deriveCsrfToken(sessionHash, 'test-csrf-secret')
    const second = await deriveCsrfToken(sessionHash, 'test-csrf-secret')
    const otherSession = await deriveCsrfToken('b'.repeat(64), 'test-csrf-secret')

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).toBe(first)
    expect(otherSession).not.toBe(first)
    await expect(verifyCsrfToken(first, sessionHash, 'test-csrf-secret')).resolves.toBe(true)
    const altered = `${first[0] === 'A' ? 'B' : 'A'}${first.slice(1)}`
    await expect(verifyCsrfToken(altered, sessionHash, 'test-csrf-secret')).resolves.toBe(false)
    expect(constantTimeEqual(first, second)).toBe(true)
    expect(constantTimeEqual(first, otherSession)).toBe(false)
  })

  test('hashes arbitrary input deterministically while rejecting malformed CSRF inputs', async () => {
    await expect(hashToken('not-a-token')).resolves.toBe(
      'ce6f21ae951df0ba38d6ce0e0175465bf5e9882edcf2ba677bca63b296f17ce7',
    )
    await expect(deriveCsrfToken('not-a-hash', 'secret')).rejects.toThrow(/session token hash/i)
    await expect(deriveCsrfToken('a'.repeat(64), '')).rejects.toThrow(/secret/i)
  })
})

describe('auth cookies', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test('serializes host-only session and login cookies with matching secure attributes', () => {
    const session = serializeSessionCookie('session-token')
    const login = serializeLoginTransactionCookie('login-token')

    expect(session).toContain(`${SESSION_COOKIE_NAME}=session-token`)
    expect(session).toContain('Max-Age=604800')
    expect(session).toContain('Path=/')
    expect(session).toContain('HttpOnly')
    expect(session).toContain('Secure')
    expect(session).toContain('SameSite=Lax')
    expect(session).not.toMatch(/Domain=/i)
    expect(login).toContain(`${LOGIN_TRANSACTION_COOKIE_NAME}=login-token`)
    expect(login).toContain('Max-Age=600')
    expect(login).not.toMatch(/Domain=/i)
  })

  test('parses only the selected cookie and clears it with identical scope attributes', () => {
    const request = new Request('https://need-games.test/', {
      headers: {
        Cookie: `other=value; ${SESSION_COOKIE_NAME}=session-token; duplicate=ignored`,
      },
    })

    expect(getCookie(request, SESSION_COOKIE_NAME)).toBe('session-token')
    expect(getCookie(request, 'missing')).toBeNull()

    const clearedSession = clearSessionCookie()
    const clearedLogin = clearLoginTransactionCookie()
    for (const cleared of [clearedSession, clearedLogin]) {
      expect(cleared).toContain('Max-Age=0')
      expect(cleared).toContain('Path=/')
      expect(cleared).toContain('HttpOnly')
      expect(cleared).toContain('Secure')
      expect(cleared).toContain('SameSite=Lax')
      expect(cleared).not.toMatch(/Domain=/i)
    }
  })

  test('rejects duplicate or unsafe cookie values', () => {
    const duplicate = new Request('https://need-games.test/', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=one; ${SESSION_COOKIE_NAME}=two` },
    })
    const unsafe = new Request('https://need-games.test/', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=value%3Bother` },
    })

    expect(getCookie(duplicate, SESSION_COOKIE_NAME)).toBeNull()
    expect(getCookie(unsafe, SESSION_COOKIE_NAME)).toBeNull()
    expect(() => serializeSessionCookie('bad;token')).toThrow(/cookie/i)
  })
})
