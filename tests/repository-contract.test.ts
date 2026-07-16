import { existsSync, readFileSync } from 'node:fs'

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

function readAutomationFile(fileUrl: URL): string {
  return existsSync(fileUrl) ? readFileSync(fileUrl, 'utf8') : ''
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
      format: 'prettier --write .',
      'format:check': 'prettier --check .',
      lint: 'eslint . --max-warnings 0',
      test: 'vitest run',
      'test:coverage': 'vitest run --coverage',
      typecheck: 'tsc --noEmit',
    })
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
