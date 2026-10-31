import type { ReactNode } from 'react'

/** Four process-ink squares, the color bar printed along the edge of every box. */
function ColorBar() {
  return (
    <span aria-hidden="true" className="color-bar">
      <span className="color-bar-ink color-bar-ink--micro" />
      <span className="color-bar-ink color-bar-ink--meso" />
      <span className="color-bar-ink color-bar-ink--macro" />
      <span className="color-bar-ink color-bar-ink--key" />
    </span>
  )
}

export function SiteHeader({ authControl }: { authControl?: ReactNode }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/">
        <ColorBar />
        <span className="wordmark-name">Need Games</span>
      </a>
      {authControl}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="wordmark-name">Need Games</span>
      <span>Closed beta. Game art and store metadata come from Steam.</span>
    </footer>
  )
}

type IconName = 'arrow-left' | 'arrow-up-right' | 'check' | 'close' | 'search'

const ICON_PATHS: Readonly<Record<IconName, string>> = {
  'arrow-left': 'M19 12H5m6-6-6 6 6 6',
  'arrow-up-right': 'M7 17 17 7m-8 0h8v8',
  check: 'm5 12.5 4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon icon--${name}`}
      fill="none"
      focusable="false"
      height="24"
      stroke="currentColor"
      strokeLinecap="square"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
