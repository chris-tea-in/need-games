// @vitest-environment jsdom

import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AUTH_ROUTES } from '../../src/shared/session-contract.js'
import { SESSION_COOKIE_NAME } from '../../src/worker/auth/session-cookie.js'
import {
  getPublicUserProfile,
  type PublicUserProfile,
} from '../../src/worker/repositories/identity.js'
import { handleRequest } from '../../src/worker/router.js'
import { fetchSession } from '../../src/ui/session-client.js'
import { AuthControl } from '../../src/ui/auth/auth-control.js'
import { AuthFailureNotice } from '../../src/ui/auth/auth-failure-notice.js'
import { consumeAuthFailureMarker, currentReturnPath } from '../../src/ui/auth/auth-return.js'
import { useSession } from '../../src/ui/auth/use-session.js'

const ORIGIN = 'https://myplayprint.e9k.workers.dev'
const STEAM_ID = '76561198000009991'
const STEAM_API_KEY = 'integration-steam-api-key'
const CSRF_SECRET = 'integration-csrf-secret'
const RETURN_PATH = '/games/apex-legends'
const RETURN_PATH_WITH_STATE = '/games/apex-legends?tab=reviews#comments'

type User = {
  id: string
  steam_id: string
  steam_display_name: string | null
  profile_lookup_status: 'verified' | 'unavailable'
  profile_checked_at: number
  created_at: number
}

type Session = {
  token_hash: string
  user_id: string
  created_at: number
  expires_at: number
  revoked_at: number | null
}

type LoginTransaction = {
  token_hash: string
  return_path: string
  created_at: number
  expires_at: number
  consumed_at: number | null
  steam_response_nonce: string | null
}

type Query = {
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}

/** The integration test only needs the D1 statements exercised by auth routes. */
class MemoryD1 {
  readonly users: User[] = []
  readonly sessions: Session[] = []
  readonly transactions: LoginTransaction[] = []
  readonly unavailable: boolean

  constructor(unavailable = false) {
    this.unavailable = unavailable
  }

  prepare(sql: string): { bind: (...values: unknown[]) => Query } {
    if (this.unavailable) {
      throw new Error('storage unavailable')
    }
    return {
      bind: (...values: unknown[]) => this.query(sql, values),
    }
  }

  async batch(statements: readonly Query[]): Promise<Array<{ meta: { changes: number } }>> {
    if (this.unavailable) {
      throw new Error('storage unavailable')
    }
    return Promise.all(statements.map((statement) => statement.run()))
  }

