import { describe, expect, test } from 'vitest'

import {
  SIMILAR_GAMES_LIMIT,
  SIMILAR_GAMES_MAX_DISTANCE,
  TAG_MISMATCH_PENALTY,
  mimmaDistance,
  rankSimilarGames,
  sharedTags,
  tagOverlap,
} from '../../src/shared/similarity.js'

function candidate(
  title: string,
  steamAppId: number,
  micro: number,
  meso: number,
  macro: number,
  tags: readonly string[] = [],
) {
  return { score: { macro, meso, micro }, steamAppId, tags, title }
}

function subject(micro: number, meso: number, macro: number, tags: readonly string[] = []) {
  return { score: { macro, meso, micro }, tags }
}

describe('MiMMa similarity', () => {
  test('measures Euclidean distance across the three axes', () => {
    expect(mimmaDistance({ macro: 0, meso: 0, micro: 0 }, { macro: 0, meso: 4, micro: 3 })).toBe(5)
    expect(
      mimmaDistance({ macro: 80, meso: 65, micro: 100 }, { macro: 80, meso: 65, micro: 100 }),
    ).toBe(0)
  })

  test('measures tag overlap case-insensitively as shared over distinct tags', () => {
    expect(tagOverlap(['FPS', 'Shooter', 'PvP'], ['shooter', 'fps', 'Tactical'])).toBe(0.5)
    expect(tagOverlap(['FPS'], ['RPG'])).toBe(0)
    expect(tagOverlap([], [])).toBe(0)
    expect(sharedTags(['FPS', 'Shooter', 'PvP'], ['pvp', 'fps'])).toEqual(['FPS', 'PvP'])
    expect(sharedTags(['FPS', 'fps'], ['FPS'])).toEqual(['FPS'])
  })

  test('ranks nearest first and rounds the reported distance to two decimals', () => {
    const ranked = rankSimilarGames(subject(100, 65, 80), [
      candidate('Monster Hunter Wilds', 2246340, 80, 40, 60),
      candidate('Marvel Rivals', 2767030, 80, 60, 80),
      candidate('Apex Legends', 1172470, 80, 80, 100),
    ])

    expect(ranked.map((game) => [game.title, game.distance])).toEqual([
      ['Marvel Rivals', 20.62],
      ['Apex Legends', 32.02],
      ['Monster Hunter Wilds', 37.75],
    ])
  })

  test('leaves out candidates beyond the maximum MiMMa distance, whatever their tags', () => {
    const tags = ['FPS', 'Shooter']
    const ranked = rankSimilarGames(subject(0, 0, 0, tags), [
      candidate('At the edge', 1, SIMILAR_GAMES_MAX_DISTANCE, 0, 0),
      candidate('Just past it', 2, SIMILAR_GAMES_MAX_DISTANCE + 0.01, 0, 0, tags),
    ])

    expect(ranked.map((game) => game.title)).toEqual(['At the edge'])
    expect(rankSimilarGames(subject(0, 0, 0), [candidate('Far', 3, 100, 100, 100)])).toEqual([])
  })

  test('breaks a MiMMa tie by tag overlap and reports the shared tags', () => {
    const ranked = rankSimilarGames(subject(100, 65, 80, ['FPS', 'Shooter', 'Competitive']), [
      candidate('Marvel Rivals', 2767030, 80, 60, 80, ['Hero Shooter', 'PvP']),
      candidate('Rainbow Six Siege', 359550, 80, 60, 80, ['FPS', 'shooter', 'Tactical']),
    ])

    expect(ranked.map((game) => [game.title, game.sharedTags])).toEqual([
      ['Rainbow Six Siege', ['FPS', 'Shooter']],
      ['Marvel Rivals', []],
    ])
  })

  test('lets tags reorder games less than one penalty apart, but not games farther apart', () => {
    const tags = ['RPG', 'Story Rich']
    const closeButUntagged = candidate('Untagged', 1, 10, 0, 0)
    const fartherButTagged = candidate('Tagged', 2, 10 + TAG_MISMATCH_PENALTY - 1, 0, 0, tags)
    const tooFarForTags = candidate('Too far', 3, 10 + TAG_MISMATCH_PENALTY + 1, 0, 0, tags)

    expect(
      rankSimilarGames(subject(0, 0, 0, tags), [closeButUntagged, fartherButTagged]).map(
        (game) => game.title,
      ),
    ).toEqual(['Tagged', 'Untagged'])
    expect(
      rankSimilarGames(subject(0, 0, 0, tags), [tooFarForTags, closeButUntagged]).map(
        (game) => game.title,
      ),
    ).toEqual(['Untagged', 'Too far'])
  })

  test('breaks remaining ties by case-insensitive title, then Steam app ID', () => {
    const ranked = rankSimilarGames(subject(50, 50, 50), [
      candidate('beta', 3, 60, 50, 50),
      candidate('Alpha', 9, 40, 50, 50),
      candidate('alpha', 2, 50, 60, 50),
    ])

    expect(ranked.map((game) => game.steamAppId)).toEqual([2, 9, 3])
  })

  test('returns at most the limit and keeps candidate fields', () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      candidate(`Game ${index}`, index + 1, index * 5, 0, 0),
    )

    const ranked = rankSimilarGames(subject(0, 0, 0), candidates)

    expect(ranked).toHaveLength(SIMILAR_GAMES_LIMIT)
    expect(ranked[0]).toMatchObject({ distance: 0, steamAppId: 1, title: 'Game 0' })
    expect(rankSimilarGames(subject(0, 0, 0), candidates, 2)).toHaveLength(2)
  })

  test.each([0, -1, 1.5, Number.NaN])('rejects the invalid limit %s', (limit) => {
    expect(() => rankSimilarGames(subject(0, 0, 0), [], limit)).toThrow(RangeError)
  })
})
