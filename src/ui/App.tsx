import { useEffect, useState } from 'react'

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
import { catalogSnapshot } from './generated/catalog-snapshot.js'

type ScreenState<T> = { kind: 'loading' } | T

function currentGameSlug(pathname: string): string | undefined {
  const match = /^\/games\/([^/]+)\/?$/.exec(pathname)
  return match === null ? undefined : decodeURIComponent(match[1])
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
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('title')
  const [catalogState, setCatalogState] = useState<ScreenState<CatalogLoadResult>>({
    kind: 'loading',
  })
  const [detailState, setDetailState] = useState<ScreenState<GameDetailLoadResult>>({
    kind: 'loading',
  })
  const slug = currentGameSlug(pathname)

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

  if (slug !== undefined) {
    if (detailState.kind === 'loading') {
      return <LoadingState />
    }
    if (detailState.kind === 'not-found') {
      return (
        <main className="not-found-page">
          <h1>Game not found</h1>
          <p>This game is not in the closed-beta catalog.</p>
          <a href="/">Back to catalog</a>
        </main>
      )
    }
    if (detailState.kind === 'error') {
      return <ErrorState message={detailState.message} />
    }

    return (
      <>
        {detailState.source === 'snapshot' ? (
          <OfflineNotice
            datasetVersion={detailState.data.datasetVersion}
            generatedAt={catalogSnapshot.generatedAt}
          />
        ) : null}
        <GameDetailPage game={detailState.data.game} />
      </>
    )
  }

  if (catalogState.kind === 'loading') {
    return <LoadingState />
  }
  if (catalogState.kind === 'error') {
    return <ErrorState message={catalogState.message} />
  }

  return (
    <>
      {catalogState.source === 'snapshot' ? (
        <OfflineNotice
          datasetVersion={catalogState.data.datasetVersion}
          generatedAt={catalogSnapshot.generatedAt}
        />
      ) : null}
      <CatalogPage
        catalog={catalogState.data}
        query={query}
        sort={sort}
        onQueryChange={setQuery}
        onSortChange={setSort}
      />
    </>
  )
}
