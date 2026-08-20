import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { SessionState } from './use-session.js'

const FOCUSABLE_ELEMENT_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface AuthControlProps {
  beginSignIn: (returnPath: string) => boolean
  currentPath: string
  logout: () => Promise<boolean>
  logoutPending: boolean
  signInPending: boolean
  state: SessionState
}

interface AuthModalProps {
  onAuthenticate: () => void
  onClose: () => void
  onDialogRef: (element: HTMLDivElement | null) => void
  signInPending: boolean
}

function AuthModal({ onAuthenticate, onClose, onDialogRef, signInPending }: AuthModalProps) {
  return (
    <div
      aria-label="Steam authentication"
      className="auth-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-describedby="auth-modal-description"
        aria-labelledby="auth-modal-title"
        aria-modal="true"
        className="auth-modal card"
        onClick={(event) => event.stopPropagation()}
        ref={onDialogRef}
        role="dialog"
      >
        <div className="auth-modal-header">
          <h2 id="auth-modal-title">Authenticate with Steam</h2>
          <button
            aria-label="Close authentication dialog"
            className="auth-modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <p id="auth-modal-description">
          Use your Steam account to authenticate securely with Need Games. Steam keeps your
          credentials on its own site.
        </p>
        <button
          className="auth-steam-action"
          disabled={signInPending}
          onClick={onAuthenticate}
          type="button"
        >
          {signInPending ? 'Opening Steam…' : 'Authenticate on Steam'}
        </button>
      </div>
    </div>
  )
}

export function AuthControl({
  beginSignIn,
  currentPath,
  logout,
  logoutPending,
  signInPending,
  state,
}: AuthControlProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const initiatingControlRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const closeModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  useEffect(() => {
    if (!modalOpen) {
      initiatingControlRef.current?.focus()
      initiatingControlRef.current = null
      return
    }

    const activeElement = document.activeElement
    initiatingControlRef.current = activeElement instanceof HTMLElement ? activeElement : null
    const background = document.querySelector<HTMLElement>('[data-auth-background]')
    background?.setAttribute('inert', '')

    const focusDialog = () => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        FOCUSABLE_ELEMENT_SELECTOR,
      )
      firstFocusable?.focus()
    }
    focusDialog()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }

      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }

      const focusableElements = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR),
      ]
      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement)
      const nextIndex =
        currentIndex < 0
          ? event.shiftKey
            ? focusableElements.length - 1
            : 0
          : (currentIndex + (event.shiftKey ? -1 : 1) + focusableElements.length) %
            focusableElements.length
      event.preventDefault()
      ;(focusableElements[nextIndex] ?? (event.shiftKey ? firstElement : lastElement)).focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      background?.removeAttribute('inert')
    }
  }, [closeModal, modalOpen])

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const closeMenuFromOutside = (event: MouseEvent) => {
      if (controlRef.current?.contains(event.target as Node) !== true) {
        setMenuOpen(false)
      }
    }
    const closeMenuFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        accountTriggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', closeMenuFromOutside)
    document.addEventListener('keydown', closeMenuFromEscape)
    return () => {
      document.removeEventListener('mousedown', closeMenuFromOutside)
      document.removeEventListener('keydown', closeMenuFromEscape)
    }
  }, [menuOpen])

  if (state.kind === 'anonymous') {
    return (
      <div className="auth-control" ref={controlRef}>
        <button
          className="auth-trigger"
          disabled={signInPending}
          onClick={() => {
            initiatingControlRef.current = document.activeElement as HTMLElement | null
            setModalOpen(true)
          }}
          type="button"
        >
          Authenticate with Steam
        </button>
        {modalOpen
          ? createPortal(
              <AuthModal
                onAuthenticate={() => {
                  if (beginSignIn(currentPath)) {
                    closeModal()
                  }
                }}
                onClose={closeModal}
                onDialogRef={(element) => {
                  dialogRef.current = element
                }}
                signInPending={signInPending}
              />,
              document.body,
            )
          : null}
      </div>
    )
  }

  if (state.kind !== 'authenticated' && state.kind !== 'logging-out') {
    return null
  }

  const isLoggingOut = state.kind === 'logging-out' || logoutPending
  return (
    <div className="auth-control" ref={controlRef}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="auth-trigger auth-trigger-authenticated"
        disabled={isLoggingOut}
        onClick={() => setMenuOpen((open) => !open)}
        ref={accountTriggerRef}
        type="button"
      >
        <span aria-hidden="true" className="auth-verified-check">
          ✓
        </span>
        Authenticated with Steam
      </button>
      {menuOpen ? (
        <div className="auth-account-menu" role="menu">
          <button
            disabled={isLoggingOut}
            onClick={() => {
              void logout().then((success) => {
                if (success) {
                  setMenuOpen(false)
                }
              })
            }}
            role="menuitem"
            type="button"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
