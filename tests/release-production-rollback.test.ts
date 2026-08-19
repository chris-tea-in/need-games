import { describe, expect, test } from 'vitest'

import { createProductionRollbackBaseline } from '../scripts/release-production.mjs'

describe('production rollback baseline', () => {
  test('retains the active version and traffic allocation needed for recovery', () => {
    expect(
      createProductionRollbackBaseline(
        {
          created_on: '2026-08-19T20:00:00.000Z',
          versions: [
            {
              percentage: 100,
              version_id: '11111111-1111-4111-8111-111111111111',
            },
          ],
        },
        '2026-08-19T21:00:00.000Z',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toEqual({
      capturedAt: '2026-08-19T21:00:00.000Z',
      deploymentCreatedOn: '2026-08-19T20:00:00.000Z',
      reviewedCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      versions: [
        {
          percentage: 100,
          versionId: '11111111-1111-4111-8111-111111111111',
        },
      ],
    })
  })

  test('rejects deployment status without a recoverable active version', () => {
    expect(() =>
      createProductionRollbackBaseline(
        { created_on: '2026-08-19T20:00:00.000Z', versions: [] },
        '2026-08-19T21:00:00.000Z',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toThrow(/rollback baseline/i)
  })

  test('accepts the same traffic rounding tolerance as Wrangler', () => {
    expect(() =>
      createProductionRollbackBaseline(
        {
          created_on: '2026-08-19T20:00:00.000Z',
          versions: [
            { percentage: 33.3333, version_id: 'version-a' },
            { percentage: 66.6666, version_id: 'version-b' },
          ],
        },
        '2026-08-19T21:00:00.000Z',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).not.toThrow()
  })
})
