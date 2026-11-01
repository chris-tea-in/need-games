import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  type CatalogSignals,
  type ReferenceSignals,
  analyzeCommunityMimma,
  renderMarkdown,
  renderResearchModule,
  researchUiData,
} from '../../scripts/research/analyze-community-mimma.mts'
import { type Fetcher, medianScore } from '../../scripts/research/community-mimma.mts'
import {
  communityGames,
  readCatalogGames,
  readSurnexSteamApps,
} from '../../scripts/research/fetch-community-signals.mts'
import {
  MANUAL_STEAM_APPS,
  normalizeTitle,
  parseStoreSearch,
  parseSurnexCsv,
  resolveSurnexRows,
} from '../../scripts/research/resolve-surnex-steam-apps.mts'

const root = resolve(import.meta.dirname, '../..')
const noWait = () => Promise.resolve()
const filler =
  'this game kept me playing for many long evenings with friends and I keep coming back to it every weekend'

function review(keyword: string | null): string {
  return keyword === null ? `${filler} again.` : `${filler} for the ${keyword}.`
}

/** A reference game whose tags and reviews both point at one axis. */
function referenceGame(appid: number, axis: 'micro' | 'meso' | 'macro'): ReferenceSignals {
  const profile = {
    macro: { keyword: 'strategy', tags: ['Strategy', 'Simulation'] },
    meso: { keyword: 'bluffing', tags: ['Party', 'Social Deduction'] },
    micro: { keyword: 'precision', tags: ['Rhythm', 'Arcade'] },
  }[axis]
  const mentions = 8 + (appid % 4)
  return {
    appid,
    name: `Reference ${appid}`,
    titles: [`Reference ${appid}`],
    tags: [
      { name: profile.tags[0], weight: 300 },
      { name: profile.tags[1], weight: 100 },
      { name: 'Indie', weight: 100 },
      { name: 'Casual', weight: 100 },
      { name: 'Singleplayer', weight: 100 },
    ],
    reviews: Array.from({ length: 20 }, (_, index) =>
      review(index < mentions ? profile.keyword : null),
    ),
    levels: {
      macro: axis === 'macro' ? 'high' : 'low',
      meso: axis === 'meso' ? 'high' : 'low',
      micro: axis === 'micro' ? 'high' : 'low',
    },
  }
}

const reference = [
  ...[1, 2, 3, 4].map((appid) => referenceGame(appid, 'micro')),
  ...[5, 6, 7, 8].map((appid) => referenceGame(appid, 'meso')),
  ...[9, 10, 11, 12].map((appid) => referenceGame(appid, 'macro')),
]

const catalog: CatalogSignals[] = [
  {
    appid: 100,
    name: 'Planner',
    titles: ['Planner'],
    tags: [
      { name: 'Strategy', weight: 300 },
      { name: 'Hovercraft', weight: 200 },
      { name: 'Indie', weight: 100 },
    ],
    reviews: Array.from({ length: 20 }, (_, index) => review(index < 12 ? 'strategy' : null)),
    claude: { macro: 90, meso: 20, micro: 20 },
    owner: { macro: 100, meso: 20, micro: 10 },
    surnex: null,
  },
  {
    appid: 101,
    name: 'Drummer',
    titles: ['Drummer'],
    tags: [
      { name: 'Rhythm', weight: 300 },
      { name: 'Arcade', weight: 100 },
    ],
    reviews: Array.from({ length: 20 }, (_, index) => review(index < 12 ? 'precision' : null)),
    claude: { macro: 10, meso: 10, micro: 90 },
    owner: { macro: 20, meso: 10, micro: 90 },
    surnex: { macro: 'low', meso: 'low', micro: 'high' },
  },
  {
    appid: 102,
    name: 'Liar',
    titles: ['Liar'],
    tags: [{ name: 'Party', weight: 100 }],
    reviews: Array.from({ length: 5 }, () => review('bluffing')),
    claude: { macro: 20, meso: 90, micro: 10 },
    owner: null,
    surnex: null,
  },
]

