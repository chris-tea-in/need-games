import { CATALOG_SCHEMA_VERSION, type DatasetVersioned } from '../shared/catalog-contract.js'

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100
}

/** Cheap existence check; the sign-in return-path allowlist calls it on every sign-in start. */
export async function gameExists(database: D1Database, slug: string): Promise<boolean> {
  const row = await database
    .prepare('SELECT 1 AS present FROM games WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<{ present: number }>()
  return row !== null
}

export function unavailableVersion(): DatasetVersioned {
  return { datasetVersion: 'unavailable', schemaVersion: CATALOG_SCHEMA_VERSION }
}
