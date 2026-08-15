import type {
  ApiErrorResponse,
  CatalogErrorCode,
  DatasetVersioned,
} from '../shared/catalog-contract.js'

const jsonContentType = 'application/json; charset=utf-8'

interface JsonResponseOptions {
  cacheControl?: string
  headers?: HeadersInit
  status?: number
}

export function jsonResponse<T>(body: T, options: JsonResponseOptions = {}): Response {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', jsonContentType)
  headers.set('Cache-Control', options.cacheControl ?? 'no-store')

  return new Response(JSON.stringify(body), { headers, status: options.status ?? 200 })
}

export function apiErrorResponse(
  version: DatasetVersioned,
  code: CatalogErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  const body: ApiErrorResponse = {
    ...version,
    error: { code, message },
  }

  return jsonResponse(body, { headers, status })
}

export function headResponse(response: Response): Response {
  return new Response(null, { headers: response.headers, status: response.status })
}
