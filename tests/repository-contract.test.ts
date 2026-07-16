import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

interface PackageManifest {
  engines?: {
    node?: string
  }
  packageManager?: string
  private?: boolean
  scripts?: Record<string, string>
  type?: string
}

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageManifest

describe('repository package contract', () => {
  test('prevents publishing the workspace package', () => {
    expect(packageManifest.private).toBe(true)
  })

  test('uses ECMAScript modules for Node and TypeScript tooling', () => {
    expect(packageManifest.type).toBe('module')
  })

  test('pins the supported Node and pnpm versions', () => {
    expect(packageManifest.engines?.node).toBe('>=24.18.0 <25')
    expect(packageManifest.packageManager).toBe('pnpm@11.13.0')
  })

  test('exposes the stable local and CI scripts', () => {
    expect(packageManifest.scripts).toMatchObject({
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
      lint: 'eslint . --max-warnings 0',
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
      typecheck: 'tsc --noEmit',
    })
  })
})
