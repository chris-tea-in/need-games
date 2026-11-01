import type {
  AuthoritativeScoreSummary,
  CatalogCard,
  GameDetail,
  SteamProvenance,
  SteamReviewSummary,
} from '../../shared/catalog-contract.js'
import {
  getMappedAuthoritativeScoreFromLatestSnapshot,
  type AuthoritativeMimmaScore,
} from './authoritative-scores.js'
import { parseSourceTags } from './source-tags.js'

export const CATALOG_SORT_OPTIONS = ['title_asc', 'review_count_desc'] as const

export type CatalogSort = (typeof CATALOG_SORT_OPTIONS)[number]

export interface CatalogSearchOptions {
  limit?: number
  search?: string
  sort?: CatalogSort
}

interface GameRow {
  id: string
  review_category: string
  review_count: number
  review_scope: SteamReviewSummary['scope']
  short_description: string
  slug: string
  source_app_details_url: string
  source_fetched_at: string
  source_store_page_url: string
  source_tags_json: string
  steam_app_id: number
  steam_title: string
  title: string
}

const catalogSortSql: Record<CatalogSort, string> = {
  review_count_desc: 'review_count DESC, title COLLATE NOCASE ASC, steam_app_id ASC',
  title_asc: 'title COLLATE NOCASE ASC, steam_app_id ASC',
}

const gameColumns = `
  id,
  slug,
  steam_app_id,
  title,
  steam_title,
  short_description,
  source_tags_json,
  review_category,
  review_count,
  review_scope,
  source_app_details_url,
  source_store_page_url,
  source_fetched_at`

function toCatalogCard(row: GameRow): CatalogCard {
  return {
    id: row.id,
    review: {
      category: row.review_category,
      count: row.review_count,
      scope: row.review_scope,
    },
    slug: row.slug,
    steamAppId: row.steam_app_id,
    tags: parseSourceTags(row.source_tags_json),
    title: row.title,
  }
}

function toProvenance(row: GameRow): SteamProvenance {
  return {
    appDetailsUrl: row.source_app_details_url,
    fetchedAt: row.source_fetched_at,
    officialTitle: row.steam_title,
    storePageUrl: row.source_store_page_url,
  }
}

export function toScoreSummary(score: AuthoritativeMimmaScore): AuthoritativeScoreSummary {
  return {
    macro: score.macroScore,
    meso: score.mesoScore,
    micro: score.microScore,
    snapshotVersion: score.snapshotVersion,
  }
}

function toGameDetail(row: GameRow, score: AuthoritativeMimmaScore | null): GameDetail {
  return {
    ...toCatalogCard(row),
    authoritativeScore: score === null ? null : toScoreSummary(score),
    provenance: toProvenance(row),
    shortDescription: row.short_description,
  }
}

export async function findCatalogGames(
  database: D1Database,
  { limit = 50, search, sort = 'title_asc' }: CatalogSearchOptions = {},
): Promise<readonly CatalogCard[]> {
  const sortSql = catalogSortSql[sort]
  if (sortSql === undefined) {
    throw new Error(`Unsupported catalog sort: ${sort}`)
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Catalog limit must be an integer from 1 through 50')
  }

  if (search !== undefined && (search.length === 0 || search.length > 100)) {
    throw new Error('Catalog search must contain 1 through 100 characters')
  }

  const statement =
    search === undefined
      ? database
          .prepare(
            `SELECT ${gameColumns}
         FROM games
         WHERE catalog_status = 'main_catalog'
         ORDER BY ${sortSql}
         LIMIT ?`,
          )
          .bind(limit)
      : database
          .prepare(
            `SELECT ${gameColumns}
         FROM games
         WHERE catalog_status = 'main_catalog'
           AND title LIKE ? ESCAPE '\\'
         ORDER BY ${sortSql}
         LIMIT ?`,
          )
          .bind(`%${escapeLikePattern(search)}%`, limit)

  const result = await statement.all<GameRow>()
  return result.results.map(toCatalogCard)
}

export async function findGameBySlug(
  database: D1Database,
  slug: string,
): Promise<GameDetail | null> {
  const row = await database
    .prepare(
      `SELECT ${gameColumns}
       FROM games
       WHERE slug = ?
       LIMIT 1`,
    )
    .bind(slug)
    .first<GameRow>()

  if (row === null) {
    return null
  }

  return toGameDetail(row, await getMappedAuthoritativeScoreFromLatestSnapshot(database, row.id))
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}