  private query(sql: string, values: unknown[]): Query {
    const normalized = sql.replaceAll(/\s+/g, ' ').trim().toLowerCase()
    const first = async <T,>(): Promise<T | null> => {
      await Promise.resolve()
      if (normalized.startsWith('update users')) {
        const user = this.users.find((row) => row.id === values[4])
        if (user === undefined) {
          return null
        }
        const status = String(values[2]) as User['profile_lookup_status']
        user.profile_lookup_status = status
        user.profile_checked_at = Number(values[3])
        if (status === 'verified') {
          user.steam_display_name = String(values[1])
        }
        return { ...user } as T
      }

      if (normalized.includes('from steam_login_transactions')) {
        const transaction = this.transactions.find((row) => row.token_hash === values[0])
        return (transaction === undefined ? null : { ...transaction }) as T | null
      }

      if (normalized.includes('from users')) {
        const user = normalized.includes('where id = ?')
          ? this.users.find((row) => row.id === values[0])
          : this.users.find((row) => row.steam_id === values[0])
        return (user === undefined ? null : { ...user }) as T | null
      }

      if (normalized.includes('from sessions')) {
        const tokenHash = values[0]
        const now = Number(values[1])
        const session = this.sessions.find(
          (row) => row.token_hash === tokenHash && row.revoked_at === null && row.expires_at > now,
        )
        if (session === undefined) {
          return null
        }
        const user = this.users.find((row) => row.id === session.user_id)
        if (user === undefined) {
          return null
        }
        return {
          token_hash: session.token_hash,
          user_id: session.user_id,
          created_at: session.created_at,
          expires_at: session.expires_at,
          revoked_at: session.revoked_at,
          steam_display_name: user.steam_display_name,
          profile_lookup_status: user.profile_lookup_status,
        } as T
      }

      if (normalized.includes('from games')) {
        const slug = String(values[0])
        if (!['apex-legends', 'counter-strike-2'].includes(slug)) {
          return null
        }
        return {
          id: `game-${slug}`,
          slug,
          steam_app_id: 1,
          title: slug === 'apex-legends' ? 'Apex Legends' : 'Counter-Strike 2',
          steam_title: slug === 'apex-legends' ? 'Apex Legends' : 'Counter-Strike 2',
          short_description: 'Integration fixture',
          source_tags_json: '[]',
          review_category: 'positive',
          review_count: 1,
          review_scope: 'all_reviews',
          source_app_details_url: 'https://store.steampowered.com/app/1',
          source_store_page_url: 'https://store.steampowered.com/app/1',
          source_fetched_at: '2026-01-01T00:00:00Z',
        } as T
      }

      if (normalized.includes('from catalog_release_metadata')) {
        return { dataset_version: 'integration', schema_version: 1 } as T
      }
      return null
    }

    const all = async <T,>(): Promise<{ results: T[] }> => {
      await Promise.resolve()
      if (normalized.startsWith('update steam_login_transactions')) {
        const transaction = this.transactions.find(
          (row) =>
            row.token_hash === values[2] &&
            row.consumed_at === null &&
            row.steam_response_nonce === null &&
            row.expires_at > Number(values[3]) &&
            !this.transactions.some((candidate) => candidate.steam_response_nonce === values[1]),
        )
        if (transaction === undefined) {
          return { results: [] }
        }
        transaction.consumed_at = Number(values[0])
        transaction.steam_response_nonce = String(values[1])
        return { results: [{ ...transaction }] as T[] }
      }
      return { results: [] }
    }

    const run = async (): Promise<{ meta: { changes: number } }> => {
      await Promise.resolve()
      if (normalized.startsWith('delete from')) {
        return { meta: { changes: 0 } }
      }

      if (normalized.startsWith('insert into steam_login_transactions')) {
        this.transactions.push({
          token_hash: String(values[0]),
          return_path: String(values[1]),
          created_at: Number(values[2]),
          expires_at: Number(values[3]),
          consumed_at: null,
          steam_response_nonce: null,
        })
        return { meta: { changes: 1 } }
      }

      if (normalized.startsWith('update steam_login_transactions')) {
        const transaction = this.transactions.find(
          (row) => row.token_hash === values[1] && row.consumed_at === null,
        )
        if (transaction === undefined) {
          return { meta: { changes: 0 } }
        }
        transaction.consumed_at = Number(values[0])
        return { meta: { changes: 1 } }
      }

      if (normalized.startsWith('insert into users')) {
        if (this.users.some((row) => row.steam_id === values[1])) {
          return { meta: { changes: 0 } }
        }
        this.users.push({
          id: String(values[0]),
          steam_id: String(values[1]),
          steam_display_name: null,
          profile_lookup_status: 'unavailable',
          profile_checked_at: Number(values[2]),
          created_at: Number(values[3]),
        })
        return { meta: { changes: 1 } }
      }

      if (normalized.startsWith('update users')) {
        const user = this.users.find((row) => row.id === values[4])
        if (user === undefined) {
          return { meta: { changes: 0 } }
        }
        const status = String(values[2]) as User['profile_lookup_status']
        user.profile_lookup_status = status
        user.profile_checked_at = Number(values[3])
        if (status === 'verified') {
          user.steam_display_name = String(values[1])
        }
        return { meta: { changes: 1 } }
      }

      if (normalized.startsWith('insert into sessions')) {
        this.sessions.push({
          token_hash: String(values[0]),
          user_id: String(values[1]),
          created_at: Number(values[2]),
          expires_at: Number(values[3]),
          revoked_at: null,
        })
        return { meta: { changes: 1 } }
      }

      if (normalized.startsWith('update sessions')) {
        const session = this.sessions.find(
          (row) => row.token_hash === values[1] && row.revoked_at === null,
        )
        if (session === undefined) {
          return { meta: { changes: 0 } }
        }
        session.revoked_at = Number(values[0])
        return { meta: { changes: 1 } }
      }

      throw new Error(`Unexpected integration SQL: ${sql}`)
    }

    return { first, all, run }
  }

