export interface AuthoritativeMimmaScore {
  gameId: string
  macroScore: number
  mesoScore: number
  microScore: number
  version: number
}

export interface ScoredSimilarityCandidate extends AuthoritativeMimmaScore {
  steamAppId: number
  title: string
}

interface ScoreRow {
  game_id: string
  macro_score: number
  meso_score: number
  micro_score: number
  version: number
}

interface CandidateRow extends ScoreRow {
  steam_app_id: number
  title: string
}

function toAuthoritativeScore(row: ScoreRow): AuthoritativeMimmaScore {
  return {
    gameId: row.game_id,
    macroScore: row.macro_score,
    mesoScore: row.meso_score,
    microScore: row.micro_score,
    version: row.version,
  }
}

export async function getCurrentAuthoritativeScore(
  database: D1Database,
  gameId: string,
): Promise<AuthoritativeMimmaScore | null> {
  const row = await database
    .prepare(
      `SELECT game_id, version, micro_score, meso_score, macro_score
       FROM authoritative_mimma_scores
       WHERE game_id = ?
         AND approval_status = 'approved'
       ORDER BY version DESC
       LIMIT 1`,
    )
    .bind(gameId)
    .first<ScoreRow>()

  return row === null ? null : toAuthoritativeScore(row)
}

export async function findScoredSimilarityCandidates(
  database: D1Database,
  selectedGameId: string,
): Promise<readonly ScoredSimilarityCandidate[]> {
  const result = await database
    .prepare(
      `SELECT scores.game_id, scores.version, scores.micro_score, scores.meso_score, scores.macro_score,
              games.steam_app_id, games.title
       FROM authoritative_mimma_scores AS scores
       INNER JOIN games ON games.id = scores.game_id
       WHERE scores.game_id <> ?
         AND scores.approval_status = 'approved'
         AND scores.version = (
           SELECT MAX(current_scores.version)
           FROM authoritative_mimma_scores AS current_scores
           WHERE current_scores.game_id = scores.game_id
             AND current_scores.approval_status = 'approved'
         )
       ORDER BY games.title COLLATE NOCASE ASC, games.steam_app_id ASC`,
    )
    .bind(selectedGameId)
    .all<CandidateRow>()

  return result.results.map((row) => ({
    ...toAuthoritativeScore(row),
    steamAppId: row.steam_app_id,
    title: row.title,
  }))
}
