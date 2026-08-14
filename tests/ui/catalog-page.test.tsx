import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import type { CatalogResponse } from '../../src/shared/catalog-contract.js'
import { App } from '../../src/ui/App.js'
import { CatalogPage } from '../../src/ui/catalog-page.js'

const catalog: CatalogResponse = {
  datasetVersion: 'catalog-release-v1',
  schemaVersion: 1,
  games: [
    {
      id: 'steam-730',
      slug: 'counter-strike-2',
      steamAppId: 730,
      title: 'Counter-Strike 2',
      tags: ['FPS', 'Competitive'],
      review: {
        category: 'Very Positive',
        count: 2594111,
        scope: 'All Reviews: English Reviews',
      },
    },
    {
      id: 'steam-284160',
      slug: 'beamng-drive',
      steamAppId: 284160,
      title: 'BeamNG.drive',
      tags: ['Driving', 'Simulation'],
      review: {
        category: 'Overwhelmingly Positive',
        count: 207775,
        scope: 'All Reviews: English Reviews',
      },
    },
  ],
}

describe('CatalogPage', () => {
  test('announces a loading state before the catalog request completes', () => {
    vi.stubGlobal('window', { location: { pathname: '/' } })

    const markup = renderToStaticMarkup(<App />)

    vi.unstubAllGlobals()
    expect(markup).toContain('Loading catalog data…')
    expect(markup).toContain('role="status"')
  })

  test('renders accessible catalog controls and a link for each matching game', () => {
    const markup = renderToStaticMarkup(
      <CatalogPage
        catalog={catalog}
        query="counter"
        sort="title"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    )

    expect(markup).toContain('Search games')
    expect(markup).toContain('Sort catalog')
    expect(markup).toContain('Counter-Strike 2')
    expect(markup).toContain('Very Positive')
    expect(markup).toContain('2,594,111 reviews')
    expect(markup).toContain('href="/games/counter-strike-2"')
  })

  test('uses the PageHeader, DashboardGrid, Card, and Badge UI patterns', () => {
    const markup = renderToStaticMarkup(
      <CatalogPage
        catalog={catalog}
        query=""
        sort="title"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    )

    expect(markup).toContain('class="page-header"')
    expect(markup).toContain('class="dashboard-grid catalog-grid"')
    expect(markup).toContain('class="card game-card"')
    expect(markup).toContain('class="badge review-category"')
  })

  test('renders a visible empty state for a valid empty catalog', () => {
    const markup = renderToStaticMarkup(
      <CatalogPage
        catalog={{ ...catalog, games: [] }}
        query=""
        sort="title"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    )

    expect(markup).toContain('No games match this catalog view.')
  })

  test('filters cards by title or tag', () => {
    const markup = renderToStaticMarkup(
      <CatalogPage
        catalog={catalog}
        query="fps"
        sort="reviews"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    )

    expect(markup).toContain('Counter-Strike 2')
    expect(markup).not.toContain('BeamNG.drive')
  })

  test('orders catalog cards by review count when that sort is selected', () => {
    const markup = renderToStaticMarkup(
      <CatalogPage
        catalog={catalog}
        query=""
        sort="reviews"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    )

    expect(markup.indexOf('Counter-Strike 2')).toBeLessThan(markup.indexOf('BeamNG.drive'))
  })
})
