import {
  AUTH_ROUTES,
  SESSION_CACHE_CONTROL,
  isSessionResponse,
  type SessionResponse,
} from '../shared/session-contract.js'

export interface SessionClientOptions {
  fetcher?: typeof fetch
}

export type SessionClientErrorKind = 'network' | 'http' | 'invalid-response'

export class SessionClientError extends Error {
  readonly kind: SessionClientErrorKind
  readonly status: number | undefined

  constructor(kind: SessionClientErrorKind, status?: number) {
    super(
      kind === 'http'
        ? 'The session request failed.'
        : kind === 'invalid-response'
          ? 'The session response was invalid.'
          : 'The session request was unavailable.',
    )
    this.name = 'SessionClientError'
    this.kind = kind
    this.status = status
  }
}

function requestOptions(headers: HeadersInit): RequestInit {
  return {
    cache: SESSION_CACHE_CONTROL,
    credentials: 'same-origin',
    headers,
  }
}

export async function fetchSession({
  fetcher = fetch,
}: SessionClientOptions = {}): Promise<SessionResponse> {
  let response: Response
  try {
    response = await fetcher(AUTH_ROUTES.session, requestOptions({ accept: 'application/json' }))
  } catch {
    throw new SessionClientError('network')
  }

  if (!response.ok) {
    throw new SessionClientError('http', response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SessionClientError('invalid-response')
  }

  if (!isSessionResponse(body)) {
    throw new SessionClientError('invalid-response')
  }

  return body
}

export async function logoutSession(
  csrfToken: string,
  { fetcher = fetch }: SessionClientOptions = {},
): Promise<void> {
  let response: Response
  try {
    response = await fetcher(AUTH_ROUTES.logout, {
      ...requestOptions({ accept: 'application/json', 'X-CSRF-Token': csrfToken }),
      method: 'POST',
    })
  } catch {
    throw new SessionClientError('network')
  }

  if (!response.ok) {
    throw new SessionClientError('http', response.status)
  }
}

function safeReturnPath(returnPath: string): string {
  if (
    returnPath.length === 0 ||
    returnPath.length > 200 ||
    !returnPath.startsWith('/') ||
    returnPath.startsWith('//') ||
    returnPath.includes('\\')
  ) {
    return '/'
  }

  try {
    const parsed = new URL(returnPath, 'https://myplayprint.invalid')
    return parsed.origin === 'https://myplayprint.invalid' ? returnPath : '/'
  } catch {
    return '/'
  }
}

export function buildSteamSignInUrl(returnPath: string): string {
  const params = new URLSearchParams({ return: safeReturnPath(returnPath) })
  return `${AUTH_ROUTES.steamStart}?${params.toString()}`
}
