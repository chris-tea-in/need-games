import { describe, expect, test } from 'vitest'

import { isGameDetailResponse, isSimilarGamesResponse } from '../../src/shared/catalog-contract.js'
import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'

const versioned = {
  datasetVersion: catalogSnapshot.datasetVersion,
  schemaVersion: catalogSnapshot.schemaVersion,
}
const game = catalogSnapshot.games[0]
const score = { macro: 80, meso: 65, micro: 100, snapshotVersion: 1 }

function similarGame(overrides: Record<string, unknown> = {}) {
  return {
    authoritativeScore: score,
    distance: 20.62,
    id: 'steam-2767030',
    slug: 'marvel-rivals',
    steamAppId: 2767030,
    title: 'Marvel Rivals',
    ...overrides,
  }
}

describe('game detail contract', () => {
  test('accepts a scored game and an unscored game', () => {
    expect(
      isGameDetailResponse({ ...versioned, game: { ...game, authoritativeScore: score } }),
    ).toBe(true)
    expect(
      isGameDetailResponse({ ...versioned, game: { ...game, authoritativeScore: null } }),
    ).toBe(true)
  })

  test.each([
    ['an axis above 100', { ...score, micro: 101 }],
    ['a negative axis', { ...score, meso: -1 }],
    ['a fractional axis', { ...score, macro: 50.5 }],
    ['a missing snapshot version', { macro: 1, meso: 2, micro: 3 }],
    ['a zero snapshot version', { ...score, snapshotVersion: 0 }],
    ['a missing score', undefined],
  ])('rejects %s', (_label, authoritativeScore) => {
    expect(isGameDetailResponse({ ...versioned, game: { ...game, authoritativeScore } })).toBe(
      false,
    )
  })
})

describe('similar games contract', () => {
  const response = {
    ...versioned,
    game: { id: 'steam-730', slug: 'counter-strike-2', title: 'Counter-Strike 2' },
    similarGames: [similarGame()],
  }

  test('accepts a ranked list, including an empty one', () => {
    expect(isSimilarGamesResponse(response)).toBe(true)
    expect(isSimilarGamesResponse({ ...response, similarGames: [] })).toBe(true)
  })

  test.each([
    ['a negative distance', similarGame({ distance: -1 })],
    ['a non-finite distance', similarGame({ distance: Number.POSITIVE_INFINITY })],
    ['a missing slug', similarGame({ slug: undefined })],
    ['an unscored entry', similarGame({ authoritativeScore: null })],
  ])('rejects %s', (_label, entry) => {
    expect(isSimilarGamesResponse({ ...response, similarGames: [entry] })).toBe(false)
  })

  test('rejects a response without a dataset version', () => {
    expect(isSimilarGamesResponse({ ...response, datasetVersion: '' })).toBe(false)
  })
})
