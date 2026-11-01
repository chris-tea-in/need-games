import { MIMMA_AXES, type MimmaScore } from './mimma.js'

export const SIMILAR_GAMES_LIMIT = 5

/**
 * Candidates farther than this on the MiMMa axes are not similar enough to show. One 20-point
 * step on two axes is about 28; the largest possible distance is about 173.
 */
export const SIMILAR_GAMES_MAX_DISTANCE = 40

/**
 * Ranking points added when two games share no Steam tags. The penalty shrinks to 0 as tag overlap
 * reaches 1, so tags reorder games within one 20-point MiMMa step but never outrank the profile.
 */
export const TAG_MISMATCH_PENALTY = 20

export interface SimilarityCandidate {
  score: MimmaScore
  steamAppId: number
  tags: readonly string[]
  title: string
}

export interface SimilaritySubject {
  score: MimmaScore
  tags: readonly string[]
}

/** Euclidean distance between two MiMMa scores on the 0-100 axes. */
export function mimmaDistance(left: MimmaScore, right: MimmaScore): number {
  return Math.hypot(...MIMMA_AXES.map((axis) => left[axis] - right[axis]))
}

function tagKey(tag: string): string {
  return tag.trim().toLowerCase()
}

/** The selected game's tags that the candidate also has, in the selected game's order. */
export function sharedTags(selected: readonly string[], candidate: readonly string[]): string[] {
  const candidateKeys = new Set(candidate.map(tagKey))
  const seen = new Set<string>()
  return selected.filter((tag) => {
    const key = tagKey(tag)
    if (!candidateKeys.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Shared tags divided by all distinct tags across both games (Jaccard index), from 0 to 1. */
export function tagOverlap(left: readonly string[], right: readonly string[]): number {
  const union = new Set([...left, ...right].map(tagKey))
  if (union.size === 0) return 0
  return sharedTags(left, right).length / union.size
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
 * Rank candidates within SIMILAR_GAMES_MAX_DISTANCE of the selected game. The rank is the MiMMa
 * distance plus the tag mismatch penalty, lowest first. Ties break by title, then Steam app ID, so
 * the Worker and the offline fallback return the same order.
 */
export function rankSimilarGames<T extends SimilarityCandidate>(
  selected: SimilaritySubject,
  candidates: readonly T[],
  limit = SIMILAR_GAMES_LIMIT,
): Array<T & { distance: number; sharedTags: string[] }> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('The similar-games limit must be a positive integer.')
  }

  return candidates
    .map((candidate) => {
      const exact = mimmaDistance(selected.score, candidate.score)
      const rank = exact + TAG_MISMATCH_PENALTY * (1 - tagOverlap(selected.tags, candidate.tags))
      return { candidate, exact, rank }
    })
    .filter(({ exact }) => exact <= SIMILAR_GAMES_MAX_DISTANCE)
    .sort((left, right) => left.rank - right.rank || compareTitles(left.candidate, right.candidate))
    .slice(0, limit)
    .map(({ candidate, exact }) => ({
      ...candidate,
      distance: Math.round(exact * 100) / 100,
      sharedTags: sharedTags(selected.tags, candidate.tags),
    }))
}
