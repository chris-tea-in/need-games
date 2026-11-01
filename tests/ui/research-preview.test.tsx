import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { SIMILAR_GAMES_LIMIT, SIMILAR_GAMES_MAX_DISTANCE } from '../../src/shared/similarity.js'
import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { researchMimma } from '../../src/ui/generated/research-mimma.js'
import {
  RESEARCH_SETS,
  RESEARCH_STORAGE_KEY,
  ResearchBanner,
  ResearchSources,
  researchCatalogScores,
  researchDetailView,
  researchScore,
  researchScoreNote,
  researchSimilarGames,
  resolveResearchSet,
} from '../../src/ui/research/research-preview.js'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

function snapshotGame(slug: string) {
  const game = catalogSnapshot.games.find((candidate) => candidate.slug === slug)
  if (game === undefined) throw new Error(`missing snapshot game ${slug}`)
  return game
}

function researchGame(steamAppId: number) {
  const game = researchMimma.games.find((candidate) => candidate.steamAppId === steamAppId)
  if (game === undefined) throw new Error(`missing research game ${steamAppId}`)
  return game
}

describe('research set selection', () => {
  test('picks a set from the URL and remembers it', () => {
    const storage = memoryStorage()

    expect(resolveResearchSet('?scores=claude', storage)).toBe('claude')
    expect(storage.values.get(RESEARCH_STORAGE_KEY)).toBe('claude')
    expect(resolveResearchSet('', storage)).toBe('claude')
  })

  test('returns to the owner scores for v1 or an unknown set, and forgets the choice', () => {
    const storage = memoryStorage({ [RESEARCH_STORAGE_KEY]: 'tags' })

    expect(resolveResearchSet('?scores=v1', storage)).toBeNull()
    expect(storage.values.has(RESEARCH_STORAGE_KEY)).toBe(false)
    storage.setItem(RESEARCH_STORAGE_KEY, 'all')
    expect(resolveResearchSet('?scores=nonsense', storage)).toBeNull()
    expect(storage.values.has(RESEARCH_STORAGE_KEY)).toBe(false)
  })

  test('works without storage, and when storage throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(resolveResearchSet('?scores=reviews', null)).toBe('reviews')
    expect(resolveResearchSet('', null)).toBeNull()
    expect(resolveResearchSet('?scores=all', blocked)).toBe('all')
    expect(resolveResearchSet('?scores=v1', blocked)).toBeNull()
    expect(resolveResearchSet('', blocked)).toBeNull()
  })

  test('ignores a stored value that is not a set', () => {
    expect(resolveResearchSet('', memoryStorage({ [RESEARCH_STORAGE_KEY]: 'v2' }))).toBeNull()
    expect(resolveResearchSet('', memoryStorage())).toBeNull()
  })
})

describe('research scores', () => {
  test('reads each set from the generated research data', () => {
    const counterStrike = researchGame(730)

    for (const set of RESEARCH_SETS) {
      expect(researchScore(730, set)).toEqual({
        macro: counterStrike.macro[set],
        meso: counterStrike.meso[set],
        micro: counterStrike.micro[set],
        snapshotVersion: 0,
      })
    }
    expect(researchScore(999_999, 'claude')).toBeNull()
  })

  test('scores every catalog game, including the two the owner left unscored', () => {
    const scores = researchCatalogScores(catalogSnapshot.games, 'all')

    expect([...scores.keys()].sort()).toEqual(catalogSnapshot.games.map((game) => game.id).sort())
    expect(scores.get(snapshotGame('destiny-2').id)).toBeDefined()
    expect(snapshotGame('destiny-2').authoritativeScore).toBeNull()
  })

  test('ranks similar games from the research set with the shared similarity rules', () => {
    const eldenRing = snapshotGame('elden-ring')
    const view = researchSimilarGames(eldenRing, 'claude')

    expect(view.kind).toBe('data')
    if (view.kind !== 'data') return
    expect(view.games.length).toBeGreaterThan(0)
    expect(view.games.length).toBeLessThanOrEqual(SIMILAR_GAMES_LIMIT)
    for (const game of view.games) {
      expect(game.id).not.toBe(eldenRing.id)
      expect(game.distance).toBeLessThanOrEqual(SIMILAR_GAMES_MAX_DISTANCE)
      expect(game.authoritativeScore).toEqual(researchScore(game.steamAppId, 'claude'))
    }
  })
})

describe('research notes and markup', () => {
  test('names the set and gives the owner v1 score for scale', () => {
    const owner = researchGame(1245620)

    expect(researchScoreNote(1245620, 'claude')).toBe(
      `Research preview: Claude's rubric scores, ${researchMimma.collectedOn}. Owner v1: Micro ${owner.micro.owner}, Meso ${owner.meso.owner}, Macro ${owner.macro.owner}.`,
    )
    expect(researchScoreNote(1085660, 'claude')).toContain('The owner has not scored this game.')
    expect(researchScoreNote(1245620, 'all')).not.toContain('Owner v1')
    expect(researchScoreNote(999_999, 'claude')).toBeNull()
  })

  test('adds review ranges and the low-confidence warning where they apply', () => {
    const range = researchGame(730).micro.reviewsRange

    expect(researchScoreNote(730, 'reviews')).toContain(
      `80% ranges: Micro ${range?.[0]} to ${range?.[1]}`,
    )
    expect(researchGame(1086940).micro.tagsLowConfidence).toBe(true)
    expect(researchScoreNote(1086940, 'tags')).toContain('Low confidence')
    expect(researchScoreNote(730, 'tags')).not.toContain('Low confidence')
  })

  test('marks the active set in the banner and offers a way back to v1', () => {
    const markup = renderToStaticMarkup(<ResearchBanner active="tags" />)

    expect(markup).toContain('Research preview')
    expect(markup).toContain('estimates from Steam user tags')
    expect(markup).toContain('href="?scores=v1"')
    expect(markup).toContain('aria-current="true" href="?scores=tags"')
    expect(markup.match(/aria-current/g)).toHaveLength(1)
  })

  test('lists every source and the median per axis', () => {
    const markup = renderToStaticMarkup(<ResearchSources steamAppId={1086940} />)
    const baldursGate = researchGame(1086940)

    expect(markup.match(/<tr>/g)).toHaveLength(4)
    expect(markup).toContain(`<td class="research-sources-median">${baldursGate.macro.all}</td>`)
    expect(markup).toContain('(low)')
    expect(renderToStaticMarkup(<ResearchSources steamAppId={999_999} />)).toBe('')
  })

  test('builds a game page view with the research score, note, and similar games', () => {
    const destiny = snapshotGame('destiny-2')
    const view = researchDetailView(destiny, 'all')

    expect(view.game.authoritativeScore).toEqual(researchScore(destiny.steamAppId, 'all'))
    expect(view.scoreFootnote).toContain('median of every source')
    expect(view.scoreDetails).not.toBeNull()
    expect(view.similarGames.kind).toBe('data')
    expect(researchDetailView(destiny, 'claude').scoreDetails).toBeNull()
  })
})
