// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { App } from '../../src/ui/App.js'
import { loadCatalog, loadGameDetail } from '../../src/ui/api-client.js'
import { useSession, type SessionController } from '../../src/ui/auth/use-session.js'

vi.mock('../../src/ui/api-client.js', () => ({
  loadCatalog: vi.fn(),
  loadGameDetail: vi.fn(),
}))

vi.mock('../../src/ui/auth/use-session.js', () => ({
  useSession: vi.fn(),
}))

describe('App authentication return integration', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/games/counter-strike-2?auth=failed')
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)

    const controller: SessionController = {
      beginSignIn: vi.fn(() => true),
      logout: vi.fn(() => Promise.resolve(true)),
      logoutPending: false,
      refresh: vi.fn(),
      signInPending: false,
      state: {
        csrfToken: 'OqtRhl8vRN75EU3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ',
        kind: 'authenticated',
        profile: { displayName: 'Steam User', lookupStatus: 'verified' },
        steamSignInEnabled: true,
      },
    }
    vi.mocked(useSession).mockReturnValue(controller)
    vi.mocked(loadCatalog).mockResolvedValue({
      data: catalogSnapshot,
      kind: 'data',
      source: 'snapshot',
    })
    vi.mocked(loadGameDetail).mockResolvedValue({
      data: {
        datasetVersion: catalogSnapshot.datasetVersion,
        game: catalogSnapshot.games[0],
        schemaVersion: catalogSnapshot.schemaVersion,
      },
      kind: 'data',
      source: 'snapshot',
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('returns to the same game without reopening authentication UI and clears the marker', async () => {
    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })

    expect(window.location.pathname).toBe('/games/counter-strike-2')
    expect(window.location.search).toBe('')
    expect(container.querySelector('h1')?.textContent).toBe('Counter-Strike 2')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Authentication failed. Please try again later.',
    )

    await act(() => vi.advanceTimersByTimeAsync(3200))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test('keeps a successful return on the same game without opening authentication UI', async () => {
    window.history.replaceState({}, '', '/games/counter-strike-2')

    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })

    expect(container.querySelector('h1')?.textContent).toBe('Counter-Strike 2')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test('keeps authentication controls and transient notices out of the generated catalog snapshot', () => {
    const snapshot = JSON.stringify(catalogSnapshot)

    expect(snapshot).not.toContain('Authenticate with Steam')
    expect(snapshot).not.toContain('Authentication failed. Please try again later.')
  })
})
