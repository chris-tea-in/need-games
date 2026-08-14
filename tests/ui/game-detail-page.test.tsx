import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { GameDetailPage } from '../../src/ui/game-detail-page.js'

describe('GameDetailPage', () => {
  test('renders the review, provenance, and explicit unscored state without unavailable features', () => {
    const markup = renderToStaticMarkup(<GameDetailPage game={catalogSnapshot.games[0]} />)

    expect(markup).toContain('Counter-Strike 2')
    expect(markup).toContain('Very Positive')
    expect(markup).toContain('Score unavailable')
    expect(markup).toContain('Catalog source')
    expect(markup).toContain('Steam metadata fetched')
    expect(markup).not.toContain('Similar games')
    expect(markup).not.toContain('//comments//')
  })

  test('uses the PageHeader, DashboardGrid, Card, and Badge UI patterns', () => {
    const markup = renderToStaticMarkup(<GameDetailPage game={catalogSnapshot.games[0]} />)

    expect(markup).toContain('class="page-header game-identity"')
    expect(markup).toContain('class="dashboard-grid detail-layout"')
    expect(markup).toContain('class="card game-content"')
    expect(markup).toContain('class="card unscored-panel"')
    expect(markup).toContain('class="badge review-category"')
  })
})
