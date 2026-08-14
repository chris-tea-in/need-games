export const CATALOG_SCHEMA_VERSION = 1 as const

export const CATALOG_ERROR_CODES = [
  'game_not_found',
  'unscored_game',
  'invalid_query',
  'catalog_temporarily_unavailable',
] as const

export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number]

export interface DatasetVersioned {
  datasetVersion: string
  schemaVersion: typeof CATALOG_SCHEMA_VERSION
}

export interface SteamReviewSummary {
  category: string
  count: number
  scope: 'All Reviews: English Reviews'
}

export interface SteamProvenance {
  appDetailsUrl: string
  fetchedAt: string
  officialTitle: string
  storePageUrl: string
}

export interface CatalogCard {
  id: string
  review: SteamReviewSummary
  slug: string
  steamAppId: number
  tags: readonly string[]
  title: string
}

export interface GameDetail extends CatalogCard {
  authoritativeScore: null
  provenance: SteamProvenance
  shortDescription: string
}

export interface CatalogResponse extends DatasetVersioned {
  games: readonly CatalogCard[]
}

export interface GameDetailResponse extends DatasetVersioned {
  game: GameDetail
}

export interface ApiErrorResponse extends DatasetVersioned {
  error: {
    code: CatalogErrorCode
    message: string
  }
}

export interface CatalogSnapshot extends DatasetVersioned {
  generatedAt: string
  games: readonly GameDetail[]
}

export interface CatalogReleaseGame {
  admission: {
    criteriaVersion: 'v1-steam-catalog-2026-07-26'
    path: 'main_catalog'
  }
  id: string
  review: SteamReviewSummary
  shortDescription: string
  slug: string
  steamAppId: number
  steamTitle: string
  tags: readonly string[]
  title: string
  titleMapping?: {
    explanation: string
    kind: 'owner_approved_display_title'
  }
  provenance: SteamProvenance
}

export interface CatalogRelease extends DatasetVersioned {
  generatedAt: string
  games: readonly CatalogReleaseGame[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isVersioned(value: Record<string, unknown>): boolean {
  return (
    typeof value.datasetVersion === 'string' &&
    value.datasetVersion.length > 0 &&
    value.schemaVersion === CATALOG_SCHEMA_VERSION
  )
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isIsoTimestamp(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false
  }

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.valueOf())) {
    return false
  }

  return (
    timestamp.toISOString() === value || timestamp.toISOString().replace('.000Z', 'Z') === value
  )
}

export function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  if (!isRecord(value) || !isVersioned(value) || !isIsoTimestamp(value.generatedAt)) {
    return false
  }

  return Array.isArray(value.games) && value.games.every(isGameDetail)
}

export function isCatalogResponse(value: unknown): value is CatalogResponse {
  if (!isRecord(value) || !isVersioned(value)) {
    return false
  }

  return Array.isArray(value.games) && value.games.every(isCatalogCard)
}

export function isGameDetailResponse(value: unknown): value is GameDetailResponse {
  return isRecord(value) && isVersioned(value) && isGameDetail(value.game)
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value) || !isVersioned(value) || !isRecord(value.error)) {
    return false
  }

  return (
    typeof value.error.message === 'string' &&
    CATALOG_ERROR_CODES.includes(value.error.code as CatalogErrorCode)
  )
}

function isCatalogCard(value: unknown): value is CatalogCard {
  if (!isRecord(value) || !isRecord(value.review)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.steamAppId === 'number' &&
    Number.isSafeInteger(value.steamAppId) &&
    value.steamAppId > 0 &&
    typeof value.title === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.review.category === 'string' &&
    typeof value.review.count === 'number' &&
    Number.isSafeInteger(value.review.count) &&
    value.review.count >= 0 &&
    value.review.scope === 'All Reviews: English Reviews'
  )
}

function isGameDetail(value: unknown): value is GameDetail {
  if (!isRecord(value) || !isCatalogCard(value)) {
    return false
  }

  const provenance = value.provenance
  if (!isRecord(provenance)) {
    return false
  }

  return (
    value.authoritativeScore === null &&
    typeof value.shortDescription === 'string' &&
    isHttpsUrl(provenance.appDetailsUrl) &&
    isIsoTimestamp(provenance.fetchedAt) &&
    typeof provenance.officialTitle === 'string' &&
    isHttpsUrl(provenance.storePageUrl)
  )
}
