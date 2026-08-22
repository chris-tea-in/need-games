import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

  test('keeps the owner release sequence free of remote migration application', () => {
    const source = readFileSync(
      new URL('../scripts/release-production.mts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/['"]migrations['"]|d1 migrations apply/i)
    expect(source).toContain('verify-production-d1.mjs')
  })

  test('queries every non-internal schema object so unexpected objects cannot be hidden', () => {
    const source = readFileSync(
      new URL('../scripts/release-production.mts', import.meta.url),
      'utf8',
    )
    expect(source).toContain("FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
    expect(source).not.toContain('sqlite_master WHERE name IN')
  })

  test('fails closed on missing verifier arguments through direct Node execution', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-production-d1.mts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/Usage: verify-production-d1\.mts/i)
  })

  test('fails closed on malformed verifier JSON before any D1 command', () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'need-games-d1-verifier-'))
    const infoPath = path.join(temporaryDirectory, 'info.json')
    const statePath = path.join(temporaryDirectory, 'state.json')
    try {
      writeFileSync(infoPath, '{"uuid":"not-json"', 'utf8')
      writeFileSync(statePath, '{}', 'utf8')
      const result = spawnSync(
        process.execPath,
        ['scripts/verify-production-d1.mts', '--info-file', infoPath, '--state-file', statePath],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          windowsHide: true,
        },
      )

      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/JSON|property value|parse/i)
      expect(result.stderr).not.toMatch(/wrangler|d1 execute/i)
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
