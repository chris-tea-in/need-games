import { describe, expect, test } from 'vitest'

import {
  assertTrackedDatabaseIdsAreSentinels,
  localPreviewDatabaseIdSentinel,
  productionDatabaseIdSentinel,
} from '../scripts/assert-release-d1-id.mjs'

function trackedConfig(...databaseIds: readonly string[]): string {
  const entries = databaseIds
    .map((databaseId) => `    { "binding": "NEED_GAMES_DB", "database_id": "${databaseId}" }`)
    .join(',\n')

  return `{\n  "d1_databases": [\n${entries}\n  ],\n}`
}

describe('tracked release configuration guard', () => {
  test('accepts a configuration that keeps both documented sentinels', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(
        trackedConfig(localPreviewDatabaseIdSentinel, productionDatabaseIdSentinel),
      ),
    ).not.toThrow()
  })

  test('blocks a real production database ID that replaced the production sentinel', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(
        trackedConfig(localPreviewDatabaseIdSentinel, '11111111-1111-4111-8111-111111111111'),
      ),
    ).toThrow(/Release blocked[\s\S]*11111111-1111-4111-8111-111111111111/)
  })

  test('blocks a real database ID even when it is the only entry', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(trackedConfig('22222222-2222-4222-8222-222222222222')),
    ).toThrow(/Release blocked/)
  })

  test('reports every leaked database ID rather than only the first', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(
        trackedConfig(
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ),
      ),
    ).toThrow(/11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222/)
  })

  test('blocks a configuration that declares no database ID at all', () => {
    expect(() => assertTrackedDatabaseIdsAreSentinels('{}')).toThrow(/no D1 database_id entries/)
  })

  test('blocks a configuration that omits the production sentinel', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(trackedConfig(localPreviewDatabaseIdSentinel)),
    ).toThrow(/exactly the preview and production sentinel IDs/i)
  })

  test('blocks duplicate or unexpected sentinel entries', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(
        trackedConfig(
          localPreviewDatabaseIdSentinel,
          productionDatabaseIdSentinel,
          productionDatabaseIdSentinel,
        ),
      ),
    ).toThrow(/exactly the preview and production sentinel IDs/i)
  })

  test('tolerates the whitespace variations a formatter may produce', () => {
    expect(() =>
      assertTrackedDatabaseIdsAreSentinels(
        `{ "database_id":"${localPreviewDatabaseIdSentinel}", "database_id":"${productionDatabaseIdSentinel}" }`,
      ),
    ).not.toThrow()
  })
})
