import { readFileSync } from 'node:fs'

/**
 * The one list of what a production release contains. A new migration or data release changes
 * this file and the data it points to; the verifier, release smoke test, and Worker tests read it.
 */
export const productionMigrations = [
  {
    name: '0001_schema.sql',
    sha256: '751a94bbaa163c92f074ba49c0216884901ae088db1c5260fd2ec1425dc4b961',
  },
  {
    name: '0002_seed_beta_catalog.sql',
    sha256: '897e30cb9961132245af3f4cc98b92d217ebbcbfb3d745b1d1f09f998b2628e4',
  },
  {
    name: '0003_authoritative_mimma_seed.sql',
    sha256: '425a56ae640a2b00c8505a51388402ece135417c1b52e8e2f60b8f5800b6f265',
  },
  {
    name: '0004_identity_sessions.sql',
    sha256: '643def4fc16805e84914918c67759adbc61cf9d17a5dfdcd6ed4a53d8a7a45f3',
  },
  {
    name: '0005_owner_authoritative_mimma_v1.sql',
    sha256: 'f1c61a0e5ec4a2219b6658e840eb112e17f60e5813a0d290089eea0218850717',
  },
  {
    name: '0006_retire_authoritative_mimma_seeds.sql',
    sha256: '3493baf91d8e37e1fd0d9247375de58b42dc6f5cef05cc4de14eedec0882fa41',
  },
  {
    name: '0007_owner_authoritative_mimma_v2.sql',
    sha256: '94f2352f3f2eb0eb3528903a978adb3e3a1a7b27f7c28f24cdcc165bfb7e2743',
  },
] as const

export const catalogReleaseUrl = new URL('../data/catalog-release-v1.json', import.meta.url)

/** Owner-authoritative records, oldest first. Each adds rows; none rewrites an earlier one. */
export const authoritativeRecords = [
  {
    manifestVersion: 'owner-authoritative-mimma-v1',
    sha256: 'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65',
    url: new URL(
      '../data/authoritative-records/owner-authoritative-mimma-v1.json',
      import.meta.url,
    ),
  },
  {
    manifestVersion: 'owner-authoritative-mimma-v2',
    sha256: '4bd997752f5efd5692f541a3631498512efd9eb95e83a4a21a3bff7cba855560',
    url: new URL(
      '../data/authoritative-records/owner-authoritative-mimma-v2.json',
      import.meta.url,
    ),
  },
] as const

/** Row counts of the legacy tables, which no release changes. */
export const legacyTableCounts = {
  legacyScoreCount: 0,
} as const

export interface ReleasedCatalog {
  datasetVersion: string
  gameCount: number
}

export function readReleasedCatalog(): ReleasedCatalog {
  const release = JSON.parse(readFileSync(catalogReleaseUrl, 'utf8')) as {
    datasetVersion: string
    games: readonly unknown[]
  }
  return { datasetVersion: release.datasetVersion, gameCount: release.games.length }
}
