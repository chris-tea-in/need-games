import type { CatalogResponse, DatasetVersioned } from '../../shared/catalog-contract.js'
import { jsonResponse } from '../http.js'
import {
  CATALOG_SORT_OPTIONS,
  findCatalogGames,
  type CatalogSearchOptions,
  type CatalogSort,
} from '../repositories/games.js'

interface CatalogQueryResult {
  options: CatalogSearchOptions
  valid: true
}

interface InvalidCatalogQueryResult {
  message: string
  valid: false
}

export type CatalogQuery = CatalogQueryResult | InvalidCatalogQueryResult

export function parseCatalogQuery(url: URL): CatalogQuery {
  const allowedParameters = new Set(['limit', 'search', 'sort'])
  for (const [key] of url.searchParams) {
    if (!allowedParameters.has(key) || url.searchParams.getAll(key).length !== 1) {
      return { message: 'The catalog query contains an unsupported parameter.', valid: false }
    }
  }

  const search = url.searchParams.get('search') ?? undefined
  if (search !== undefined && (search.length === 0 || search.length > 100)) {
    return { message: 'Search must contain 1 through 100 characters.', valid: false }
  }

  const limitValue = url.searchParams.get('limit')
  let limit: number | undefined
  if (limitValue !== null) {
    if (!/^[1-9]\d*$/.test(limitValue)) {
      return { message: 'Limit must be an integer from 1 through 50.', valid: false }
    }

    limit = Number(limitValue)
    if (!Number.isSafeInteger(limit) || limit > 50) {
      return { message: 'Limit must be an integer from 1 through 50.', valid: false }
    }
  }

  const sortValue = url.searchParams.get('sort')
  if (sortValue !== null && !CATALOG_SORT_OPTIONS.includes(sortValue as CatalogSort)) {
    return { message: 'Sort must be title_asc or review_count_desc.', valid: false }
  }

  return {
    options: {
      limit,
      search,
      sort: sortValue === null ? undefined : (sortValue as CatalogSort),
    },
    valid: true,
  }
}

export async function catalogResponse(
  database: D1Database,
  version: DatasetVersioned,
  options: CatalogSearchOptions,
): Promise<Response> {
  const body: CatalogResponse = {
    ...version,
    games: await findCatalogGames(database, options),
  }

  return jsonResponse(body, { cacheControl: 'public, max-age=60' })
}
