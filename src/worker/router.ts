import { CATALOG_SCHEMA_VERSION, type DatasetVersioned } from '../shared/catalog-contract.js'
import { AUTH_ROUTES } from '../shared/session-contract.js'
import { isValidSlug, unavailableVersion } from './catalog-lookup.js'
import { apiErrorResponse, headResponse } from './http.js'
import { getCatalogReleaseMetadata } from './repositories/catalog-release.js'
import { catalogResponse, parseCatalogQuery } from './routes/catalog.js'
import { gameResponse } from './routes/games.js'
import { authUnavailableResponse, routeAuthRequest } from './routes/auth.js'
import { similarGamesResponse } from './routes/similar-games.js'

const apiPrefix = '/api'
const allowedMethods = new Set(['GET', 'HEAD'])
const notFoundMessage = 'The requested game or API route was not found.'
const unavailableMessage = 'The catalog is temporarily unavailable. Please try again later.'

function isApiRequest(pathname: string): boolean {
  return pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`)
}

const authPaths: ReadonlySet<string> = new Set(Object.values(AUTH_ROUTES))

function isAuthRequest(pathname: string): boolean {
  return authPaths.has(pathname)
}

function requestRoute(pathname: string): string {
  return pathname.length > 200 ? apiPrefix : pathname
}

function metadataVersion(
  metadata: { datasetVersion: string; schemaVersion: number } | null,
): DatasetVersioned {
  if (metadata === null || metadata.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    return unavailableVersion()
  }

  return { datasetVersion: metadata.datasetVersion, schemaVersion: CATALOG_SCHEMA_VERSION }
}

function errorResponse(
  version: DatasetVersioned,
  code: 'game_not_found' | 'invalid_query' | 'unscored_game',
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return apiErrorResponse(version, code, message, status, headers)
}

async function routeApiRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname

  const authResponse = await routeAuthRequest(request, env, url)
  if (authResponse !== null) {
    return authResponse
  }

  if (!allowedMethods.has(request.method)) {
    return errorResponse(
      unavailableVersion(),
      'invalid_query',
      'Only GET and HEAD are supported for this API.',
      405,
      { Allow: 'GET, HEAD' },
    )
  }

  const version = metadataVersion(await getCatalogReleaseMetadata(env.NEED_GAMES_DB))

  if (path === '/api/catalog') {
    const query = parseCatalogQuery(url)
    if (!query.valid) {
      return errorResponse(version, 'invalid_query', query.message, 400)
    }

    return catalogResponse(env.NEED_GAMES_DB, version, query.options)
  }

  const similarMatch = /^\/api\/games\/([^/]+)\/similar$/.exec(path)
  if (similarMatch !== null) {
    const slug = similarMatch[1]
    if (!isValidSlug(slug)) {
      return errorResponse(version, 'invalid_query', 'Game slug is invalid.', 400)
    }
    const result = await similarGamesResponse(env.NEED_GAMES_DB, version, slug)
    if (result === 'game_not_found') {
      return errorResponse(version, 'game_not_found', notFoundMessage, 404)
    }
    if (result === 'unscored_game') {
      return errorResponse(
        version,
        'unscored_game',
        'Similar games are unavailable until this game has an authoritative score.',
        404,
      )
    }

    return result
  }

  const gameMatch = /^\/api\/games\/([^/]+)$/.exec(path)
  if (gameMatch !== null) {
    const slug = gameMatch[1]
    if (!isValidSlug(slug)) {
      return errorResponse(version, 'invalid_query', 'Game slug is invalid.', 400)
    }

    const response = await gameResponse(env.NEED_GAMES_DB, version, slug)
    return response ?? errorResponse(version, 'game_not_found', notFoundMessage, 404)
  }

  return errorResponse(version, 'game_not_found', notFoundMessage, 404)
}

function unavailableResponse(route: string): Response {
  const version = unavailableVersion()
  console.error({
    datasetVersion: version.datasetVersion,
    errorCode: 'catalog_temporarily_unavailable',
    route,
    status: 503,
  })
  return apiErrorResponse(version, 'catalog_temporarily_unavailable', unavailableMessage, 503)
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (!isApiRequest(url.pathname)) {
    return env.ASSETS.fetch(request)
  }

  const response = await routeApiRequest(request, env, url).catch(() =>
    isAuthRequest(url.pathname)
      ? authUnavailableResponse()
      : unavailableResponse(requestRoute(url.pathname)),
  )
  return request.method === 'HEAD' ? headResponse(response) : response
}
