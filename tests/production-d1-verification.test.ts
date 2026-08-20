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
          { id: 3, name: '0003_authoritative_mimma_seed.sql' },
          { id: 4, name: '0004_identity_sessions.sql' },
        ],
      },
      {
        results: [
          {
            type: 'table',
            name: 'authoritative_mimma_seeds',
            sql: "CREATE TABLE authoritative_mimma_seeds (provenance TEXT CHECK (provenance = 'authoritative_sample_seed'))",
          },
          {
            type: 'table',
            name: 'sessions',
            sql: 'CREATE TABLE sessions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE)',
          },
          {
            type: 'table',
            name: 'steam_login_transactions',
            sql: 'CREATE TABLE steam_login_transactions (steam_response_nonce TEXT UNIQUE)',
          },
          {
            type: 'table',
            name: 'users',
            sql: "CREATE TABLE users (steam_id TEXT NOT NULL UNIQUE CHECK (length(steam_id) = 17 AND steam_id NOT GLOB '*[^0-9]*'))",
          },
          { type: 'trigger', name: 'authoritative_mimma_seeds_prevent_delete', sql: 'x' },
          { type: 'trigger', name: 'authoritative_mimma_seeds_prevent_insert', sql: 'x' },
          { type: 'trigger', name: 'authoritative_mimma_seeds_prevent_update', sql: 'x' },
          { type: 'index', name: 'sessions_expiry_idx', sql: 'x' },
          { type: 'index', name: 'sessions_user_idx', sql: 'x' },
          { type: 'index', name: 'steam_login_transactions_expiry_idx', sql: 'x' },
        ],
      },
      {
        results: [
          {
            authoritative_seed_count: 62,
          },
        ],
      },
    ],
  }
}

describe('production D1 verification', () => {
  test('accepts the expected database identity, catalog release, and auth-ready schema', () => {
    expect(() => assertProductionD1Verification(validVerification())).not.toThrow()
  })

  test('accepts expected operational identity rows during recurring verification', () => {
    const operationalIdentity = validVerification()
    Object.assign(operationalIdentity.queryResults[3].results[0], {
      user_count: 1,
      login_transaction_count: 2,
      session_count: 1,
    })

    expect(() => assertProductionD1Verification(operationalIdentity)).not.toThrow()
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
              { id: 4, name: '0004_identity_sessions.sql' },
              { id: 5, name: '0005_unexpected.sql' },
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

  test('rejects a missing auth schema object', () => {
    const missingObject = validVerification()
    missingObject.queryResults[2].results = missingObject.queryResults[2].results.slice(1)
    expect(() => assertProductionD1Verification(missingObject)).toThrow(/auth schema/i)
  })

  test('rejects an auth schema object with the wrong SQLite object type', () => {
    const wrongObjectType = validVerification()
    const sessionsUserIndex = wrongObjectType.queryResults[2].results.find(
      (row) => 'name' in row && row.name === 'sessions_user_idx',
    )
    if (sessionsUserIndex !== undefined && 'type' in sessionsUserIndex) {
      sessionsUserIndex.type = 'table'
    }

    expect(() => assertProductionD1Verification(wrongObjectType)).toThrow(/auth schema/i)
  })
})
