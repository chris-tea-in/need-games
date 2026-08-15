export interface CatalogReleaseMetadata {
  datasetVersion: string
  schemaVersion: number
}

interface CatalogReleaseMetadataRow {
  dataset_version: string
  schema_version: number
}

export async function getCatalogReleaseMetadata(
  database: D1Database,
): Promise<CatalogReleaseMetadata | null> {
  const row = await database
    .prepare(
      `SELECT dataset_version, schema_version
       FROM catalog_release_metadata
       ORDER BY generated_at DESC
       LIMIT 1`,
    )
    .first<CatalogReleaseMetadataRow>()

  if (row === null) {
    return null
  }

  return {
    datasetVersion: row.dataset_version,
    schemaVersion: row.schema_version,
  }
}
