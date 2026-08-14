import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import type { CatalogResponse } from '../../src/shared/catalog-contract.js'
import { CatalogPage } from '../../src/ui/catalog-page.js'
import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'
import { GameDetailPage } from '../../src/ui/game-detail-page.js'

const catalog: CatalogResponse = {
  datasetVersion: 'catalog-release-v1',
  schemaVersion: 1,
  games: [catalogSnapshot.games[0]],
}

function findExecutable(command: string): string | undefined {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'

  try {
    return execFileSync(locator, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.length > 0 && existsSync(candidate))
  } catch {
    return undefined
  }
}

function discoverChromiumExecutable(): string | undefined {
  const configuredPaths = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ]
  const knownPaths = [
    join(
      process.env.PROGRAMFILES ?? 'C:\\Program Files',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    join(
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]

  return (
    [...configuredPaths, ...knownPaths].find(
      (candidate): candidate is string => candidate !== undefined && existsSync(candidate),
    ) ??
    ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'msedge']
      .map(findExecutable)
      .find((candidate) => candidate !== undefined)
  )
}

function requireChromiumExecutable(): string {
  const executable = discoverChromiumExecutable()

  if (executable === undefined) {
    throw new Error(
      'Browser-level UI regression coverage requires Chrome or Chromium. Install one or set CHROME_BIN to its executable path.',
    )
  }

  return executable
}

function createVisualFixture(markup: string): string {
  const stylesUrl = pathToFileURL(resolve('src/ui/styles.css')).href

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${stylesUrl}" />
  </head>
  <body>
    ${markup}
    <script>
      window.addEventListener('load', () => {
        const detailLayout = document.querySelector('.detail-layout')
        const card = document.querySelector('.card')
        const badge = document.querySelector('.badge')
        const detailStyle = getComputedStyle(detailLayout)
        const cardStyle = getComputedStyle(card)
        const badgeStyle = getComputedStyle(badge)

        document.body.dataset.detailColumns = detailStyle.gridTemplateColumns
          .split(/\\s+/)
          .filter(Boolean).length
          .toString()
        document.body.dataset.viewportWidth = window.innerWidth.toString()
        document.body.dataset.cardBorder = cardStyle.borderTopStyle
        document.body.dataset.cardShadow = cardStyle.boxShadow === 'none' ? 'none' : 'raised'
        document.body.dataset.badgeBorder = badgeStyle.borderTopStyle
        document.body.dataset.badgeRadius = badgeStyle.borderTopLeftRadius
      })
    </script>
  </body>
</html>`
}

function renderVisualSnapshot(chromiumPath: string, windowWidth: number): string {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'need-games-visual-'))
  const fixturePath = join(fixtureDirectory, 'fixture.html')
  const profilePath = join(fixtureDirectory, 'chrome-profile')
  const markup =
    renderToStaticMarkup(
      <CatalogPage
        catalog={catalog}
        query=""
        sort="title"
        onQueryChange={() => {}}
        onSortChange={() => {}}
      />,
    ) + renderToStaticMarkup(<GameDetailPage game={catalogSnapshot.games[0]} />)

  writeFileSync(fixturePath, createVisualFixture(markup), 'utf8')

  try {
    return execFileSync(
      chromiumPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-features=Vulkan',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        `--user-data-dir=${profilePath}`,
        `--window-size=${windowWidth},900`,
        '--dump-dom',
        pathToFileURL(fixturePath).href,
      ],
      { encoding: 'utf8', windowsHide: true },
    )
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true })
  }
}

describe('visual layout in Chromium', () => {
  test('renders card and badge treatments and changes the detail grid at 64rem', () => {
    const chromiumPath = requireChromiumExecutable()
    const compactView = renderVisualSnapshot(chromiumPath, 1039)
    const desktopView = renderVisualSnapshot(chromiumPath, 1040)

    expect(compactView).toContain('data-viewport-width="1023"')
    expect(compactView).toContain('data-detail-columns="1"')
    expect(desktopView).toContain('data-viewport-width="1024"')
    expect(desktopView).toContain('data-detail-columns="3"')
    expect(desktopView).toContain('data-card-border="solid"')
    expect(desktopView).toContain('data-card-shadow="raised"')
    expect(desktopView).toContain('data-badge-border="solid"')
    expect(desktopView).toContain('data-badge-radius="999px"')
  })
})
