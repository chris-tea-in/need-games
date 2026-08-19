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
const productionDeploymentUrl = new URL(
  '../.github/workflows/deploy-production.yml',
  import.meta.url,
)
const pullRequestTemplateUrl = new URL('../.github/pull_request_template.md', import.meta.url)
const setupActionUrl = new URL('../.github/actions/setup/action.yml', import.meta.url)
const wranglerConfigUrl = new URL('../wrangler.jsonc', import.meta.url)
const releaseGuardUrl = new URL('../scripts/assert-release-d1-id.mts', import.meta.url)
const workerTypeCheckUrl = new URL('../scripts/check-worker-types.mjs', import.meta.url)
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
      'typecheck:worker': 'node scripts/check-worker-types.mjs',
      'check:local': 'node scripts/check-local.mjs',
      'catalog:check': 'node scripts/generate-catalog-artifacts.mts',
      'mimma-seed:check': 'node scripts/generate-authoritative-mimma-seed.mts',
      'release:check': 'node scripts/assert-release-d1-id.mts',
      predeploy: 'pnpm release:check',
    })
  })
})

describe('Worker configuration contract', () => {
  test('keeps tracked Worker configuration free of real D1 IDs', () => {
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
    expect(config).toContain('00000000-0000-4000-8000-000000000002')
    expect(config).toContain('"production"')
    expect(existsSync(releaseGuardUrl)).toBe(true)
  })

  test('accepts the tracked Worker configuration while it keeps only placeholder D1 IDs', () => {
    expect(() => {
      execFileSync(process.execPath, [fileURLToPath(releaseGuardUrl)], {
        cwd: repositoryPath,
        stdio: 'pipe',
      })
    }).not.toThrow()
  })

  test('keeps ignored local environment values out of generated Worker types', () => {
    const workerTypeCheck = readAutomationFile(workerTypeCheckUrl)

    expect(workerTypeCheck).toContain("CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false'")
    expect(workerTypeCheck).toContain("'types', '--check'")
  })
})

describe('repository automation contract', () => {
  test('provides the CI workflow and shared setup action', () => {
    expect(existsSync(ciWorkflowUrl)).toBe(true)
    expect(existsSync(setupActionUrl)).toBe(true)
  })

  test('keeps production deployment manual and protected', () => {
    const workflow = readAutomationFile(productionDeploymentUrl)

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('secrets.CLOUDFLARE_API_TOKEN')
    expect(workflow).toContain('secrets.CLOUDFLARE_ACCOUNT_ID')
    expect(workflow).toContain('secrets.PRODUCTION_D1_DATABASE_ID')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).not.toContain('push:')
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

  test('requires a real production build before CI can succeed', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('name: Build')
    expect(workflow).toContain('run: pnpm build')
    expect(workflow).toMatch(/needs: \[quality, typecheck, tests, build\]/)
  })

  test('exposes stable validation and aggregate job names', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('name: Quality')
    expect(workflow).toContain('name: Typecheck')
    expect(workflow).toContain('name: Tests')
    expect(workflow).toContain('name: CI')
    expect(workflow).toContain('if: ${{ always() }}')
  })

  test('requires generated catalog artifacts and Worker tests in CI', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('pnpm catalog:check')
    expect(workflow).toContain('pnpm mimma-seed:check')
    expect(workflow).toContain('pnpm test:worker')
  })

  test('blocks pull requests that leak a real D1 database ID into tracked configuration', () => {
    const workflow = readAutomationFile(ciWorkflowUrl)

    expect(workflow).toContain('pnpm release:check')
  })

  test('pins every external action to an immutable commit', () => {
    const automation = [
      readAutomationFile(ciWorkflowUrl),
      readAutomationFile(productionDeploymentUrl),
      readAutomationFile(setupActionUrl),
    ].join('\n')
    const externalActionLines = automation
      .split('\n')
      .filter((line) => line.trimStart().startsWith('uses:') && !line.includes('uses: ./'))

    expect(externalActionLines.length).toBeGreaterThan(0)
    for (const actionLine of externalActionLines) {
      expect(actionLine).toMatch(/uses: [^\s@]+@[0-9a-f]{40}(?:\s+#\s+v\d+\.\d+\.\d+)?$/)
    }
  })
})
