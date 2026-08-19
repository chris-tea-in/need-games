import { describe, expect, test } from 'vitest'

import {
  assertProductionD1Verification,
  productionDatabaseName,
} from '../scripts/verify-production-d1.mjs'

const productionDatabaseId = '11111111-1111-4111-8111-111111111111'

function validVerification() {
  return {
    expectedDatabaseId: productionDatabaseId,
    expectedDatabaseName: productionDatabaseName,
    info: {
      uuid: productionDatabaseId,
      name: productionDatabaseName,
    },
    queryResults: [
      {
        results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }],
      },
      {
        results: [
          { id: 1, name: '0001_schema.sql' },
          { id: 2, name: '0002_seed_beta_catalog.sql' },
        ],
      },
    ],
  }
}

describe('production D1 verification', () => {
  test('accepts the expected database identity, catalog release, and migration prefix', () => {
    expect(() => assertProductionD1Verification(validVerification())).not.toThrow()
  })

  test.each([
    ['an unexpected database identity', { info: { uuid: productionDatabaseId, name: 'other-db' } }],
    ['a missing catalog release', { queryResults: [{ results: [] }, { results: [] }] }],
    [
      'an unexpected migration prefix',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          { results: [{ id: 1, name: '0009_unexpected.sql' }] },
        ],
      },
    ],
    [
      'an additional migration after the copied beta state',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 1, name: '0001_schema.sql' },
              { id: 2, name: '0002_seed_beta_catalog.sql' },
              { id: 3, name: '0003_authoritative_mimma_seed.sql' },
            ],
          },
        ],
      },
    ],
    [
      'unexpected migration IDs with the expected names',
      {
        queryResults: [
          { results: [{ dataset_version: 'catalog-release-v1', schema_version: 1 }] },
          {
            results: [
              { id: 7, name: '0001_schema.sql' },
              { id: 8, name: '0002_seed_beta_catalog.sql' },
            ],
          },
        ],
      },
    ],
  ])('rejects %s before release', (_description, overrides) => {
    expect(() => assertProductionD1Verification({ ...validVerification(), ...overrides })).toThrow(
      /production D1 verification failed/i,
    )
  })
})
