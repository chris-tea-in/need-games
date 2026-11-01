import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format, resolveConfig } from 'prettier'

import type { MimmaAxis } from '../../src/shared/mimma.js'
import type { ResearchMimmaData } from '../../src/ui/research/research-data.js'
import {
  AXES,
  type AxisRecord,
  LEVEL_SCORE,
  type Line,
  MIN_TAGS_PER_GAME,
  MIN_USABLE_REVIEWS,
  type SurnexLevel,
  type TagVote,
  applyLine,
  bootstrapRange,
  createRandom,
  fitLine,
  highAboveLow,
  mean,
  medianScore,
  mentionRate,
  predictFromTags,
  roundToTen,
  spearman,
  tagAxisMeans,
  tagShares,
  usableReviewMentions,
} from './community-mimma.mts'
import {
  communityCachePath,
  readCatalogGames,
  readSurnexSteamApps,
} from './fetch-community-signals.mts'
import { surnexSteamAppsPath } from './resolve-surnex-steam-apps.mts'

/**
 * Turns the cached community signals into MiMMa estimates for the catalog games, calibrated on
 * the surnex reference games, and compares them with the owner's v1 scores and Claude's scores.
 * Prints the report tables and writes .cache/community-mimma/results.json. With --write-ui it
 * also writes src/ui/generated/research-mimma.ts for the local score preview. Usage:
 *
 *   node scripts/research/analyze-community-mimma.mts [--write-ui]
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const claudeScoresPath = resolve(repositoryRoot, 'data/research/claude-mimma-2026-10-31.json')
const ownerRecordPath = resolve(
  repositoryRoot,
  'data/authoritative-records/owner-authoritative-mimma-v1.json',
)
const catalogPath = resolve(repositoryRoot, 'data/catalog-release-v1.json')
export const researchModulePath = resolve(repositoryRoot, 'src/ui/generated/research-mimma.ts')

export interface GameSignals {
  appid: number
  name: string
  /** Titles removed from review text before matching, so a title is not a mention. */
  titles: readonly string[]
  tags: readonly TagVote[]
  reviews: readonly string[]
}

export interface ReferenceSignals extends GameSignals {
  levels: AxisRecord<SurnexLevel>
}

export interface CatalogSignals extends GameSignals {
  claude: AxisRecord<number>
  owner: AxisRecord<number> | null
  surnex: AxisRecord<SurnexLevel> | null
}

export interface AxisValidation {
  spearman: number
  highAboveLow: number
  meanError: number
  line: Line
}

export interface ReviewAxisValidation extends AxisValidation {
  lowRate: number
  highRate: number
}

export interface AxisEstimate {
  owner: number | null
  claude: number
  tags: number | null
  reviews: { score: number; low: number; high: number; rate: number } | null
  surnex: number | null
}

export interface CatalogEstimate {
  appid: number
  name: string
  usableReviews: number
  tagCoverage: number
  /** Top-five tags that fewer than MIN_TAG_SUPPORT reference games carry. */
  unsupportedTopTags: string[]
  axes: AxisRecord<AxisEstimate>
}

export interface Agreement {
  spearman: number
  meanAbsDiff: number
}

export interface CommunityAnalysis {
  tagValidation: { referenceGames: number; supportedTags: number; axes: AxisRecord<AxisValidation> }
  reviewValidation: { referenceGames: number; axes: AxisRecord<ReviewAxisValidation> }
  catalog: CatalogEstimate[]
  agreementWithOwner: Record<'claude' | 'tags' | 'reviews', AxisRecord<Agreement>>
}

function axisRecord<T>(build: (axis: MimmaAxis) => T): AxisRecord<T> {
  return { micro: build('micro'), meso: build('meso'), macro: build('macro') }
}

function agreement(left: readonly number[], right: readonly number[]): Agreement {
  return {
    spearman: spearman(left, right),
    meanAbsDiff: mean(left.map((value, index) => Math.abs(value - right[index]))),
  }
}

