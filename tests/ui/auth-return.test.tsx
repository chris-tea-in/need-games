// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  AUTH_FAILURE_QUERY_PARAMETER,
  AUTH_FAILURE_QUERY_VALUE,
} from '../../src/shared/session-contract.js'
import { AuthFailureNotice } from '../../src/ui/auth/auth-failure-notice.js'
import { consumeAuthFailureMarker, currentReturnPath } from '../../src/ui/auth/auth-return.js'

describe('Steam authentication return handling', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
    window.history.replaceState({ from: 'steam' }, '', '/games/counter-strike-2')
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('preserves the exact same-origin page path including query and hash', () => {
    window.history.replaceState(
      { from: 'steam' },
      '',
      '/games/counter-strike-2?view=details#reviews',
    )

    expect(currentReturnPath()).toBe('/games/counter-strike-2?view=details#reviews')
  })

  test('consumes only the frozen auth=failed marker without adding history', () => {
    window.history.replaceState(
      { from: 'steam' },
      '',
      `/games/counter-strike-2?view=details&${AUTH_FAILURE_QUERY_PARAMETER}=${AUTH_FAILURE_QUERY_VALUE}#reviews`,
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    expect(consumeAuthFailureMarker()).toBe(true)
    expect(window.location.pathname).toBe('/games/counter-strike-2')
    expect(window.location.search).toBe('?view=details')
    expect(window.location.hash).toBe('#reviews')
    expect(window.history.state).toEqual({ from: 'steam' })
    expect(replaceState).toHaveBeenCalledOnce()

    window.history.replaceState({}, '', '/games/counter-strike-2?auth=cancelled')
    expect(consumeAuthFailureMarker()).toBe(false)
    expect(window.location.search).toBe('?auth=cancelled')
  })

  test('keeps an accessible notice for three seconds, then removes it', () => {
    const onDismiss = vi.fn()

    act(() => {
      root.render(<AuthFailureNotice onDismiss={onDismiss} />)
    })

    const notice = container.querySelector('[role="alert"]')
    expect(notice?.textContent).toBe('Authentication failed. Please try again later.')
    expect(notice?.getAttribute('aria-live')).toBe('assertive')
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(notice?.classList.contains('auth-failure-notice--fading')).toBe(true)
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  test('removes the notice at three seconds without a fade when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const onDismiss = vi.fn()

    act(() => {
      root.render(<AuthFailureNotice onDismiss={onDismiss} />)
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(container.querySelector('.auth-failure-notice--fading')).toBeNull()
  })
})
