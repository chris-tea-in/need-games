import { useCallback, useEffect, useState, type ReactNode } from 'react'

import {
  loadCatalog,
  loadGameDetail,
  type CatalogLoadResult,
  type GameDetailLoadResult,
} from './api-client.js'
import { CatalogPage } from './catalog-page.js'
import { type CatalogSort } from './catalog-state.js'
import { GameDetailPage } from './game-detail-page.js'
import { OfflineNotice } from './offline-notice.js'
import { AuthControl } from './auth/auth-control.js'
import { AuthFailureNotice } from './auth/auth-failure-notice.js'
import { consumeAuthFailureMarker, currentReturnPath } from './auth/auth-return.js'
import { useSession } from './auth/use-session.js'
import { catalogSnapshot } from './generated/catalog-snapshot.js'

type ScreenState<T> = { kind: 'loading' } | T

function currentGameSlug(pathname: string): string | undefined {
  const match = /^\/games\/([^/]+)\/?$/.exec(pathname)
  if (match === null) {
    return undefined
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

function LoadingState() {
  return (
    <p className="status-message" role="status">
      Loading catalog data…
    </p>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <p className="status-message error-state" role="alert">
      {message}
    </p>
  )
}

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [authFailureVisible, setAuthFailureVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('title')
  const [catalogState, setCatalogState] = useState<ScreenState<CatalogLoadResult>>({
    kind: 'loading',
  })
  const [detailState, setDetailState] = useState<ScreenState<GameDetailLoadResult>>({
    kind: 'loading',
  })
  const session = useSession()
  const slug = currentGameSlug(pathname)
  const dismissAuthFailure = useCallback(() => setAuthFailureVisible(false), [])
  const authControl = (
    <AuthControl
      beginSignIn={session.beginSignIn}
      currentPath={currentReturnPath()}
      logout={session.logout}
      logoutPending={session.logoutPending}
      signInPending={session.signInPending}
      state={session.state}
    />
  )

  useEffect(() => {
    if (consumeAuthFailureMarker()) {
      setAuthFailureVisible(true)
    }
  }, [])

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', updatePathname)
    return () => window.removeEventListener('popstate', updatePathname)
  }, [])

  useEffect(() => {
    if (slug !== undefined) {
      return
    }

    let active = true
    setCatalogState({ kind: 'loading' })
    void loadCatalog().then((result) => {
      if (active) {
        setCatalogState(result)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (slug === undefined) {
      return
    }

    let active = true
    setDetailState({ kind: 'loading' })
    void loadGameDetail(slug).then((result) => {
      if (active) {
        setDetailState(result)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    document.title = slug === undefined ? 'Need Games catalog' : 'Need Games game detail'
  }, [slug])

  let content: ReactNode

  if (slug !== undefined) {
    if (detailState.kind === 'loading') {
      content = <LoadingState />
    } else if (detailState.kind === 'not-found') {
      content = (
        <main className="not-found-page">
          <h1>Game not found</h1>
          <p>This game is not in the closed-beta catalog.</p>
          <a href="/">Back to catalog</a>
        </main>
      )
    } else if (detailState.kind === 'error') {
      content = <ErrorState message={detailState.message} />
    } else {
      content = (
        <>
          {detailState.source === 'snapshot' ? (
            <OfflineNotice
              datasetVersion={detailState.data.datasetVersion}
              generatedAt={catalogSnapshot.generatedAt}
            />
          ) : null}
          <div data-auth-background="true">
            <GameDetailPage authControl={authControl} game={detailState.data.game} />
          </div>
        </>
      )
    }
  } else if (catalogState.kind === 'loading') {
    content = <LoadingState />
  } else if (catalogState.kind === 'error') {
    content = <ErrorState message={catalogState.message} />
  } else {
    content = (
      <>
        {catalogState.source === 'snapshot' ? (
          <OfflineNotice
            datasetVersion={catalogState.data.datasetVersion}
            generatedAt={catalogSnapshot.generatedAt}
          />
        ) : null}
        <div data-auth-background="true">
          <CatalogPage
            authControl={authControl}
            catalog={catalogState.data}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {authFailureVisible ? <AuthFailureNotice onDismiss={dismissAuthFailure} /> : null}
      {content}
    </>
  )
}
