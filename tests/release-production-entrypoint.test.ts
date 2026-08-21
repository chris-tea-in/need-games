import { spawnSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

describe('production release entrypoint', () => {
  test('loads through direct Node execution before validating operator input', () => {
    const result = spawnSync(process.execPath, ['scripts/release-production.mts', '--smoke-only'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PRODUCTION_ORIGIN: '' },
      windowsHide: true,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/set PRODUCTION_ORIGIN/i)
    expect(result.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/i)
  })
})