export function analyzeCommunityMimma(
  reference: readonly ReferenceSignals[],
  catalog: readonly CatalogSignals[],
  seed = 20261031,
): CommunityAnalysis {
  // Tags: per-tag average labels, validated by leaving each reference game out.
  const tagged = reference
    .filter((game) => game.tags.length >= MIN_TAGS_PER_GAME)
    .map((game) => ({ appid: game.appid, levels: game.levels, shares: tagShares(game.tags) }))
  const leaveOneOut = tagged.flatMap((game) => {
    const prediction = predictFromTags(game.shares, tagAxisMeans(tagged, game.appid))
    return prediction.raw === null ? [] : [{ levels: game.levels, raw: prediction.raw }]
  })
  const allMeans = tagAxisMeans(tagged)
  const tagAxes = axisRecord((axis): AxisValidation => {
    const xs = leaveOneOut.map((entry) => entry.raw[axis])
    const ys = leaveOneOut.map((entry) => LEVEL_SCORE[entry.levels[axis]])
    const line = fitLine(xs, ys)
    return {
      spearman: spearman(xs, ys),
      highAboveLow: highAboveLow(
        leaveOneOut.map((entry) => ({ level: entry.levels[axis], value: entry.raw[axis] })),
      ),
      meanError: mean(xs.map((x, index) => Math.abs(applyLine(line, x) - ys[index]))),
      line,
    }
  })

  // Reviews: share of usable reviews that mention each axis, mapped by a fitted line.
  const reviewReference = reference.flatMap((game) => {
    const mentions = usableReviewMentions(game.reviews, game.titles)
    return mentions.length >= MIN_USABLE_REVIEWS ? [{ levels: game.levels, mentions }] : []
  })
  const reviewAxes = axisRecord((axis): ReviewAxisValidation => {
    const xs = reviewReference.map((game) => mentionRate(game.mentions, axis))
    const ys = reviewReference.map((game) => LEVEL_SCORE[game.levels[axis]])
    const line = fitLine(xs, ys)
    const rateFor = (level: SurnexLevel) =>
      mean(xs.filter((_, index) => reviewReference[index].levels[axis] === level))
    return {
      spearman: spearman(xs, ys),
      highAboveLow: highAboveLow(
        reviewReference.map((game, index) => ({ level: game.levels[axis], value: xs[index] })),
      ),
      meanError: mean(xs.map((x, index) => Math.abs(applyLine(line, x) - ys[index]))),
      line,
      lowRate: rateFor('low'),
      highRate: rateFor('high'),
    }
  })

  const random = createRandom(seed)
  const estimates = catalog.map((game): CatalogEstimate => {
    const shares = tagShares(game.tags)
    const tagPrediction = predictFromTags(shares, allMeans)
    const mentions = usableReviewMentions(game.reviews, game.titles)
    const topTags = [...shares.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return {
      appid: game.appid,
      name: game.name,
      usableReviews: mentions.length,
      tagCoverage: tagPrediction.coverage,
      unsupportedTopTags: topTags.filter(([tag]) => !allMeans.has(tag)).map(([tag]) => tag),
      axes: axisRecord((axis): AxisEstimate => {
        const rate = mentionRate(mentions, axis)
        const reviewLine = reviewAxes[axis].line
        return {
          owner: game.owner?.[axis] ?? null,
          claude: game.claude[axis],
          tags:
            tagPrediction.raw === null
              ? null
              : roundToTen(applyLine(tagAxes[axis].line, tagPrediction.raw[axis])),
          reviews:
            mentions.length < MIN_USABLE_REVIEWS
              ? null
              : {
                  score: roundToTen(applyLine(reviewLine, rate)),
                  ...bootstrapRange(mentions, axis, reviewLine, random),
                  rate,
                },
          surnex: game.surnex === null ? null : LEVEL_SCORE[game.surnex[axis]],
        }
      }),
    }
  })

  const scored = estimates.filter((estimate) => estimate.axes.micro.owner !== null)
  const compare = (read: (estimate: AxisEstimate) => number | null) =>
    axisRecord((axis) => {
      const pairs = scored.flatMap((estimate) => {
        const cell = estimate.axes[axis]
        const value = read(cell)
        return cell.owner === null || value === null ? [] : [[cell.owner, value] as const]
      })
      return agreement(
        pairs.map(([owner]) => owner),
        pairs.map(([, value]) => value),
      )
    })

  return {
    tagValidation: { referenceGames: tagged.length, supportedTags: allMeans.size, axes: tagAxes },
    reviewValidation: { referenceGames: reviewReference.length, axes: reviewAxes },
    catalog: estimates,
    agreementWithOwner: {
      claude: compare((cell) => cell.claude),
      tags: compare((cell) => cell.tags),
      reviews: compare((cell) => cell.reviews?.score ?? null),
    },
  }
}

/**
 * Every source per game and axis for the local score preview. "all" is the median of every source
 * with a value: owner v1, Claude, tags, reviews, and surnex.
 */
export function researchUiData(
  analysis: CommunityAnalysis,
  collectedOn: string,
): ResearchMimmaData {
  return {
    collectedOn,
    games: analysis.catalog.map((estimate) => ({
      steamAppId: estimate.appid,
      ...axisRecord((axis) => {
        const cell = estimate.axes[axis]
        const reviews = cell.reviews?.score ?? null
        const values = [cell.owner, cell.claude, cell.tags, reviews, cell.surnex].filter(
          (value): value is number => value !== null,
        )
        return {
          owner: cell.owner,
          claude: cell.claude,
          tags: cell.tags,
          tagsLowConfidence: estimate.unsupportedTopTags.length > 0,
          reviews,
          reviewsRange:
            cell.reviews === null ? null : ([cell.reviews.low, cell.reviews.high] as const),
          surnex: cell.surnex,
          all: medianScore(values),
        }
      }),
    })),
  }
}

export async function renderResearchModule(data: ResearchMimmaData): Promise<string> {
  const source = `// Generated by scripts/research/analyze-community-mimma.mts --write-ui. Do not edit.
import type { ResearchMimmaData } from '../research/research-data.js'

export const researchMimma = ${JSON.stringify(data, null, 2)} as const satisfies ResearchMimmaData
`
  const config = await resolveConfig(researchModulePath)
  return format(source, { ...config, filepath: researchModulePath })
}

const AXIS_NAMES: AxisRecord<string> = { micro: 'Micro', meso: 'Meso', macro: 'Macro' }

export function renderMarkdown(
  analysis: CommunityAnalysis,
  displayName: (name: string) => string = (name) => name,
): string {
  const lines: string[] = []
  const fixed = (value: number, digits = 2) =>
    Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
  const percent = (value: number) => `${Math.round(value * 100)}%`
  for (const axis of AXES) {
    lines.push(`### ${AXIS_NAMES[axis]}`, '')
    lines.push('| Game | Owner v1 | Claude | Tags | Reviews (80% range) | surnex |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const estimate of analysis.catalog) {
      const cell = estimate.axes[axis]
      const tags =
        cell.tags === null
          ? 'none'
          : `${cell.tags}${estimate.unsupportedTopTags.length > 0 ? ' (low confidence)' : ''}`
      const reviews =
        cell.reviews === null
          ? 'none'
          : `${cell.reviews.score} (${cell.reviews.low} to ${cell.reviews.high})`
      lines.push(
        `| ${displayName(estimate.name)} | ${cell.owner ?? 'none'} | ${cell.claude} | ${tags} | ${reviews} | ${cell.surnex ?? 'none'} |`,
      )
    }
    lines.push('')
  }

  lines.push('### Agreement with the owner v1 scores', '')
  lines.push('| Method | Micro | Meso | Macro |', '| --- | --- | --- | --- |')
  for (const [method, axes] of Object.entries(analysis.agreementWithOwner)) {
    lines.push(
      `| ${method} | ${AXES.map((axis) => `${fixed(axes[axis].spearman)} / ${fixed(axes[axis].meanAbsDiff, 0)}`).join(' | ')} |`,
    )
  }
  lines.push('')

  lines.push(
    `### Tag validation (${analysis.tagValidation.referenceGames} reference games, ${analysis.tagValidation.supportedTags} supported tags)`,
    '',
  )
  lines.push(
    '| Axis | Rank correlation | High above low | Mean error |',
    '| --- | --- | --- | --- |',
  )
  for (const axis of AXES) {
    const row = analysis.tagValidation.axes[axis]
    lines.push(
      `| ${AXIS_NAMES[axis]} | ${fixed(row.spearman)} | ${percent(row.highAboveLow)} | ${fixed(row.meanError, 0)} points |`,
    )
  }
  lines.push('')

  lines.push(
    `### Review validation (${analysis.reviewValidation.referenceGames} reference games)`,
    '',
  )
  lines.push(
    '| Axis | Rank correlation | High above low | Mean error | Mention share (low / high) |',
    '| --- | --- | --- | --- | --- |',
  )
  for (const axis of AXES) {
    const row = analysis.reviewValidation.axes[axis]
    lines.push(
      `| ${AXIS_NAMES[axis]} | ${fixed(row.spearman)} | ${percent(row.highAboveLow)} | ${fixed(row.meanError, 0)} points | ${percent(row.lowRate)} / ${percent(row.highRate)} |`,
    )
  }
  lines.push('')

  lines.push('### Samples', '')
  for (const estimate of analysis.catalog) {
    const unsupported =
      estimate.unsupportedTopTags.length === 0
        ? ''
        : `, unsupported top tags: ${estimate.unsupportedTopTags.join(', ')}`
    lines.push(
      `- ${displayName(estimate.name)}: ${estimate.usableReviews} usable reviews, tag coverage ${percent(estimate.tagCoverage)}${unsupported}`,
    )
  }
  return `${lines.join('\n')}\n`
}

// ---------- reading the repository and cache ----------

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function readTags(appid: number): TagVote[] {
  return readJson(resolve(communityCachePath, 'tags', `${appid}.json`)) as TagVote[]
}

function readReviews(appid: number): string[] {
  const reviews = readJson(resolve(communityCachePath, 'reviews', `${appid}.json`)) as {
    text: string
  }[]
  return reviews.map((review) => review.text)
}

interface ClaudeScoreFile {
  games: ({ appid: number } & AxisRecord<{ score: number; reason: string }>)[]
}

interface OwnerRecordFile {
  games: { id: string; score: AxisRecord<number> }[]
  mappings: { authoritativeGameId: string; externalId: string }[]
}

const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'ELDEN RING': 'Elden Ring',
  "Tom Clancy's Rainbow Six Siege": 'Rainbow Six Siege',
}