  asDatabase(): D1Database {
    return this as unknown as D1Database
  }
}

type RouterEnvironment = Env & {
  NEED_GAMES_DB: D1Database
  PRODUCTION_ORIGIN: string
  STEAM_SIGN_IN_ENABLED: string
  CSRF_HMAC_SECRET: string
  STEAM_WEB_API_KEY: string
}

function environment(database: MemoryD1, enabled = true): RouterEnvironment {
  return {
    NEED_GAMES_DB: database.asDatabase(),
    PRODUCTION_ORIGIN: ORIGIN,
    STEAM_SIGN_IN_ENABLED: enabled ? 'true' : 'false',
    CSRF_HMAC_SECRET: CSRF_SECRET,
    STEAM_WEB_API_KEY: STEAM_API_KEY,
  } as RouterEnvironment
}

function callbackStateFromStart(response: Response): string {
  const steamLocation = new URL(response.headers.get('location') ?? '')
  const returnTo = new URL(steamLocation.searchParams.get('openid.return_to') ?? '')
  const state = returnTo.searchParams.get('state')
  if (state === null) {
    throw new Error('Steam start response omitted callback state')
  }
  return state
}

function steamAssertionQuery(state: string): string {
  const now = new Date(Math.floor(Date.now() / 1_000) * 1_000).toISOString().replace('.000Z', 'Z')
  const identity = `https://steamcommunity.com/openid/id/${STEAM_ID}`
  const params = new URLSearchParams({
    state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': identity,
    'openid.identity': identity,
    'openid.return_to': `${ORIGIN}${AUTH_ROUTES.steamCallback}?state=${encodeURIComponent(state)}`,
    'openid.response_nonce': `${now}integration-nonce`,
    'openid.assoc_handle': 'integration-handle',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'integration-signature',
  })
  return params.toString()
}

interface RouterClient {
  fetcher: typeof fetch
  cookieHeader: () => string
  setCookie: (name: string, value: string) => void
  setProfileAvailable: (available: boolean) => void
  externalRequests: string[]
}

