export const AUTH_RESULT_CODES = [
  'sign_in_disabled',
  'authentication_failed',
  'steam_confirmation_failed',
  'invalid_login_transaction',
  'invalid_steam_assertion',
  'expired_login_transaction',
  'callback_replayed',
  'invalid_csrf',
  'identity_storage_unavailable',
] as const

export type AuthResultCode = (typeof AUTH_RESULT_CODES)[number]

export const PROFILE_LOOKUP_STATUSES = ['verified', 'unavailable'] as const

export type ProfileLookupStatus = (typeof PROFILE_LOOKUP_STATUSES)[number]

export const AUTH_FAILURE_QUERY_PARAMETER = 'auth' as const
export const AUTH_FAILURE_QUERY_VALUE = 'failed' as const

export const AUTH_ROUTES = {
  logout: '/api/auth/logout',
  session: '/api/session',
  steamCallback: '/api/auth/steam/callback',
  steamStart: '/api/auth/steam/start',
} as const

export const SESSION_CACHE_CONTROL = 'no-store' as const

export const STEAM_LOGIN_TRANSACTION_LIFETIME_SECONDS = 10 * 60
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60

export interface AnonymousSessionResponse {
  authenticated: false
  steamSignInEnabled: boolean
}

export interface AuthenticatedSessionResponse {
  authenticated: true
  csrfToken: string
  profile: {
    displayName: string | null
    lookupStatus: ProfileLookupStatus
  }
  steamSignInEnabled: boolean
}

export type SessionResponse = AnonymousSessionResponse | AuthenticatedSessionResponse

const csrfTokenPattern = /^[A-Za-z0-9_-]{43}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((expectedKey) => Object.hasOwn(value, expectedKey))
  )
}

export function isSessionResponse(value: unknown): value is SessionResponse {
  if (
    !isRecord(value) ||
    typeof value.authenticated !== 'boolean' ||
    typeof value.steamSignInEnabled !== 'boolean'
  ) {
    return false
  }

  if (!value.authenticated) {
    return hasExactKeys(value, ['authenticated', 'steamSignInEnabled'])
  }

  const profile = value.profile
  return (
    hasExactKeys(value, ['authenticated', 'csrfToken', 'profile', 'steamSignInEnabled']) &&
    typeof value.csrfToken === 'string' &&
    csrfTokenPattern.test(value.csrfToken) &&
    isRecord(profile) &&
    hasExactKeys(profile, ['displayName', 'lookupStatus']) &&
    (profile.displayName === null || typeof profile.displayName === 'string') &&
    PROFILE_LOOKUP_STATUSES.some((status) => status === profile.lookupStatus) &&
    (profile.lookupStatus === 'verified'
      ? typeof profile.displayName === 'string' && profile.displayName.length > 0
      : profile.displayName === null)
  )
}