async function main(): Promise<void> {
  const apps = readSurnexSteamApps(readFileSync(surnexSteamAppsPath, 'utf8'))
  const catalogGames = readCatalogGames(readFileSync(catalogPath, 'utf8'))
  const catalogIds = new Set(catalogGames.map((game) => game.appid))
  const claude = readJson(claudeScoresPath) as ClaudeScoreFile
  const owner = readJson(ownerRecordPath) as OwnerRecordFile
  const ownerScores = new Map(
    owner.mappings.map((mapping) => [
      Number(mapping.externalId),
      owner.games.find((game) => game.id === mapping.authoritativeGameId)?.score ?? null,
    ]),
  )

  const seen = new Set<number>()
  const reference: ReferenceSignals[] = []
  for (const app of apps) {
    if (app.appid === null || catalogIds.has(app.appid) || seen.has(app.appid)) continue
    seen.add(app.appid)
    reference.push({
      appid: app.appid,
      name: app.name,
      titles: [app.name, ...(app.steamName === null ? [] : [app.steamName])],
      tags: readTags(app.appid),
      reviews: readReviews(app.appid),
      levels: app.levels,
    })
  }

  const catalog: CatalogSignals[] = catalogGames.map((game) => {
    const claudeGame = claude.games.find((entry) => entry.appid === game.appid)
    if (claudeGame === undefined) throw new Error(`no Claude score for ${game.title}`)
    const surnexRow = apps.find((app) => app.appid === game.appid)
    return {
      appid: game.appid,
      name: game.title,
      titles: [game.title, ...(surnexRow === undefined ? [] : [surnexRow.name])],
      tags: readTags(game.appid),
      reviews: readReviews(game.appid),
      claude: axisRecord((axis) => claudeGame[axis].score),
      owner: ownerScores.get(game.appid) ?? null,
      surnex: surnexRow?.levels ?? null,
    }
  })

  const analysis = analyzeCommunityMimma(reference, catalog)
  writeFileSync(
    resolve(communityCachePath, 'results.json'),
    `${JSON.stringify(analysis, null, 2)}\n`,
  )
  process.stdout.write(renderMarkdown(analysis, (name) => DISPLAY_NAMES[name] ?? name))

  if (process.argv.includes('--write-ui')) {
    const manifest = readJson(resolve(communityCachePath, 'manifest.json')) as { fetchedAt: string }
    const data = researchUiData(analysis, manifest.fetchedAt.slice(0, 10))
    writeFileSync(researchModulePath, await renderResearchModule(data))
    process.stdout.write(`
Wrote ${researchModulePath}.
`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