function createRouterClient(getEnvironment: () => RouterEnvironment): RouterClient {
  const jar = new Map<string, string>()
  const externalRequests: string[] = []
  let profileAvailable = false

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      ORIGIN,
    )
    if (url.origin !== ORIGIN) {
      externalRequests.push(url.href)
      if (url.origin === 'https://steamcommunity.com') {
        return new Response('is_valid: true', { status: 200 })
      }
      if (profileAvailable) {
        return new Response(
          JSON.stringify({
            response: { players: [{ personaname: 'Integration Player', steamid: STEAM_ID }] },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        )
      }
      return new Response('profile unavailable', { status: 503 })
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    if (jar.size > 0 && !headers.has('Cookie')) {
      headers.set(
        'Cookie',
        [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      )
    }
    const request = new Request(url.href, { ...init, headers })
    const response = await handleRequest(request, getEnvironment())
    const nativeSetCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    const setCookies =
      nativeSetCookies.length > 0
        ? nativeSetCookies
        : (response.headers.get('set-cookie')?.split(/, (?=__Host-)/u) ?? [])
    for (const cookie of setCookies) {
      const match = /^([^=]+)=([^;]*)/.exec(cookie)
      if (match === null) continue
      if (cookie.includes('Max-Age=0')) {
        jar.delete(match[1])
      } else {
        jar.set(match[1], match[2])
      }
    }
    return response
  }

  return {
    fetcher,
    cookieHeader: () => [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
    setCookie: (name, value) => jar.set(name, value),
    setProfileAvailable: (available) => {
      profileAvailable = available
    },
    externalRequests,
  }
}

function AuthHarness({
  fetcher,
  navigate,
}: {
  fetcher: typeof fetch
  navigate?: (url: string) => void
}) {
  const session = useSession({ fetcher, navigate })
  const [authFailureVisible, setAuthFailureVisible] = useState(false)

  useEffect(() => {
    if (consumeAuthFailureMarker()) {
      setAuthFailureVisible(true)
    }
  }, [])

  return (
    <>
      {authFailureVisible ? (
        <AuthFailureNotice onDismiss={() => setAuthFailureVisible(false)} />
      ) : null}
      <div data-auth-background="true">
        <AuthControl
          beginSignIn={session.beginSignIn}
          currentPath={currentReturnPath()}
          logout={session.logout}
          logoutPending={session.logoutPending}
          signInPending={session.signInPending}
          state={session.state}
        />
      </div>
    </>
  )
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let count = 0; count < 20; count += 1) {
      await Promise.resolve()
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  })
}

function assertNoSensitiveValues(value: string, ...secrets: string[]): void {
  for (const secret of secrets) {
    expect(value).not.toContain(secret)
  }
}

describe('real-router Steam authentication flow', () => {
  let database: MemoryD1
  let activeEnvironment: RouterEnvironment
  let client: RouterClient
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.history.replaceState({}, '', RETURN_PATH)
    database = new MemoryD1()
    activeEnvironment = environment(database)
    client = createRouterClient(() => activeEnvironment)
    vi.stubGlobal('fetch', client.fetcher)
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  test('maps the real router anonymous response through the real session client and UI', async () => {
    const response = await fetchSession({ fetcher: client.fetcher })
    expect(response).toEqual({ authenticated: false, steamSignInEnabled: true })

    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} />)
      await Promise.resolve()
    })
    await settle()

    expect(container.textContent).toContain('Authenticate with Steam')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  test('keeps the disabled state read-only and hides authentication controls', async () => {
    activeEnvironment = environment(database, false)
    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} />)
      await Promise.resolve()
    })
    await settle()

    expect(container.querySelector('button')).toBeNull()
    await expect(fetchSession({ fetcher: client.fetcher })).resolves.toEqual({
      authenticated: false,
      steamSignInEnabled: false,
    })
  })

  test('maps storage-unavailable session responses to a renderable unavailable UI state', async () => {
    activeEnvironment = environment(new MemoryD1(true))
    client.setCookie(SESSION_COOKIE_NAME, 'U'.repeat(43))
    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} />)
      await Promise.resolve()
    })
    await settle()

    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).not.toContain('Authenticate with Steam')
  })

  test('keeps a session after two profile failures, uses Authenticated user attribution, returns safely, and logs out', async () => {
    const start = await client.fetcher(
      `${AUTH_ROUTES.steamStart}?return=${encodeURIComponent(RETURN_PATH)}`,
    )
    expect(start.status).toBe(302)
    const callbackState = callbackStateFromStart(start)
    const callback = await client.fetcher(
      `${ORIGIN}${AUTH_ROUTES.steamCallback}?${steamAssertionQuery(callbackState)}`,
    )
    expect(callback.status).toBe(302)
    const callbackLocation = callback.headers.get('location') ?? ''
    expect(new URL(callbackLocation).pathname).toBe(RETURN_PATH)
    assertNoSensitiveValues(callbackLocation, STEAM_API_KEY, STEAM_ID, CSRF_SECRET)
    assertNoSensitiveValues(await callback.text(), STEAM_API_KEY, STEAM_ID, CSRF_SECRET)
    expect(
      client.externalRequests.filter((url) => url.startsWith('https://api.steampowered.com/')),
    ).toHaveLength(2)

    const session = await fetchSession({ fetcher: client.fetcher })
    expect(session.authenticated).toBe(true)
    const profile: PublicUserProfile | null = await getPublicUserProfile(
      database.asDatabase(),
      database.users[0]?.id ?? '',
    )
    expect(profile).toEqual({
      id: database.users[0]?.id,
      displayName: null,
      profileLookupStatus: 'unavailable',
    })
    expect(profile?.displayName ?? 'Authenticated user').toBe('Authenticated user')

    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} />)
      await Promise.resolve()
    })
    await settle()
    const account = container.querySelector('button') as HTMLButtonElement
    expect(account.textContent).toContain('Steam account')
    await act(async () => {
      account.click()
      await Promise.resolve()
    })
    const signOut = container.querySelector('[role="menuitem"]') as HTMLButtonElement
    await act(async () => {
      signOut.click()
      await settle()
    })
    expect(container.textContent).toContain('Authenticate with Steam')
    await expect(fetchSession({ fetcher: client.fetcher })).resolves.toEqual({
      authenticated: false,
      steamSignInEnabled: true,
    })

    const sessionCookie = client.cookieHeader()
    assertNoSensitiveValues(sessionCookie, STEAM_API_KEY, STEAM_ID, CSRF_SECRET)
    assertNoSensitiveValues(JSON.stringify(session), STEAM_API_KEY, STEAM_ID, CSRF_SECRET)
  })

  test('closes the modal after a successful same-game return and shows the authenticated control', async () => {
    client.setProfileAvailable(true)
    window.history.replaceState({}, '', RETURN_PATH_WITH_STATE)
    let navigationDone: Promise<void> | undefined
    const navigate = vi.fn((url: string) => {
      navigationDone = (async () => {
        const started = await client.fetcher(new URL(url, ORIGIN).href)
        expect(started.status).toBe(302)
        const callbackState = callbackStateFromStart(started)
        const callback = await client.fetcher(
          `${ORIGIN}${AUTH_ROUTES.steamCallback}?${steamAssertionQuery(callbackState)}`,
        )
        expect(callback.status).toBe(302)
        const location = new URL(callback.headers.get('location') ?? '')
        expect(location.pathname).toBe(RETURN_PATH)
        expect(location.search).toBe('?tab=reviews')
        expect(location.hash).toBe('#comments')
        window.history.replaceState(
          {},
          '',
          `${location.pathname}${location.search}${location.hash}`,
        )
      })()
    })

    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} navigate={navigate} />)
      await Promise.resolve()
    })
    await settle()
    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
      await Promise.resolve()
    })
    await settle()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    const authenticate = document.querySelector('.auth-steam-action') as HTMLButtonElement
    await act(async () => {
      authenticate.click()
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await navigationDone

    await act(async () => {
      root.render(
        <AuthHarness key="authenticated-return" fetcher={client.fetcher} navigate={navigate} />,
      )
      await Promise.resolve()
    })
    await settle()
    expect(window.location.pathname).toBe(RETURN_PATH)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('Integration Player')
    expect(
      client.externalRequests.filter((url) => url.startsWith('https://api.steampowered.com/')),
    ).toHaveLength(1)
  })

  test('closes the modal and keeps the same game after an auth failure return', async () => {
    let navigationDone: Promise<void> | undefined
    const navigate = vi.fn((url: string) => {
      navigationDone = (async () => {
        const started = await client.fetcher(new URL(url, ORIGIN).href)
        expect(started.status).toBe(302)
        const failed = await client.fetcher(
          `${ORIGIN}${AUTH_ROUTES.steamCallback}?openid.mode=cancel`,
        )
        const location = new URL(failed.headers.get('location') ?? '')
        window.history.replaceState(
          {},
          '',
          `${location.pathname}${location.search}${location.hash}`,
        )
      })()
    })

    await act(async () => {
      root.render(<AuthHarness fetcher={client.fetcher} navigate={navigate} />)
      await Promise.resolve()
    })
    await settle()
    const trigger = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      trigger.click()
      await Promise.resolve()
    })
    await settle()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    const authenticate = document.querySelector('.auth-steam-action') as HTMLButtonElement
    await act(async () => {
      authenticate.click()
      await Promise.resolve()
    })
    expect(navigate).toHaveBeenCalledWith(
      `${AUTH_ROUTES.steamStart}?return=%2Fgames%2Fapex-legends`,
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await navigationDone

    await act(async () => {
      root.render(<AuthHarness key="returned" fetcher={client.fetcher} navigate={navigate} />)
      await Promise.resolve()
    })
    await settle()
    expect(window.location.pathname).toBe(RETURN_PATH)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Authentication failed. Please try again later.',
    )
  })
})
