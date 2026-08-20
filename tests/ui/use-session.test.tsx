// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AUTH_ROUTES } from '../../src/shared/session-contract.js'
import {
  fetchSession,
  logoutSession,
  type SessionClientError,
} from '../../src/ui/session-client.js'
import { useSession, type SessionController } from '../../src/ui/auth/use-session.js'

vi.mock('../../src/ui/session-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/ui/session-client.js')>(
    '../../src/ui/session-client.js',
  )
  return {
    ...actual,
    fetchSession: vi.fn(),
    logoutSession: vi.fn(),
  }
})

const csrfToken = 'OqtRhl8vRN75EUQ3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ'

function Probe({ navigate }: { navigate?: (url: string) => void }) {
  const session = useSession({ navigate })
  return (
    <output
      data-kind={session.state.kind}
      data-sign-in-pending={String(session.signInPending)}
      data-logout-pending={String(session.logoutPending)}
    >
      {session.state.kind === 'authenticated' ? session.state.csrfToken : ''}
    </output>
  )
}

function CapturedProbe({
  navigate,
  onSession,
}: {
  navigate?: (url: string) => void
  onSession: (session: SessionController) => void
}) {
  const session = useSession({ navigate })
  onSession(session)
  return (
    <output
      data-kind={session.state.kind}
      data-sign-in-pending={String(session.signInPending)}
      data-logout-pending={String(session.logoutPending)}
    >
      {session.state.kind === 'authenticated' || session.state.kind === 'logging-out'
        ? session.state.csrfToken
        : ''}
    </output>
  )
}

