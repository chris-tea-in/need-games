export interface AuthoritativeMimmaScore {
  gameId: string
  snapshotId: string
  snapshotVersion: number
  scoreId: string
  scoreVersion: number
  macroScore: number
  mesoScore: number
  microScore: number
}

export interface ScoredSimilarityCandidate extends AuthoritativeMimmaScore {
  steamAppId: number
  title: string
}

export interface FrozenAuthoritativeSnapshotMember extends AuthoritativeMimmaScore {
  identityKey: string
  canonicalTitle: string
  catalogGameId: string | null
  steamAppId: number | null
}

export interface FrozenAuthoritativeSnapshot {
  snapshotId: string
  snapshotVersion: number
  members: readonly FrozenAuthoritativeSnapshotMember[]
}

interface ScoreRow {
  game_id: string
  snapshot_id: string
  snapshot_version: number
  score_id: string
  score_version: number
  macro_score: number
  meso_score: number
  micro_score: number
}

interface CandidateRow extends ScoreRow {
  steam_app_id: number
  title: string
}

interface SnapshotMemberRow extends ScoreRow {
  identity_key: string
  canonical_title: string
  catalog_game_id: string | null
  steam_app_id: number | null
}

function toAuthoritativeScore(row: ScoreRow): AuthoritativeMimmaScore {
  return {
    gameId: row.game_id,
    snapshotId: row.snapshot_id,
    snapshotVersion: row.snapshot_version,
    scoreId: row.score_id,
    scoreVersion: row.score_version,
    macroScore: row.macro_score,
    mesoScore: row.meso_score,
    microScore: row.micro_score,
  }
}

const latestMappingCte = `
  latest_mappings AS (
    SELECT mapping.*
    FROM authoritative_game_mappings AS mapping
    WHERE mapping.provider = ?
      AND mapping.mapping_version = (
        SELECT MAX(prior.mapping_version)
        FROM authoritative_game_mappings AS prior
        WHERE prior.game_id = mapping.game_id
          AND prior.provider = mapping.provider
      )
  ),
  verified_mappings AS (
    SELECT mapping.*
    FROM latest_mappings AS mapping
    WHERE mapping.decision = ?
  ),
  conflicted_games AS (
    SELECT mapping.game_id
    FROM verified_mappings AS mapping
    WHERE mapping.external_id IN (
      SELECT external_id FROM verified_mappings GROUP BY external_id HAVING COUNT(*) > 1
    )
    UNION
    SELECT mapping.game_id
    FROM verified_mappings AS mapping
    WHERE mapping.catalog_game_id IN (
      SELECT catalog_game_id FROM verified_mappings GROUP BY catalog_game_id HAVING COUNT(*) > 1
    )
  ),
  usable_mappings AS (
    SELECT mapping.*
    FROM verified_mappings AS mapping
    WHERE NOT EXISTS (
      SELECT 1 FROM conflicted_games AS conflict WHERE conflict.game_id = mapping.game_id
    )
  )`

export async function getMappedAuthoritativeScoreFromLatestSnapshot(
  database: D1Database,
  catalogGameId: string,
): Promise<AuthoritativeMimmaScore | null> {
  const row = await database
    .prepare(
      `WITH latest_snapshot AS (
         SELECT id, version
         FROM authoritative_snapshots
         WHERE state = ?
         ORDER BY version DESC
         LIMIT 1
       ),
       ${latestMappingCte.slice(1)}
       SELECT members.game_id,
              latest_snapshot.id AS snapshot_id,
              latest_snapshot.version AS snapshot_version,
              scores.id AS score_id,
              scores.version AS score_version,
              scores.micro_score,
              scores.meso_score,
              scores.macro_score
       FROM latest_snapshot
       JOIN authoritative_snapshot_members AS members
         ON members.snapshot_id = latest_snapshot.id
       JOIN authoritative_mimma_score_versions AS scores
         ON scores.id = members.score_id AND scores.game_id = members.game_id
       JOIN usable_mappings AS mappings ON mappings.game_id = members.game_id
       WHERE mappings.catalog_game_id = ?
       LIMIT 1`,
    )
    .bind('frozen', 'steam', 'verified', catalogGameId)
    .first<ScoreRow>()

  return row === null ? null : toAuthoritativeScore(row)
}

