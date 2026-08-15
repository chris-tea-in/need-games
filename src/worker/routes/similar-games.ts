import type { DatasetVersioned } from '../../shared/catalog-contract.js'
import { findGameBySlug } from '../repositories/games.js'

export async function gameExists(database: D1Database, slug: string): Promise<boolean> {
  return (await findGameBySlug(database, slug)) !== null
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100
}

export function unavailableVersion(): DatasetVersioned {
  return { datasetVersion: 'unavailable', schemaVersion: 1 }
}
