import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  loadCatalog,
  loadGameDetail,
  loadSimilarGames,
  type CatalogLoadResult,
  type GameDetailLoadResult,
  type SimilarGamesLoadResult,
} from './api-client.js'
import { CatalogPage } from './catalog-page.js'
import { type CatalogSort } from './catalog-state.js'
import { GameDetailPage, type SimilarGamesView } from './game-detail-page.js'
import { OfflineNotice } from './offline-notice.js'
import { AuthControl } from './auth/auth-control.js'
import { AuthFailureNotice } from './auth/auth-failure-notice.js'
import { consumeAuthFailureMarker, currentReturnPath } from './auth/auth-return.js'
import { useSession } from './auth/use-session.js'
import { catalogSnapshot } from './generated/catalog-snapshot.js'
import { Icon, SiteFooter, SiteHeader } from './site-chrome.js'
import type { MimmaScore } from '../shared/mimma.js'

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

function similarGamesView(
  state: ScreenState<SimilarGamesLoadResult>,
): SimilarGamesView | undefined {
  if (state.kind === 'loading') return { kind: 'loading' }
  if (state.kind === 'data') return { games: state.games, kind: 'data' }
  if (state.kind === 'error') return { kind: 'error' }
  return undefined
}

/**
 * The catalog API carries no scores, but the bundled snapshot does. Use them for the shelf
 * strips only when the snapshot is the same reviewed release the catalog came from.
 */
function snapshotScoresFor(datasetVersion: string): ReadonlyMap<string, MimmaScore> | undefined {
  if (datasetVersion !== catalogSnapshot.datasetVersion) return undefined

  const scores = new Map<string, MimmaScore>()
  for (const game of catalogSnapshot.games) {
    if (game.authoritativeScore !== null) scores.set(game.id, game.authoritativeScore)
  }
  return scores
}

function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="status-page">{children}</main>
      <SiteFooter />
    </>
  )
}

function LoadingState() {
  return (
    <StatusScreen>
      <p className="status-message" role="status">
        Loading catalog data…
      </p>
    </StatusScreen>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <StatusScreen>
      <p className="status-message error-state" role="alert">
        {message}
      </p>
    </StatusScreen>
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
  const [similarState, setSimilarState] = useState<ScreenState<SimilarGamesLoadResult>>({
    kind: 'loading',
  })
  const session = useSession()
  const slug = currentGameSlug(pathname)
  const catalogVersion = catalogState.kind === 'data' ? catalogState.data.datasetVersion : undefined
  const catalogScores = useMemo(
    () => (catalogVersion === undefined ? undefined : snapshotScoresFor(catalogVersion)),
    [catalogVersion],
  )
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
    setSimilarState({ kind: 'loading' })
    void loadGameDetail(slug).then((result) => {
      if (active) {
        setDetailState(result)
      }
    })
    void loadSimilarGames(slug).then((result) => {
      if (active) {
        setSimilarState(result)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  const detailTitle = detailState.kind === 'data' ? detailState.data.game.title : undefined
  useEffect(() => {
    if (slug === undefined) {
      document.title = 'Need Games catalog'
    } else {
      document.title =
        detailTitle === undefined ? 'Need Games game detail' : `${detailTitle} | Need Games`
    }
  }, [slug, detailTitle])

  let content: ReactNode

  if (slug !== undefined) {
    if (detailState.kind === 'loading') {
      content = <LoadingState />
    } else if (detailState.kind === 'not-found') {
      content = (
        <StatusScreen>
          <div className="not-found-page">
            <p className="stamp">Not on the shelf</p>
            <h1>Game not found</h1>
            <p>This game is not in the closed-beta catalog.</p>
            <a className="back-link" href="/">
              <Icon name="arrow-left" />
              Back to catalog
            </a>
          </div>
        </StatusScreen>
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
            <GameDetailPage
              authControl={authControl}
              game={detailState.data.game}
              similarGames={similarGamesView(similarState)}
            />
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
            scores={catalogScores}
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
