// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AuthControl } from '../../src/ui/auth/auth-control.js'
import type { SessionState } from '../../src/ui/auth/use-session.js'

const csrfToken = 'OqtRhl8vRN75EUQ3YJ-JfYb3Pg-A-T7QQXovh-vm5aQ'

function renderControl(state: SessionState, currentPath = '/games/counter-strike-2') {
  const container = document.createElement('div')
  container.dataset.authBackground = 'true'
  document.body.append(container as never)
  const root = createRoot(container)
  const beginSignIn = vi.fn(() => true)
  const logout = vi.fn(() => Promise.resolve(true))

  act(() => {
    root.render(
      <AuthControl
        beginSignIn={beginSignIn}
        currentPath={currentPath}
        logout={logout}
        logoutPending={false}
        signInPending={false}
        state={state}
      />,
    )
  })

  return { beginSignIn, container, logout, root }
}

describe('AuthControl', () => {
  let roots: Root[] = []

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    roots = []
  })

  afterEach(() => {
    act(() => {
      roots.forEach((root) => root.unmount())
    })
    document.body.innerHTML = ''
  })

  test('opens a centered Steam authentication dialog without navigating until its action is selected', () => {
    const { beginSignIn, container, root } = renderControl({
      kind: 'anonymous',
      steamSignInEnabled: true,
    })
    roots.push(root)

    const trigger = container.querySelector('button') as HTMLButtonElement
    act(() => trigger.click())

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Authenticate with Steam')
    expect(dialog?.textContent).toContain('Authenticate on Steam')
    expect(beginSignIn).not.toHaveBeenCalled()
    expect(container.hasAttribute('inert')).toBe(true)
  })

  test('dismisses the dialog from close, outside click, and Escape while restoring focus', () => {
    const { container, root } = renderControl({
      kind: 'anonymous',
      steamSignInEnabled: true,
    })
    roots.push(root)
    const trigger = container.querySelector('button') as HTMLButtonElement
    trigger.focus()

    act(() => trigger.click())
    const close = document.querySelector('button[aria-label="Close authentication dialog"]')
    expect(close).not.toBeNull()

    act(() => (close as HTMLButtonElement).click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(container.hasAttribute('inert')).toBe(false)

    act(() => trigger.click())
    const backdrop = document.querySelector('.auth-modal-backdrop') as HTMLElement
    act(() => backdrop.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(container.hasAttribute('inert')).toBe(false)

    act(() => trigger.click())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(container.hasAttribute('inert')).toBe(false)
  })

  test('traps Tab focus in the dialog and starts same-origin authentication from its Steam action', () => {
    const { beginSignIn, container, root } = renderControl({
      kind: 'anonymous',
      steamSignInEnabled: true,
    })
    roots.push(root)
    const trigger = container.querySelector('button') as HTMLButtonElement

    act(() => trigger.click())
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const buttons = [...dialog.querySelectorAll('button')] as HTMLButtonElement[]
    expect(document.activeElement).toBe(buttons[0])

    buttons[0].focus()
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }),
      )
    })
    expect(document.activeElement).toBe(buttons[1])

    buttons[1].focus()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
    })
    expect(document.activeElement).toBe(buttons[0])

    act(() => buttons[1].click())
    expect(beginSignIn).toHaveBeenCalledWith('/games/counter-strike-2')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.hasAttribute('inert')).toBe(false)
  })

  test('renders a verified account button and signs out from its menu', async () => {
    const { container, logout, root } = renderControl({
      csrfToken,
      kind: 'authenticated',
      profile: { displayName: 'Steam User', lookupStatus: 'verified' },
      steamSignInEnabled: true,
    })
    roots.push(root)

    const accountButton = container.querySelector('button') as HTMLButtonElement
    expect(accountButton.textContent).toContain('Steam User')
    expect(accountButton.textContent).toContain('✓')

    act(() => accountButton.click())
    const signOut = container.querySelector('[role="menuitem"]') as HTMLButtonElement
    expect(signOut).not.toBeNull()
    await act(async () => {
      signOut.click()
      await Promise.resolve()
    })
    expect(logout).toHaveBeenCalledOnce()
  })

  test('restores focus to the authenticated trigger when Escape closes the menu', () => {
    const { container, root } = renderControl({
      csrfToken,
      kind: 'authenticated',
      profile: { displayName: 'Steam User', lookupStatus: 'verified' },
      steamSignInEnabled: true,
    })
    roots.push(root)

    const accountButton = container.querySelector('button') as HTMLButtonElement
    act(() => accountButton.click())
    const signOut = container.querySelector('[role="menuitem"]') as HTMLButtonElement
    signOut.focus()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })

    expect(container.querySelector('[role="menuitem"]')).toBeNull()
    expect(document.activeElement).toBe(accountButton)
  })

  test('renders the authenticated control as disabled while logging out', () => {
    const { container, root } = renderControl({
      csrfToken,
      kind: 'logging-out',
      profile: { displayName: null, lookupStatus: 'unavailable' },
      steamSignInEnabled: false,
    })
    roots.push(root)

    const accountButton = container.querySelector('button') as HTMLButtonElement
    expect(accountButton.disabled).toBe(true)
    expect(accountButton.textContent).toContain('Steam account')
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  test('does not render an auth control while session state is loading or signing in', () => {
    const loading = renderControl({ kind: 'loading' })
    roots.push(loading.root)
    expect(loading.container.querySelector('button')).toBeNull()
    act(() => loading.root.unmount())
    loading.container.remove()

    const signingIn = renderControl({
      kind: 'signing-in',
      returnPath: '/games/counter-strike-2',
      steamSignInEnabled: true,
    })
    roots.push(signingIn.root)
    expect(signingIn.container.querySelector('button')).toBeNull()
  })

  test('does not expose authentication controls when sign-in is disabled or unavailable', () => {
    const disabled = renderControl({ kind: 'disabled', steamSignInEnabled: false })
    roots.push(disabled.root)
    expect(disabled.container.querySelector('button')).toBeNull()
    act(() => disabled.root.unmount())
    disabled.container.remove()

    const unavailable = renderControl({ kind: 'unavailable', message: 'unavailable' })
    roots.push(unavailable.root)
    expect(unavailable.container.querySelector('button')).toBeNull()
  })
})
