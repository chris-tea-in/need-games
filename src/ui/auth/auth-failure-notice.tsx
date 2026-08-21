import { useEffect, useState } from 'react'

const AUTH_FAILURE_NOTICE_DURATION_MS = 3000
const AUTH_FAILURE_NOTICE_FADE_MS = 200

interface AuthFailureNoticeProps {
  onDismiss: () => void
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function AuthFailureNotice({ onDismiss }: AuthFailureNoticeProps) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    let removeTimeout: number | undefined
    const fadeTimeout = window.setTimeout(() => {
      if (prefersReducedMotion()) {
        onDismiss()
        return
      }

      setFading(true)
      removeTimeout = window.setTimeout(onDismiss, AUTH_FAILURE_NOTICE_FADE_MS)
    }, AUTH_FAILURE_NOTICE_DURATION_MS)

    return () => {
      window.clearTimeout(fadeTimeout)
      if (removeTimeout !== undefined) {
        window.clearTimeout(removeTimeout)
      }
    }
  }, [onDismiss])

  return (
    <div
      aria-live="assertive"
      className={`auth-failure-notice${fading ? ' auth-failure-notice--fading' : ''}`}
      role="alert"
    >
      Authentication failed. Please try again later.
    </div>
  )
}
