import {
  AUTH_FAILURE_QUERY_PARAMETER,
  AUTH_FAILURE_QUERY_VALUE,
} from '../../shared/session-contract.js'

export function currentReturnPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function consumeAuthFailureMarker(): boolean {
  const url = new URL(window.location.href)
  const markerValues = url.searchParams.getAll(AUTH_FAILURE_QUERY_PARAMETER)
  if (markerValues.length !== 1 || markerValues[0] !== AUTH_FAILURE_QUERY_VALUE) {
    return false
  }

  url.searchParams.delete(AUTH_FAILURE_QUERY_PARAMETER)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return true
}