describe('community MiMMa analysis', () => {
  const analysis = analyzeCommunityMimma(reference, catalog)

  test('validates both community passes on the reference games', () => {
    expect(analysis.tagValidation.referenceGames).toBe(12)
    expect(analysis.tagValidation.supportedTags).toBe(9)
    expect(analysis.reviewValidation.referenceGames).toBe(12)
    for (const axis of ['micro', 'meso', 'macro'] as const) {
      expect(analysis.tagValidation.axes[axis].highAboveLow).toBe(1)
      expect(analysis.reviewValidation.axes[axis].highAboveLow).toBe(1)
      expect(analysis.reviewValidation.axes[axis].highRate).toBeGreaterThan(
        analysis.reviewValidation.axes[axis].lowRate,
      )
    }
  })

  test('scores catalog games toward the axis their community signals point at', () => {
    const [planner, drummer, liar] = analysis.catalog

    expect(planner.axes.macro.tags).toBeGreaterThan(planner.axes.micro.tags ?? 100)
    expect(planner.axes.macro.reviews?.score).toBeGreaterThan(
      planner.axes.micro.reviews?.score ?? 100,
    )
    expect(drummer.axes.micro.tags).toBeGreaterThan(drummer.axes.macro.tags ?? 100)
    expect(drummer.axes.micro.surnex).toBe(80)
    for (const estimate of [planner, drummer]) {
      for (const axis of ['micro', 'meso', 'macro'] as const) {
        const cell = estimate.axes[axis].reviews
        expect(cell).not.toBeNull()
        expect(cell?.low).toBeLessThanOrEqual(cell?.score ?? -1)
        expect(cell?.high).toBeGreaterThanOrEqual(cell?.score ?? 101)
      }
    }
    expect(liar.usableReviews).toBe(5)
    expect(liar.axes.meso.reviews).toBeNull()
  })

  test('flags tag estimates whose top tags the reference games lack', () => {
    expect(analysis.catalog[0].unsupportedTopTags).toEqual(['Hovercraft'])
    expect(analysis.catalog[0].tagCoverage).toBeCloseTo(4 / 6)
    expect(analysis.catalog[1].unsupportedTopTags).toEqual([])
  })

  test('compares each method with the owner scores only where the owner scored', () => {
    expect(analysis.agreementWithOwner.claude.micro.spearman).toBeCloseTo(1)
    expect(analysis.agreementWithOwner.claude.macro.meanAbsDiff).toBe(10)
  })

  test('combines every available source into the "all data" median for the UI', () => {
    const data = researchUiData(analysis, '2026-10-31')
    const planner = data.games[0]
    const cell = analysis.catalog[0].axes.macro
    const sources = [cell.owner, cell.claude, cell.tags, cell.reviews?.score ?? null, cell.surnex]

    expect(data.collectedOn).toBe('2026-10-31')
    expect(data.games.map((game) => game.steamAppId)).toEqual([100, 101, 102])
    expect(planner.macro).toMatchObject({
      claude: 90,
      owner: 100,
      surnex: null,
      tagsLowConfidence: true,
    })
    expect(planner.macro.all).toBe(medianScore(sources.filter((value) => value !== null)))
    expect(data.games[2].meso).toMatchObject({ owner: null, reviews: null, reviewsRange: null })
  })

  test('writes the UI module as formatted, typed TypeScript', async () => {
    const source = await renderResearchModule(researchUiData(analysis, '2026-10-31'))

    expect(source.startsWith('// Generated by scripts/research/analyze-community-mimma.mts')).toBe(
      true,
    )
    expect(source).toContain(
      "import type { ResearchMimmaData } from '../research/research-data.js'",
    )
    expect(source).toContain('steamAppId: 100,')
    expect(source).toContain('} as const satisfies ResearchMimmaData')
  })

  test('renders the report tables', () => {
    const markdown = renderMarkdown(analysis, (name) => (name === 'Liar' ? 'Liar Game' : name))

    expect(markdown).toContain('### Micro')
    expect(markdown).toContain('| Game | Owner v1 | Claude | Tags | Reviews (80% range) | surnex |')
    expect(markdown).toContain('(low confidence)')
    expect(markdown).toContain('| Liar Game | none | 90 |')
    expect(markdown).toContain('### Tag validation (12 reference games, 9 supported tags)')
    expect(markdown).toContain(
      '- Planner: 20 usable reviews, tag coverage 67%, unsupported top tags: Hovercraft',
    )
  })
})