describe('useSession', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
    vi.mocked(fetchSession).mockReset()
    vi.mocked(logoutSession).mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  test('starts in loading until the mocked session response resolves', async () => {
    let resolveSession!: (response: { authenticated: false; steamSignInEnabled: true }) => void
    const pendingSession = new Promise<{ authenticated: false; steamSignInEnabled: true }>(
      (resolve) => {
        resolveSession = resolve
      },
    )
    vi.mocked(fetchSession).mockReturnValue(pendingSession)

    await act(() => {
      root.render(<Probe />)
      return Promise.resolve()
    })

    expect(container.querySelector('output')?.dataset.kind).toBe('loading')

    await act(async () => {
      resolveSession({ authenticated: false, steamSignInEnabled: true })
      await pendingSession
    })
    expect(container.querySelector('output')?.dataset.kind).toBe('anonymous')
  })

  test('maps anonymous-enabled and authenticated sign-in-disabled responses', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ authenticated: false, steamSignInEnabled: true })
    let session!: SessionController

    await act(() => {
      root.render(<CapturedProbe onSession={(value) => (session = value)} />)
      return Promise.resolve()
    })

    expect(session.state).toEqual({ kind: 'anonymous', steamSignInEnabled: true })

    vi.mocked(fetchSession).mockResolvedValue({
      authenticated: true,
      csrfToken,
      steamSignInEnabled: false,
    })
    await act(() => {
      root.render(<CapturedProbe key="authenticated" onSession={(value) => (session = value)} />)
      return Promise.resolve()
    })

    expect(session.state).toEqual({
      kind: 'authenticated',
      csrfToken,
      steamSignInEnabled: false,
    })
  })

  test('maps a disabled session response to a disabled UI state', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ authenticated: false, steamSignInEnabled: false })

    await act(() => {
      root.render(<Probe />)
      return Promise.resolve()
    })

    expect(container.querySelector('output')?.dataset).toMatchObject({
      kind: 'disabled',
      signInPending: 'false',
      logoutPending: 'false',
    })
  })

  test('keeps an authenticated CSRF token in component state and clears it after logout', async () => {
    vi.mocked(fetchSession).mockResolvedValue({
      authenticated: true,
      csrfToken,
      steamSignInEnabled: true,
    })
    vi.mocked(logoutSession).mockResolvedValue(undefined)

    let controller: SessionController | undefined
    function Capture() {
      controller = useSession()
      return <Probe />
    }

    await act(() => {
      root.render(<Capture />)
      return Promise.resolve()
    })
    expect(controller?.state).toEqual({
      kind: 'authenticated',
      csrfToken,
      steamSignInEnabled: true,
    })

    await act(async () => {
      await controller?.logout()
    })
    expect(logoutSession).toHaveBeenCalledWith(csrfToken, expect.any(Object))
    expect(controller?.state).toEqual({ kind: 'anonymous', steamSignInEnabled: true })
  })

  test('reports an unavailable state when the session request fails while the app remains renderable', async () => {
    const error = new Error('network unavailable') as SessionClientError
    vi.mocked(fetchSession).mockRejectedValue(error)

    await act(() => {
      root.render(<Probe />)
      return Promise.resolve()
    })

    expect(container.querySelector('output')?.dataset.kind).toBe('unavailable')
    expect(container.querySelector('output')).not.toBeNull()
  })

  test('ignores a duplicate logout while the first logout is pending', async () => {
    let resolveLogout!: () => void
    const pendingLogout = new Promise<void>((resolve) => {
      resolveLogout = resolve
    })
    vi.mocked(fetchSession).mockResolvedValue({
      authenticated: true,
      csrfToken,
      steamSignInEnabled: true,
    })
    vi.mocked(logoutSession).mockReturnValue(pendingLogout)

    let controller: SessionController | undefined
    function Capture() {
      controller = useSession()
      return <Probe />
    }

    await act(() => {
      root.render(<Capture />)
      return Promise.resolve()
    })

    let secondResult: Promise<boolean> | undefined
    await act(() => {
      void controller?.logout()
      secondResult = controller?.logout()
      return Promise.resolve()
    })
    await expect(secondResult).resolves.toBe(false)
    expect(logoutSession).toHaveBeenCalledTimes(1)
    expect(controller?.state.kind).toBe('logging-out')
    expect(controller?.logoutPending).toBe(true)

    await act(async () => {
      resolveLogout()
      await pendingLogout
    })
    expect(controller?.logoutPending).toBe(false)
  })

  test('ignores a duplicate sign-in while navigation is pending', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ authenticated: false, steamSignInEnabled: true })
    const navigate = vi.fn()
    let controller: SessionController | undefined
    function Capture() {
      controller = useSession({ navigate })
      return <Probe navigate={navigate} />
    }

    await act(() => {
      root.render(<Capture />)
      return Promise.resolve()
    })

    await act(() => {
      expect(controller?.beginSignIn('/games/counter-strike-2')).toBe(true)
      expect(controller?.beginSignIn('/games/beamng-drive')).toBe(false)
      return Promise.resolve()
    })
    expect(navigate).toHaveBeenCalledWith(
      `${AUTH_ROUTES.steamStart}?return=%2Fgames%2Fcounter-strike-2`,
    )
    await act(() => Promise.resolve())
    expect(controller?.signInPending).toBe(true)
  })

  test('restores the anonymous state when sign-in navigation throws', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ authenticated: false, steamSignInEnabled: true })
    const navigate = vi.fn(() => {
      throw new Error('navigation unavailable')
    })
    let controller: SessionController | undefined

    await act(() => {
      root.render(<CapturedProbe navigate={navigate} onSession={(value) => (controller = value)} />)
      return Promise.resolve()
    })

    await act(() => {
      expect(controller?.beginSignIn('/games/counter-strike-2')).toBe(false)
      return Promise.resolve()
    })

    expect(controller?.state).toEqual({ kind: 'anonymous', steamSignInEnabled: true })
    expect(controller?.signInPending).toBe(false)
    expect(navigate).toHaveBeenCalledOnce()
  })

  test('restores the authenticated state after a failed logout and clears pending state', async () => {
    vi.mocked(fetchSession).mockResolvedValue({
      authenticated: true,
      csrfToken,
      steamSignInEnabled: true,
    })
    vi.mocked(logoutSession).mockRejectedValue(new Error('logout failed'))
    let controller: SessionController | undefined

    await act(() => {
      root.render(<CapturedProbe onSession={(value) => (controller = value)} />)
      return Promise.resolve()
    })

    await act(async () => {
      await expect(controller?.logout()).resolves.toBe(false)
    })

    expect(controller?.state).toEqual({
      kind: 'authenticated',
      csrfToken,
      steamSignInEnabled: true,
    })
    expect(controller?.logoutPending).toBe(false)
  })
})
