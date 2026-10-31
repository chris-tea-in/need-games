import { describe, expect, test } from 'vitest'

import {
  SIMILAR_GAMES_LIMIT,
  mimmaDistance,
  rankSimilarGames,
} from '../../src/shared/similarity.js'

function candidate(title: string, steamAppId: number, micro: number, meso: number, macro: number) {
  return { score: { macro, meso, micro }, steamAppId, title }
}

describe('MiMMa similarity', () => {
  test('measures Euclidean distance across the three axes', () => {
    expect(mimmaDistance({ macro: 0, meso: 0, micro: 0 }, { macro: 0, meso: 4, micro: 3 })).toBe(5)
    expect(
      mimmaDistance({ macro: 80, meso: 65, micro: 100 }, { macro: 80, meso: 65, micro: 100 }),
    ).toBe(0)
  })

  test('ranks nearest first and rounds the reported distance to two decimals', () => {
    const ranked = rankSimilarGames({ macro: 80, meso: 65, micro: 100 }, [
      candidate('Elden Ring', 1245620, 80, 100, 40),
      candidate('Marvel Rivals', 2767030, 80, 60, 80),
      candidate('Apex Legends', 1172470, 80, 80, 100),
    ])

    expect(ranked.map((game) => [game.title, game.distance])).toEqual([
      ['Marvel Rivals', 20.62],
      ['Apex Legends', 32.02],
      ['Elden Ring', 56.79],
    ])
  })

  test('breaks distance ties by case-insensitive title, then Steam app ID', () => {
    const ranked = rankSimilarGames({ macro: 50, meso: 50, micro: 50 }, [
      candidate('beta', 3, 60, 50, 50),
      candidate('Alpha', 9, 40, 50, 50),
      candidate('alpha', 2, 50, 60, 50),
    ])

    expect(ranked.map((game) => game.steamAppId)).toEqual([2, 9, 3])
  })

  test('returns at most the limit and keeps candidate fields', () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      candidate(`Game ${index}`, index + 1, index * 10, 0, 0),
    )

    const ranked = rankSimilarGames({ macro: 0, meso: 0, micro: 0 }, candidates)

    expect(ranked).toHaveLength(SIMILAR_GAMES_LIMIT)
    expect(ranked[0]).toMatchObject({ distance: 0, steamAppId: 1, title: 'Game 0' })
    expect(rankSimilarGames({ macro: 0, meso: 0, micro: 0 }, candidates, 2)).toHaveLength(2)
  })

  test.each([0, -1, 1.5, Number.NaN])('rejects the invalid limit %s', (limit) => {
    expect(() => rankSimilarGames({ macro: 0, meso: 0, micro: 0 }, [], limit)).toThrow(RangeError)
  })
})
