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
        const shelf = document.querySelector('.catalog-page .shelf')
        const boxBody = document.querySelector('.box-art-body')
        const gameTitleLink = document.querySelector('.game-card h2 a')
        const finePrintLink = document.querySelector('.fine-print a')
        const rootStyle = getComputedStyle(document.documentElement)
        const bodyStyle = getComputedStyle(document.body)
        const columnCount = (element) =>
          getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length.toString()
        const token = (name) => rootStyle.getPropertyValue(name).trim()
        const boxRect = { height: boxBody.offsetHeight, width: boxBody.offsetWidth }

        document.body.dataset.detailColumns = columnCount(detailLayout)
        document.body.dataset.shelfColumns = columnCount(shelf)
        document.body.dataset.viewportWidth = window.innerWidth.toString()
        document.body.dataset.boxRatio = (boxRect.height / boxRect.width).toFixed(2)
        document.body.dataset.colorGround = token('--ground')
        document.body.dataset.colorText = token('--text')
        document.body.dataset.colorMicro = token('--ink-micro')
        document.body.dataset.colorMeso = token('--ink-meso')
        document.body.dataset.colorMacro = token('--ink-macro')
        document.body.dataset.colorSpot = token('--spot')
        document.body.dataset.pageBackground = bodyStyle.backgroundImage
        document.body.dataset.pageBackgroundColor = bodyStyle.backgroundColor
        document.body.dataset.gameTitleColor = getComputedStyle(gameTitleLink).color
        document.body.dataset.finePrintColor = getComputedStyle(finePrintLink).color

        const mimmaFixture = document.querySelector('[data-mimma-fixture]')
        const mimmaGraph = mimmaFixture.querySelector('.mimma-graph')
        const microTrack = mimmaFixture.querySelector('.mimma-axis--micro .mimma-axis-track')
        const microBar = mimmaFixture.querySelector('.mimma-axis--micro .mimma-axis-bar')
        const mesoBar = mimmaFixture.querySelector('.mimma-axis--meso .mimma-axis-bar')
        const macroBar = mimmaFixture.querySelector('.mimma-axis--macro .mimma-axis-bar')

        document.body.dataset.mimmaFits = String(
          mimmaGraph.getBoundingClientRect().width <= mimmaFixture.getBoundingClientRect().width,
        )
        document.body.dataset.mimmaTrackWidth = getComputedStyle(microTrack).width
        document.body.dataset.mimmaBarWidth = getComputedStyle(microBar).width
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
    'defines the ground, text, process-ink, and spot tokens',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-color-ground="#0e0e0f"')
      expect(desktopView).toContain('data-color-text="#f3f2ee"')
      expect(desktopView).toContain('data-color-micro="#00a0e3"')
      expect(desktopView).toContain('data-color-meso="#ec008c"')
      expect(desktopView).toContain('data-color-macro="#ffe100"')
      expect(desktopView).toContain('data-color-spot="#ff5b14"')
    },
    visualTestTimeout,
  )

  test(
    'keeps the page background a solid ground color',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-page-background="none"')
      expect(desktopView).toContain('data-page-background-color="rgb(14, 14, 15)"')
    },
    visualTestTimeout,
  )

  test(
    'renders game titles in the text color and fine-print links in the secondary color',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(desktopView).toContain('data-game-title-color="rgb(243, 242, 238)"')
      expect(desktopView).toContain('data-fine-print-color="rgb(180, 179, 173)"')
    },
    visualTestTimeout,
  )

  test(
    'draws boxes at 2:3 and moves the box beside the game details at 64rem',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const compactView = renderVisualSnapshot(chromiumPath, 1023)
      const desktopView = renderVisualSnapshot(chromiumPath, 1040)

      expect(readViewportWidth(compactView)).toBeLessThan(1024)
      expect(compactView).toContain('data-detail-columns="1"')
      expect(readViewportWidth(desktopView)).toBeGreaterThanOrEqual(1024)
      expect(desktopView).toContain('data-detail-columns="2"')
      expect(Number(readDataAttribute(desktopView, 'shelf-columns'))).toBeGreaterThan(1)
      expect(desktopView).toContain('data-box-ratio="1.50"')
    },
    visualTestTimeout,
  )

  test(
    'keeps the MiMMa graph contained, fills a 100 score across its track, and inks each axis',
    () => {
      const chromiumPath = requireChromiumExecutable()
      const compactView = renderVisualSnapshot(chromiumPath, 1023)

      expect(compactView).toContain('data-mimma-fits="true"')
      expect(readDataAttribute(compactView, 'mimma-bar-width')).toBe(
        readDataAttribute(compactView, 'mimma-track-width'),
      )
      expect(compactView).toContain('data-mimma-micro-color="rgb(0, 160, 227)"')
      expect(compactView).toContain('data-mimma-meso-color="rgb(236, 0, 140)"')
      expect(compactView).toContain('data-mimma-macro-color="rgb(255, 225, 0)"')
    },
    visualTestTimeout,
  )
})
