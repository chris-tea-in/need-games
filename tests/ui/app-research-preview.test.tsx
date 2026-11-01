// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CatalogResponse } from '../../src/shared/catalog-contract.js'
import { loadCatalog, loadGameDetail } from '../../src/ui/api-client.js'
import { App } from '../../src/ui/App.js'
import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { RESEARCH_STORAGE_KEY } from '../../src/ui/research/research-preview.js'

vi.mock('../../src/ui/api-client.js', () => ({
  loadCatalog: vi.fn(),
  loadGameDetail: vi.fn(),
  loadSimilarGames: vi.fn(() => Promise.resolve({ kind: 'unscored' as const })),
}))

const catalog: CatalogResponse = {
  datasetVersion: catalogSnapshot.datasetVersion,
  schemaVersion: 1,
  games: catalogSnapshot.games.map(({ id, review, slug, steamAppId, tags, title }) => ({
    id,
    review,
    slug,
    steamAppId,
    tags,
    title,
  })),
}

function snapshotGame(slug: string) {
  const game = catalogSnapshot.games.find((candidate) => candidate.slug === slug)
  if (game === undefined) throw new Error(`missing snapshot game ${slug}`)
  return game
}

describe('App research score preview', () => {
  let container: HTMLDivElement
  let root: Root

  async function renderAt(url: string) {
    window.history.replaceState({}, '', url)
    await act(() => {
      root.render(<App />)
      return Promise.resolve()
    })
  }

  function card(slug: string) {
    const link = container.querySelector(`.game-card a[href="/games/${slug}"]`)
    const article = link?.closest('.game-card')
    if (article === null || article === undefined) throw new Error(`no card for ${slug}`)
    return article
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    vi.mocked(loadCatalog).mockResolvedValue({ data: catalog, kind: 'data', source: 'api' })
    vi.mocked(loadGameDetail).mockResolvedValue({ kind: 'not-found' })
    container = document.createElement('div')
    document.body.append(container as never)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  test('shows the owner scores and no banner by default', async () => {
    await renderAt('/')

    expect(container.querySelector('.research-banner')).toBeNull()
    expect(card('beamng-drive').querySelector('.profile-strip')).not.toBeNull()
    expect(card('counter-strike-2').querySelector('.profile-strip')).not.toBeNull()
  })

  test('switches the shelf to a research set and remembers the choice', async () => {
    await renderAt('/?scores=claude')

    const banner = container.querySelector('.research-banner')
    expect(banner?.textContent).toContain("Claude's rubric scores")
    expect(banner?.querySelector('[aria-current="true"]')?.textContent).toBe('Claude')
    expect(card('beamng-drive').querySelector('.profile-strip')).not.toBeNull()
    expect(window.localStorage.getItem(RESEARCH_STORAGE_KEY)).toBe('claude')
  })

  test('keeps the stored set on a plain URL and drops it for the owner scores', async () => {
    window.localStorage.setItem(RESEARCH_STORAGE_KEY, 'tags')
    await renderAt('/')
    expect(container.querySelector('.research-banner')?.textContent).toContain('Steam user tags')

    act(() => root.unmount())
    root = createRoot(container)
    await renderAt('/?scores=owner')
    expect(container.querySelector('.research-banner')).toBeNull()
    expect(window.localStorage.getItem(RESEARCH_STORAGE_KEY)).toBeNull()
  })

  test('scores a game page from all data, even without an owner score, and lists every source', async () => {
    const destiny = { ...snapshotGame('destiny-2'), authoritativeScore: null }
    vi.mocked(loadGameDetail).mockResolvedValue({
      data: { datasetVersion: catalog.datasetVersion, game: destiny, schemaVersion: 1 },
      kind: 'data',
      source: 'api',
    })

    await renderAt('/games/destiny-2?scores=all')

    expect(container.querySelector('.mimma-graph')).not.toBeNull()
    expect(container.querySelector('.research-sources table')).not.toBeNull()
    expect(container.querySelector('.spec-panel-footnote')?.textContent).toContain(
      'median of every source',
    )
    expect(container.textContent).toContain('Plays like Destiny 2')
    expect(container.textContent).not.toContain('Score unavailable')
  })
})
