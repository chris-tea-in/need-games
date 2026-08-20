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

describe('App authentication control integration', () => {
  let container: HTMLDivElement
  let root: Root
  let controller: SessionController

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.history.replaceState({}, '', '/')
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
    controller = {
      beginSignIn: vi.fn(() => true),
      logout: vi.fn(() => Promise.resolve(true)),
      logoutPending: false,
      refresh: vi.fn(),
      signInPending: false,
      state: { kind: 'anonymous', steamSignInEnabled: true },
    }
    vi.mocked(useSession).mockReturnValue(controller)
    vi.mocked(loadCatalog).mockResolvedValue({
      data: catalogSnapshot,
      kind: 'data',
      source: 'snapshot',
    })
    vi.mocked(loadGameDetail).mockResolvedValue({ kind: 'not-found' })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  test('places the anonymous auth control in the page header and opens its modal', async () => {
    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })

    const trigger = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Authenticate with Steam'),
    )
    expect(trigger).not.toBeUndefined()
    expect(trigger?.closest('.page-header')).not.toBeNull()

    act(() => trigger?.click())
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(controller.beginSignIn).not.toHaveBeenCalled()

    const steamAction = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Authenticate on Steam'),
    )
    act(() => steamAction?.click())
    expect(controller.beginSignIn).toHaveBeenCalledWith('/')
  })
})