describe('surnex to Steam matching', () => {
  test('normalizes titles, removing trademark signs before Unicode normalization', () => {
    expect(normalizeTitle('FOR HONOR™')).toBe('for honor')
    expect(normalizeTitle('Apex Legends™')).toBe('apex legends')
    expect(normalizeTitle('Sid Meier\u2019s Civilization® VI')).toBe('sid meiers civilization vi')
    expect(normalizeTitle('Pokémon: Let\u2019s Go & Friends')).toBe('pokemon lets go and friends')
  })

  test('reads the surnex CSV and rejects a bad header or level', () => {
    expect(
      parseSurnexCsv('game,zone,micro,meso,macro,provenance\r\nAimlabs,micro,high,low,low,x\r\n'),
    ).toEqual([
      { levels: { macro: 'low', meso: 'low', micro: 'high' }, name: 'Aimlabs', zone: 'micro' },
    ])
    expect(() => parseSurnexCsv('name,zone\nA,micro')).toThrow('header')
    expect(() =>
      parseSurnexCsv('game,zone,micro,meso,macro,provenance\nA,micro,huge,low,low,x'),
    ).toThrow('unknown level')
  })

  test('keeps only app results from the store search', () => {
    expect(
      parseStoreSearch({
        items: [
          { id: 1, name: 'Game', type: 'app' },
          { id: 2, name: 'Bundle', type: 'sub' },
          { id: '3', name: 'Bad', type: 'app' },
        ],
      }),
    ).toEqual([{ id: 1, name: 'Game' }])
    expect(parseStoreSearch(null)).toEqual([])
  })

  test('prefers an exact title, then the manual list, else no match', async () => {
    const results: Record<string, unknown> = {
      'For Honor': { items: [{ id: 304390, name: 'FOR HONOR™', type: 'app' }] },
      Tekken: { items: [{ id: 1778820, name: 'TEKKEN 8', type: 'app' }] },
      Chess: { items: [{ id: 5, name: 'RPG Chess', type: 'app' }] },
    }
    const fetcher: Fetcher = (url) => {
      const term = new URL(url).searchParams.get('term') ?? ''
      return Promise.resolve(new Response(JSON.stringify(results[term] ?? { items: [] })))
    }
    const levels = { macro: 'low', meso: 'low', micro: 'high' } as const
    const rows = ['For Honor', 'Tekken', 'Chess'].map((name) => ({ levels, name, zone: 'micro' }))

    const resolved = await resolveSurnexRows(rows, fetcher, noWait)

    expect(resolved.map(({ appid, match, steamName }) => ({ appid, match, steamName }))).toEqual([
      { appid: 304390, match: 'exact', steamName: 'FOR HONOR™' },
      { appid: MANUAL_STEAM_APPS.Tekken, match: 'manual', steamName: 'TEKKEN 8' },
      { appid: null, match: 'none', steamName: null },
    ])
  })

  test('the committed mapping follows the surnex CSV row for row', () => {
    const rows = parseSurnexCsv(readFileSync(resolve(root, 'data/surnex-dataset.csv'), 'utf8'))
    const apps = readSurnexSteamApps(
      readFileSync(resolve(root, 'data/research/surnex-steam-apps.json'), 'utf8'),
    )

    expect(apps.map(({ levels, name, zone }) => ({ levels, name, zone }))).toEqual(rows)
    for (const app of apps) {
      expect(app.match === 'none').toBe(app.appid === null)
      if (app.match === 'manual') expect(app.appid).toBe(MANUAL_STEAM_APPS[app.name])
    }
  })
})

describe('community game list', () => {
  test('lists catalog games first, then each matched reference game once', () => {
    const levels = { macro: 'low', meso: 'low', micro: 'high' } as const
    const app = (name: string, appid: number | null) => ({
      appid,
      levels,
      match: appid === null ? ('none' as const) : ('exact' as const),
      name,
      steamName: name,
      zone: 'micro',
    })

    expect(
      communityGames(
        [{ appid: 730, title: 'Counter-Strike 2' }],
        [
          app('Counter-Strike 2', 730),
          app('Aimlabs', 714010),
          app('Aim Lab', 714010),
          app('Chess', null),
        ],
      ),
    ).toEqual([
      { appid: 730, group: 'catalog', name: 'Counter-Strike 2' },
      { appid: 714010, group: 'reference', name: 'Aimlabs' },
    ])
  })

  test('reads the catalog release and rejects games without an app ID', () => {
    expect(
      readCatalogGames(JSON.stringify({ games: [{ steamAppId: 730, title: 'CS2' }] })),
    ).toEqual([{ appid: 730, title: 'CS2' }])
    expect(() => readCatalogGames('{}')).toThrow('no games array')
    expect(() => readCatalogGames(JSON.stringify({ games: [{ title: 'x' }] }))).toThrow(
      'no Steam app ID',
    )
    expect(() => readSurnexSteamApps('{}')).toThrow('must be an array')
  })
})
