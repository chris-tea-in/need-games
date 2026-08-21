import { describe, expect, test } from 'vitest'

import {
  createProductionWranglerConfig,
  productionDatabaseIdEnvironmentVariable,
  productionDatabaseIdSentinel,
} from '../scripts/create-production-wrangler-config.mjs'

const safeConfig = `{
  "env": {
    "production": {
      "secrets": {
        "required": ["STEAM_WEB_API_KEY", "CSRF_HMAC_SECRET"]
      },
      "d1_databases": [
        {
          "database_id": "${productionDatabaseIdSentinel}"
        }
      ]
    }
  }
}`

describe('production Wrangler configuration', () => {
  test('reads the owner-run production D1 ID from transient process state', () => {
    expect(productionDatabaseIdEnvironmentVariable).toBe('PRODUCTION_D1_DATABASE_ID')
  })

  test('injects a valid production D1 ID without changing the safe source', () => {
    const productionDatabaseId = '11111111-1111-4111-8111-111111111111'

    const generatedConfig = createProductionWranglerConfig(safeConfig, productionDatabaseId)

    expect(generatedConfig).toContain(productionDatabaseId)
    expect(generatedConfig).not.toContain(productionDatabaseIdSentinel)
    expect(safeConfig).toContain(productionDatabaseIdSentinel)
  })

  test.each(['', 'prod-db', productionDatabaseIdSentinel])(
    'rejects a missing, malformed, or placeholder production D1 ID: %j',
    (productionDatabaseId) => {
      expect(() => createProductionWranglerConfig(safeConfig, productionDatabaseId)).toThrow(
        /production D1 database ID/i,
      )
    },
  )

  test('rejects a safe config without exactly one production sentinel', () => {
    expect(() => createProductionWranglerConfig('{}', crypto.randomUUID())).toThrow(
      /production D1 sentinel/i,
    )
    expect(() =>
      createProductionWranglerConfig(
        `${safeConfig}\n${productionDatabaseIdSentinel}`,
        crypto.randomUUID(),
      ),
    ).toThrow(/production D1 sentinel/i)
  })

  test('rejects a production config that does not require exactly the auth secrets', () => {
    expect(() =>
      createProductionWranglerConfig(
        safeConfig.replace('"STEAM_WEB_API_KEY", ', ''),
        crypto.randomUUID(),
      ),
    ).toThrow(/required production secrets/i)
    expect(() =>
      createProductionWranglerConfig(
        safeConfig.replace('"CSRF_HMAC_SECRET"]', '"CSRF_HMAC_SECRET", "EXTRA_SECRET"]'),
        crypto.randomUUID(),
      ),
    ).toThrow(/required production secrets/i)
  })
})
