import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  AnonymousSessionResponse,
  AuthenticatedSessionResponse,
  SessionResponse,
} from '../../shared/session-contract.js'
import {
  buildSteamSignInUrl,
  fetchSession,
  logoutSession,
  type SessionClientOptions,
} from '../session-client.js'

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'anonymous'; steamSignInEnabled: true }
  | { kind: 'disabled'; steamSignInEnabled: false }
  | {
      kind: 'authenticated'
      csrfToken: string
      steamSignInEnabled: boolean
    }
  | {
      kind: 'signing-in'
      returnPath: string
      steamSignInEnabled: true
    }
  | {
      kind: 'logging-out'
      csrfToken: string
      steamSignInEnabled: boolean
    }
  | { kind: 'unavailable'; message: string }

export interface UseSessionOptions extends SessionClientOptions {
  navigate?: (url: string) => void
}

export interface SessionController {
  state: SessionState
  signInPending: boolean
  logoutPending: boolean
  refresh: () => void
  beginSignIn: (returnPath: string) => boolean
  logout: () => Promise<boolean>
}

function stateFromResponse(response: SessionResponse): SessionState {
  if (!response.authenticated) {
    return response.steamSignInEnabled
      ? { kind: 'anonymous', steamSignInEnabled: true }
      : { kind: 'disabled', steamSignInEnabled: false }
  }

  return {
    csrfToken: response.csrfToken,
    kind: 'authenticated',
    steamSignInEnabled: response.steamSignInEnabled,
  }
}

function anonymousState(steamSignInEnabled: boolean): SessionState {
  return steamSignInEnabled
    ? { kind: 'anonymous', steamSignInEnabled: true }
    : { kind: 'disabled', steamSignInEnabled: false }
}

export function useSession({
  fetcher,
  navigate = (url) => window.location.assign(url),
}: UseSessionOptions = {}): SessionController {
  const [state, setState] = useState<SessionState>({ kind: 'loading' })
  const [refreshNumber, setRefreshNumber] = useState(0)
  const [signInPending, setSignInPending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const stateRef = useRef(state)
  const mountedRef = useRef(true)
  const signInPendingRef = useRef(false)
  const logoutPendingRef = useRef(false)
  stateRef.current = state

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setState({ kind: 'loading' })

    void fetchSession({ fetcher })
      .then((response) => {
        if (active) {
          setState(stateFromResponse(response))
        }
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'unavailable', message: 'Authentication status is unavailable.' })
        }
      })

    return () => {
      active = false
    }
  }, [fetcher, refreshNumber])

  const refresh = useCallback(() => {
    if (!signInPendingRef.current && !logoutPendingRef.current) {
      setRefreshNumber((number) => number + 1)
    }
  }, [])

  const beginSignIn = useCallback(
    (returnPath: string): boolean => {
      const currentState = stateRef.current
      if (signInPendingRef.current || currentState.kind !== 'anonymous') {
        return false
      }

      signInPendingRef.current = true
      setSignInPending(true)
      setState({
        kind: 'signing-in',
        returnPath,
        steamSignInEnabled: true,
      })

      try {
        navigate(buildSteamSignInUrl(returnPath))
      } catch {
        signInPendingRef.current = false
        setSignInPending(false)
        if (mountedRef.current) {
          setState(currentState)
        }
        return false
      }

      return true
    },
    [navigate],
  )

  const logout = useCallback(async (): Promise<boolean> => {
    const currentState = stateRef.current
    if (logoutPendingRef.current || currentState.kind !== 'authenticated') {
      return false
    }

    logoutPendingRef.current = true
    setLogoutPending(true)
    setState({
      csrfToken: currentState.csrfToken,
      kind: 'logging-out',
      steamSignInEnabled: currentState.steamSignInEnabled,
    })

    try {
      await logoutSession(currentState.csrfToken, { fetcher })
      if (mountedRef.current) {
        setState(anonymousState(currentState.steamSignInEnabled))
      }
      return true
    } catch {
      if (mountedRef.current) {
        setState(currentState)
      }
      return false
    } finally {
      logoutPendingRef.current = false
      setLogoutPending(false)
    }
  }, [fetcher])

  return {
    beginSignIn,
    logout,
    logoutPending,
    refresh,
    signInPending,
    state,
  }
}

export type { AnonymousSessionResponse, AuthenticatedSessionResponse }
