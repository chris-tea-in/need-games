import type { DatasetVersioned, SimilarGamesResponse } from '../../shared/catalog-contract.js'
import { rankSimilarGames } from '../../shared/similarity.js'
import { jsonResponse } from '../http.js'
import { findScoredSimilarityCandidates } from '../repositories/authoritative-scores.js'
import { findGameBySlug, toScoreSummary } from '../repositories/games.js'

export type SimilarGamesResult = Response | 'game_not_found' | 'unscored_game'

/** Rank the other scored catalog games by MiMMa distance to the requested game. */
export async function similarGamesResponse(
  database: D1Database,
  version: DatasetVersioned,
  slug: string,
): Promise<SimilarGamesResult> {
  const game = await findGameBySlug(database, slug)
  if (game === null) {
    return 'game_not_found'
  }
  if (game.authoritativeScore === null) {
    return 'unscored_game'
  }

  const candidates = (await findScoredSimilarityCandidates(database, game.id)).map((candidate) => ({
    authoritativeScore: toScoreSummary(candidate),
    id: candidate.catalogGameId,
    score: {
      macro: candidate.macroScore,
      meso: candidate.mesoScore,
      micro: candidate.microScore,
    },
    slug: candidate.slug,
    steamAppId: candidate.steamAppId,
    title: candidate.title,
  }))

  const body: SimilarGamesResponse = {
    ...version,
    game: { id: game.id, slug: game.slug, title: game.title },
    similarGames: rankSimilarGames(game.authoritativeScore, candidates).map(
      ({ authoritativeScore, distance, id, slug: candidateSlug, steamAppId, title }) => ({
        authoritativeScore,
        distance,
        id,
        slug: candidateSlug,
        steamAppId,
        title,
      }),
    ),
  }

  return jsonResponse(body, { cacheControl: 'public, max-age=60' })
}
