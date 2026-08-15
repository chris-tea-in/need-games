import {
  isApiErrorResponse,
  isCatalogResponse,
  isGameDetailResponse,
  type CatalogResponse,
  type GameDetailResponse,
} from '../shared/catalog-contract.js'
import { catalogSnapshot } from './generated/catalog-snapshot.js'

export type ApiSource = 'api' | 'snapshot'

export type CatalogLoadResult =
  { data: CatalogResponse; kind: 'data'; source: ApiSource } | { kind: 'error'; message: string }

export type GameDetailLoadResult =
  | { data: GameDetailResponse; kind: 'data'; source: ApiSource }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }

export interface ApiClientOptions {
  fetcher?: typeof fetch
}

function snapshotCatalog(): CatalogResponse {
  return {
    datasetVersion: catalogSnapshot.datasetVersion,
    schemaVersion: catalogSnapshot.schemaVersion,
    games: catalogSnapshot.games,
  }
}

function snapshotGameDetail(slug: string): GameDetailResponse | undefined {
  const game = catalogSnapshot.games.find((candidate) => candidate.slug === slug)
  if (game === undefined) {
    return undefined
  }

  return {
    datasetVersion: catalogSnapshot.datasetVersion,
    schemaVersion: catalogSnapshot.schemaVersion,
    game,
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function errorMessage(response: Response): string {
  return `The catalog request failed with status ${response.status}.`
}

export async function loadCatalog({
  fetcher = fetch,
}: ApiClientOptions = {}): Promise<CatalogLoadResult> {
  try {
    const response = await fetcher('/api/catalog', { headers: { accept: 'application/json' } })
    const body = await readJson(response)

    if (response.status >= 500 || (!isCatalogResponse(body) && response.ok)) {
      return { data: snapshotCatalog(), kind: 'data', source: 'snapshot' }
    }

    if (isCatalogResponse(body)) {
      return { data: body, kind: 'data', source: 'api' }
    }

    return { kind: 'error', message: errorMessage(response) }
  } catch {
    return { data: snapshotCatalog(), kind: 'data', source: 'snapshot' }
  }
}

export async function loadGameDetail(
  slug: string,
  { fetcher = fetch }: ApiClientOptions = {},
): Promise<GameDetailLoadResult> {
  try {
    const response = await fetcher(`/api/games/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    })
    const body = await readJson(response)

    if (
      response.status === 404 &&
      isApiErrorResponse(body) &&
      body.error.code === 'game_not_found'
    ) {
      return { kind: 'not-found' }
    }

    if (response.status >= 500 || (!isGameDetailResponse(body) && response.ok)) {
      const detail = snapshotGameDetail(slug)
      return detail === undefined
        ? { kind: 'error', message: 'The game detail is unavailable.' }
        : { data: detail, kind: 'data', source: 'snapshot' }
    }

    if (isGameDetailResponse(body)) {
      return { data: body, kind: 'data', source: 'api' }
    }

    return { kind: 'error', message: errorMessage(response) }
  } catch {
    const detail = snapshotGameDetail(slug)
    return detail === undefined
      ? { kind: 'error', message: 'The game detail is unavailable.' }
      : { data: detail, kind: 'data', source: 'snapshot' }
  }
}
