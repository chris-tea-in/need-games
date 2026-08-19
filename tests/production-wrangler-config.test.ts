import { describe, expect, test } from 'vitest'

import {
  createProductionWranglerConfig,
  productionDatabaseIdSentinel,
} from '../scripts/create-production-wrangler-config.mjs'

const safeConfig = `{
  "env": {
    "production": {
      "d1_databases": [
        {
          "database_id": "${productionDatabaseIdSentinel}"
        }
      ]
    }
  }
}`

describe('production Wrangler configuration', () => {
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
})