export async function findScoredSimilarityCandidates(
  database: D1Database,
  selectedCatalogGameId: string,
): Promise<readonly ScoredSimilarityCandidate[]> {
  const result = await database
    .prepare(
      `WITH latest_snapshot AS (
         SELECT id, version
         FROM authoritative_snapshots
         WHERE state = ?
         ORDER BY version DESC
         LIMIT 1
       ),
       ${latestMappingCte.slice(1)}
       SELECT members.game_id,
              latest_snapshot.id AS snapshot_id,
              latest_snapshot.version AS snapshot_version,
              scores.id AS score_id,
              scores.version AS score_version,
              scores.micro_score,
              scores.meso_score,
              scores.macro_score,
              catalog.steam_app_id,
              catalog.title
       FROM latest_snapshot
       JOIN authoritative_snapshot_members AS members
         ON members.snapshot_id = latest_snapshot.id
       JOIN authoritative_mimma_score_versions AS scores
         ON scores.id = members.score_id AND scores.game_id = members.game_id
       JOIN usable_mappings AS mappings ON mappings.game_id = members.game_id
       JOIN games AS catalog ON catalog.id = mappings.catalog_game_id
       WHERE mappings.catalog_game_id <> ?
       ORDER BY catalog.title COLLATE NOCASE ASC, catalog.steam_app_id ASC`,
    )
    .bind('frozen', 'steam', 'verified', selectedCatalogGameId)
    .all<CandidateRow>()

  return result.results.map((row) => ({
    ...toAuthoritativeScore(row),
    steamAppId: row.steam_app_id,
    title: row.title,
  }))
}

export async function getFrozenAuthoritativeSnapshot(
  database: D1Database,
): Promise<FrozenAuthoritativeSnapshot | null> {
  const result = await database
    .prepare(
      `WITH latest_snapshot AS (
         SELECT id, version
         FROM authoritative_snapshots
         WHERE state = ?
         ORDER BY version DESC
         LIMIT 1
       ),
       ${latestMappingCte.slice(1)}
       SELECT members.game_id,
              games.identity_key,
              games.canonical_title,
              latest_snapshot.id AS snapshot_id,
              latest_snapshot.version AS snapshot_version,
              scores.id AS score_id,
              scores.version AS score_version,
              scores.micro_score,
              scores.meso_score,
              scores.macro_score,
              catalog.id AS catalog_game_id,
              catalog.steam_app_id
       FROM latest_snapshot
       JOIN authoritative_snapshot_members AS members
         ON members.snapshot_id = latest_snapshot.id
       JOIN authoritative_games AS games ON games.id = members.game_id
       JOIN authoritative_mimma_score_versions AS scores
         ON scores.id = members.score_id AND scores.game_id = members.game_id
       LEFT JOIN usable_mappings AS mappings ON mappings.game_id = members.game_id
       LEFT JOIN games AS catalog ON catalog.id = mappings.catalog_game_id
       ORDER BY members.rowid ASC`,
    )
    .bind('frozen', 'steam', 'verified')
    .all<SnapshotMemberRow>()

  if (result.results.length === 0) return null

  const first = result.results[0]
  return {
    snapshotId: first.snapshot_id,
    snapshotVersion: first.snapshot_version,
    members: result.results.map((row) => ({
      ...toAuthoritativeScore(row),
      identityKey: row.identity_key,
      canonicalTitle: row.canonical_title,
      catalogGameId: row.catalog_game_id,
      steamAppId: row.steam_app_id,
    })),
  }
}
