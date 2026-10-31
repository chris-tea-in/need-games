import { MIMMA_AXES, type MimmaScore } from './mimma.js'

export const SIMILAR_GAMES_LIMIT = 5

export interface SimilarityCandidate {
  score: MimmaScore
  steamAppId: number
  title: string
}

/** Euclidean distance between two MiMMa scores on the 0-100 axes. */
export function mimmaDistance(left: MimmaScore, right: MimmaScore): number {
  return Math.hypot(...MIMMA_AXES.map((axis) => left[axis] - right[axis]))
}

function compareTitles(left: SimilarityCandidate, right: SimilarityCandidate): number {
  const leftTitle = left.title.toLowerCase()
  const rightTitle = right.title.toLowerCase()
  if (leftTitle !== rightTitle) {
    return leftTitle < rightTitle ? -1 : 1
  }
  return left.steamAppId - right.steamAppId
}

/**
 * Rank candidates by distance to the selected score, nearest first. Ties break by title, then
 * Steam app ID, so the Worker and the offline fallback return the same order.
 */
export function rankSimilarGames<T extends SimilarityCandidate>(
  selected: MimmaScore,
  candidates: readonly T[],
  limit = SIMILAR_GAMES_LIMIT,
): Array<T & { distance: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('The similar-games limit must be a positive integer.')
  }

  return candidates
    .map((candidate) => ({ candidate, exact: mimmaDistance(selected, candidate.score) }))
    .sort(
      (left, right) => left.exact - right.exact || compareTitles(left.candidate, right.candidate),
    )
    .slice(0, limit)
    .map(({ candidate, exact }) => ({ ...candidate, distance: Math.round(exact * 100) / 100 }))
}
