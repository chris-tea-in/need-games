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
import { MimmaGraph } from '../../src/ui/mimma-graph.js'

const catalog: CatalogResponse = {
  datasetVersion: 'catalog-release-v1',
  schemaVersion: 1,
  games: [catalogSnapshot.games[0]],
}

const visualTestTimeout = 20_000

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
        const gameTitleLink = document.querySelector('.game-card h2 a')
        const storePageLink = document.querySelector('.provenance-list a')
        const detailStyle = getComputedStyle(detailLayout)
        const cardStyle = getComputedStyle(card)
        const badgeStyle = getComputedStyle(badge)
        const gameTitleStyle = getComputedStyle(gameTitleLink)
        const storePageStyle = getComputedStyle(storePageLink)
        const rootStyle = getComputedStyle(document.documentElement)
        const bodyStyle = getComputedStyle(document.body)

        document.body.dataset.detailColumns = detailStyle.gridTemplateColumns
          .split(/\\s+/)
          .filter(Boolean).length
          .toString()
        document.body.dataset.viewportWidth = window.innerWidth.toString()
        document.body.dataset.cardBorder = cardStyle.borderTopStyle
        document.body.dataset.cardShadow = cardStyle.boxShadow === 'none' ? 'none' : 'raised'
        document.body.dataset.badgeBorder = badgeStyle.borderTopStyle
        document.body.dataset.badgeRadius = badgeStyle.borderTopLeftRadius
        document.body.dataset.colorBackground = rootStyle.getPropertyValue('--color-bg').trim()
        document.body.dataset.colorSurface = rootStyle.getPropertyValue('--color-surface').trim()
        document.body.dataset.colorSurface2 = rootStyle.getPropertyValue('--color-surface-2').trim()
        document.body.dataset.colorAccentRed = rootStyle.getPropertyValue('--color-accent-red').trim()
        document.body.dataset.colorAccentGold = rootStyle.getPropertyValue('--color-accent-gold').trim()
        document.body.dataset.colorText = rootStyle.getPropertyValue('--color-text').trim()
        document.body.dataset.colorMuted = rootStyle.getPropertyValue('--color-text-muted').trim()
        document.body.dataset.colorBorder = rootStyle.getPropertyValue('--color-border-raw').trim()
        document.body.dataset.pageBackground = bodyStyle.backgroundImage
        document.body.dataset.pageBackgroundColor = bodyStyle.backgroundColor
        document.body.dataset.gameTitleColor = gameTitleStyle.color
        document.body.dataset.storePageColor = storePageStyle.color

        const mimmaFixture = document.querySelector('[data-mimma-fixture]')
        const mimmaGraph = document.querySelector('.mimma-graph')
        const mimmaTrack = document.querySelector('.mimma-axis-track')
        const mimmaBar = document.querySelector('.mimma-axis-bar')
        const microBar = document.querySelector('.mimma-axis--micro .mimma-axis-bar')
        const mesoBar = document.querySelector('.mimma-axis--meso .mimma-axis-bar')
        const macroBar = document.querySelector('.mimma-axis--macro .mimma-axis-bar')

        document.body.dataset.mimmaFits = String(
          mimmaGraph.getBoundingClientRect().width <= mimmaFixture.getBoundingClientRect().width,
        )
        document.body.dataset.mimmaTrackWidth = getComputedStyle(mimmaTrack).width
        document.body.dataset.mimmaBarWidth = getComputedStyle(mimmaBar).width
        document.body.dataset.mimmaMicroColor = getComputedStyle(microBar).backgroundColor
        document.body.dataset.mimmaMesoColor = getComputedStyle(mesoBar).backgroundColor
        document.body.dataset.mimmaMacroColor = getComputedStyle(macroBar).backgroundColor
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
    ) +
    renderToStaticMarkup(<GameDetailPage game={catalogSnapshot.games[0]} />) +
    renderToStaticMarkup(
      <div data-mimma-fixture style={{ width: '20rem' }}>
        <MimmaGraph score={{ macro: 0, meso: 50, micro: 100 }} />
      </div>,
    )

  writeFileSync(fixturePath, createVisualFixture(markup), 'utf8')

  try {
    return execFileSync(
      chromiumPath,
      [
        '--headless=new',
        '--no-sandbox',
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

function readViewportWidth(snapshot: string): number {
  const match = snapshot.match(/data-viewport-width="(\d+)"/)

  if (match === null) {
    throw new Error('Chromium snapshot did not report its viewport width.')
  }

  return Number(match[1])
}

function readDataAttribute(snapshot: string, name: string): string {
  const match = snapshot.match(new RegExp(`data-${name}="([^"]+)"`))

  if (match === null) throw new Error(`Chromium snapshot did not report data-${name}.`)
  return match[1]
}

describe('visual layout in Chromium', () => {
  test(
    'uses the supplied charcoal, red, and gold palette',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-color-background="#1c1c1c"')
      expect(desktopView).toContain('data-color-surface="#242424"')
      expect(desktopView).toContain('data-color-surface2="#2e2e2e"')
      expect(desktopView).toContain('data-color-accent-red="#e94560"')
      expect(desktopView).toContain('data-color-accent-gold="#c4a35a"')
      expect(desktopView).toContain('data-color-text="#eaeaea"')
      expect(desktopView).toContain('data-color-muted="#9a9a9a"')
      expect(desktopView).toContain('data-color-border="#3a3a3a"')
    },
    visualTestTimeout,
  )

  test(
    'keeps the page background solid charcoal',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-page-background="none"')
      expect(desktopView).toContain('data-page-background-color="rgb(28, 28, 28)"')
    },
    visualTestTimeout,
  )

  test(
    'renders game titles in white and Steam store links in gold',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-game-title-color="rgb(234, 234, 234)"')
      expect(desktopView).toContain('data-store-page-color="rgb(196, 163, 90)"')
    },
    visualTestTimeout,
  )

  test(
    'renders card and badge treatments and changes the detail grid at 64rem',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const compactView = renderVisualSnapshot(chromiumPath, 1023)
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(readViewportWidth(compactView)).toBeLessThan(1024)
      expect(compactView).toContain('data-detail-columns="1"')
      expect(readViewportWidth(desktopView)).toBeGreaterThanOrEqual(1024)
      expect(desktopView).toContain('data-detail-columns="3"')
      expect(desktopView).toContain('data-card-border="solid"')
      expect(desktopView).toContain('data-card-shadow="raised"')
      expect(desktopView).toContain('data-badge-border="solid"')
      expect(desktopView).toContain('data-badge-radius="999px"')
    },
    visualTestTimeout,
  )

  test(
    'keeps the compact MiMMa graph contained with equal colored tracks',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const compactView = renderVisualSnapshot(chromiumPath, 1023)

      expect(compactView).toContain('data-mimma-fits="true"')
      expect(readDataAttribute(compactView, 'mimma-track-width')).toBe(
        readDataAttribute(compactView, 'mimma-bar-width'),
      )
      expect(compactView).toContain('data-mimma-micro-color="rgb(45, 156, 219)"')
      expect(compactView).toContain('data-mimma-meso-color="rgb(155, 81, 224)"')
      expect(compactView).toContain('data-mimma-macro-color="rgb(39, 174, 96)"')
    },
    visualTestTimeout,
  )
})
