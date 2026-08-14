import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

const ciWorkflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url)
const contributingGuideUrl = new URL('../CONTRIBUTING.md', import.meta.url)
const dependabotUrl = new URL('../.github/dependabot.yml', import.meta.url)
const pullRequestTemplateUrl = new URL('../.github/pull_request_template.md', import.meta.url)
const setupActionUrl = new URL('../.github/actions/setup/action.yml', import.meta.url)
const wranglerConfigUrl = new URL('../wrangler.jsonc', import.meta.url)
const releaseGuardUrl = new URL('../scripts/assert-release-d1-id.mjs', import.meta.url)
const repositoryPath = fileURLToPath(new URL('../', import.meta.url))

function readAutomationFile(fileUrl: URL): string {
  return existsSync(fileUrl) ? readFileSync(fileUrl, 'utf8').replace(/\r\n?/g, '\n') : ''
}

describe('repository package contract', () => {
  test('prevents publishing the workspace package', () => {
    expect(packageManifest.private).toBe(true)
  })

  test('uses ECMAScript modules for Node and TypeScript tooling', () => {
    expect(packageManifest.type).toBe('module')
  })

  test('pins the supported Node and pnpm versions', () => {
    expect(packageManifest.engines?.node).toBe('>=24.18.0 <25')
    expect(packageManifest.packageManager).toBe('pnpm@10.34.5')
  })

  test('exposes the stable local and CI scripts', () => {
    expect(packageManifest.scripts).toMatchObject({
      build: 'vite build',
      dev: 'vite',
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
      lint: 'eslint . --max-warnings 0',
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
      'test:node': 'vitest run --config vitest.config.ts',
      'test:worker': 'vitest run --config vitest.worker.config.ts',
      typecheck: 'tsc --noEmit',
      'typecheck:worker': 'wrangler types --check',
      'check:local': 'node scripts/check-local.mjs',
      'release:check': 'node scripts/assert-release-d1-id.mjs',
      predeploy: 'pnpm release:check',
    })
  })
})

describe('Worker configuration contract', () => {
  test('keeps the closed-beta Worker local-only until the owner supplies a D1 ID', () => {
    const config = readAutomationFile(wranglerConfigUrl)

    expect(config).toContain('"name": "myplayprint-preview"')
    expect(config).toContain('"directory": "./dist"')
    expect(config).toContain('"not_found_handling": "single-page-application"')
    expect(config).toContain('"/api"')
    expect(config).toContain('"/api/*"')
    expect(config).toContain('"preview_urls": false')
    expect(config).toContain('"enabled": true')
    expect(config).toContain('"binding": "NEED_GAMES_DB"')
    expect(config).toContain('00000000-0000-4000-8000-000000000001')
    expect(existsSync(releaseGuardUrl)).toBe(true)
  })

  test('blocks releases while the local preview D1 sentinel remains configured', () => {
    expect(() => {
      execFileSync(process.execPath, [fileURLToPath(releaseGuardUrl)], {
        cwd: repositoryPath,
        stdio: 'pipe',
      })
    }).toThrow(/Release blocked/)
  })
})

describe('repository automation contract', () => {
  test('provides the CI workflow and shared setup action', () => {
    expect(existsSync(ciWorkflowUrl)).toBe(true)
    expect(existsSync(setupActionUrl)).toBe(true)
  })

  test('provides dependency automation and contribution guidance', () => {
    expect(existsSync(dependabotUrl)).toBe(true)
    expect(existsSync(pullRequestTemplateUrl)).toBe(true)
    expect(existsSync(contributingGuideUrl)).toBe(true)
  })

  test('checks pnpm and GitHub Actions dependencies every week', () => {
    const dependabotConfig = readAutomationFile(dependabotUrl)

    expect(dependabotConfig).toContain('package-ecosystem: npm')
    expect(dependabotConfig).toContain('package-ecosystem: github-actions')
    expect(dependabotConfig).toMatch(
      /package-ecosystem: github-actions[\s\S]*directories:\s*\n\s+- \/\s*\n\s+- \/\.github\/actions\/setup/,
    )
    expect(dependabotConfig.match(/interval: weekly/g)).toHaveLength(2)
  })

  test('runs protected validation for pull requests and main', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('push:')
    expect(workflow).toMatch(/branches:\s*\[main\]/g)
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('cancel-in-progress: true')
  })

  test('exposes stable validation and aggregate job names', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('name: Quality')
    expect(workflow).toContain('name: Typecheck')
    expect(workflow).toContain('name: Tests')
    expect(workflow).toContain('name: CI')
    expect(workflow).toContain('if: ${{ always() }}')
  })

  test('pins every external action to an immutable commit', () => {
    const automation = [readAutomationFile(ciWorkflowUrl), readAutomationFile(setupActionUrl)].join(
      '\n',
    )
    const externalActionLines = automation
      .split('\n')
      .filter((line) => line.trimStart().startsWith('uses:') && !line.includes('uses: ./'))

    expect(externalActionLines.length).toBeGreaterThan(0)
    for (const actionLine of externalActionLines) {
      expect(actionLine).toMatch(/uses: [^\s@]+@[0-9a-f]{40}(?:\s+#\s+v\d+\.\d+\.\d+)?$/)
    }
  })
})
