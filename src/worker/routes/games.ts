import type { DatasetVersioned, GameDetailResponse } from '../../shared/catalog-contract.js'
import { jsonResponse } from '../http.js'
import { findGameBySlug } from '../repositories/games.js'

export async function gameResponse(
  database: D1Database,
  version: DatasetVersioned,
  slug: string,
): Promise<Response | null> {
  const game = await findGameBySlug(database, slug)
  if (game === null) {
    return null
  }

  const body: GameDetailResponse = { ...version, game }
  return jsonResponse(body, { cacheControl: 'public, max-age=60' })
}
