import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { GameDetailPage } from '../../src/ui/game-detail-page.js'

function snapshotGame(slug: string) {
  const game = catalogSnapshot.games.find((candidate) => candidate.slug === slug)
  if (game === undefined) {
    throw new Error(`Snapshot game ${slug} is missing.`)
  }
  return game
}

describe('GameDetailPage', () => {
  test('renders the review, provenance, and the MiMMa graph for a scored game', () => {
    const markup = renderToStaticMarkup(<GameDetailPage game={snapshotGame('counter-strike-2')} />)

    expect(markup).toContain('Counter-Strike 2')
    expect(markup).toContain('Very Positive')
    expect(markup).toContain('Catalog source')
    expect(markup).toContain('Steam metadata fetched')
    expect(markup).toContain('Gameplay profile')
    expect(markup).toContain('aria-valuenow="100"')
    expect(markup).toContain('Owner-authoritative snapshot v1')
    expect(markup).not.toContain('Score unavailable')
    expect(markup).not.toContain('//comments//')
  })

  test('renders the explicit unscored state without a similar-games section', () => {
    const markup = renderToStaticMarkup(
      <GameDetailPage game={snapshotGame('destiny-2')} similarGames={{ kind: 'loading' }} />,
    )

    expect(markup).toContain('Score unavailable')
    expect(markup).not.toContain('mimma-graph')
    expect(markup).not.toContain('Similar games')
  })

  test('lists similar games with links in ranked order', () => {
    const markup = renderToStaticMarkup(
      <GameDetailPage
        game={snapshotGame('counter-strike-2')}
        similarGames={{
          games: [
            {
              authoritativeScore: { macro: 80, meso: 60, micro: 80, snapshotVersion: 1 },
              distance: 20.62,
              id: 'steam-2767030',
              slug: 'marvel-rivals',
              steamAppId: 2767030,
              title: 'Marvel Rivals',
            },
            {
              authoritativeScore: { macro: 100, meso: 80, micro: 80, snapshotVersion: 1 },
              distance: 32.02,
              id: 'steam-1172470',
              slug: 'apex-legends',
              steamAppId: 1172470,
              title: 'Apex Legends',
            },
          ],
          kind: 'data',
        }}
      />,
    )

    expect(markup).toContain('Similar games')
    expect(markup).toContain('href="/games/marvel-rivals"')
    expect(markup.indexOf('Marvel Rivals')).toBeLessThan(markup.indexOf('Apex Legends'))
    expect(markup).toContain('Micro 80, Meso 60, Macro 80')
  })

  test.each([
    [{ kind: 'loading' } as const, 'Finding similar games'],
    [{ kind: 'error' } as const, 'Similar games are unavailable right now.'],
    [{ games: [], kind: 'data' } as const, 'No other scored games are in the catalog yet.'],
  ])('shows the %o similar-games state', (similarGames, message) => {
    const markup = renderToStaticMarkup(
      <GameDetailPage game={snapshotGame('counter-strike-2')} similarGames={similarGames} />,
    )

    expect(markup).toContain(message)
  })
})
