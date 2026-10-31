import type { MimmaAxis } from '../../src/shared/mimma.js'

/**
 * Shared pieces of the community MiMMa research scripts: the Steam API requests and response
 * parsing, the review word lists, the tag model, and the statistics. See
 * docs/MIMMA_RESCORING_2026-10-31.md for the method.
 */

export const AXES = ['micro', 'meso', 'macro'] as const satisfies readonly MimmaAxis[]

export type AxisRecord<T> = Record<MimmaAxis, T>
export type SurnexLevel = 'high' | 'med' | 'low'

/** The surnex labels as MiMMa values: the middle of the High, Moderate, and Slight label rows. */
export const LEVEL_SCORE: Readonly<Record<SurnexLevel, number>> = { high: 80, med: 50, low: 20 }

export const MIN_REVIEW_WORDS = 20
export const MIN_USABLE_REVIEWS = 15
export const MIN_TAG_SUPPORT = 3
/** Reference games with fewer tags than this are left out of the tag model. */
export const MIN_TAGS_PER_GAME = 5

export function isSurnexLevel(value: unknown): value is SurnexLevel {
  return value === 'high' || value === 'med' || value === 'low'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------- Steam APIs ----------

/** Official, keyless Steam Web API methods. The old store `appreviews` endpoint is deprecated. */
export const STEAM_API = {
  appReviews: 'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/',
  storeItems: 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/',
  tagList: 'https://api.steampowered.com/IStoreService/GetTagList/v1/',
} as const

function withInputJson(url: string, input: unknown): string {
  return `${url}?input_json=${encodeURIComponent(JSON.stringify(input))}`
}

/** One page of the most helpful English reviews of all time, from every purchase type. */
export function appReviewsUrl(appid: number, cursor: string, perPage = 100): string {
  return withInputJson(STEAM_API.appReviews, {
    appid,
    filter: 0,
    languages: ['english'],
    day_range: 0,
    cursor,
    review_type: 0,
    purchase_type: 1,
    num_per_page: perPage,
  })
}

export function storeItemTagsUrl(appids: readonly number[], tagCount = 20): string {
  return withInputJson(STEAM_API.storeItems, {
    ids: appids.map((appid) => ({ appid })),
    context: { language: 'english', country_code: 'US' },
    data_request: { include_tag_count: tagCount },
  })
}

export function tagListUrl(): string {
  return withInputJson(STEAM_API.tagList, { language: 'english' })
}

export interface SteamReview {
  id: string
  text: string
  votedUp: boolean
  votesUp: number
}

export interface AppReviewsPage {
  reviews: SteamReview[]
  cursor: string | null
  totalMatching: number | null
}

export function parseAppReviewsPage(body: unknown): AppReviewsPage {
  if (!isRecord(body) || !isRecord(body.response)) {
    throw new Error('GetAppReviews returned no response object')
  }
  const { response } = body
  const reviews = (Array.isArray(response.reviews) ? response.reviews : []).flatMap(
    (review: unknown): SteamReview[] => {
      if (!isRecord(review) || typeof review.review !== 'string') return []
      const id = review.recommendationid
      if (typeof id !== 'string' && typeof id !== 'number') return []
      return [
        {
          id: String(id),
          text: review.review,
          votedUp: review.voted_up === true,
          votesUp: typeof review.votes_up === 'number' ? review.votes_up : 0,
        },
      ]
    },
  )
  return {
    reviews,
    cursor: typeof response.cursor === 'string' ? response.cursor : null,
    totalMatching: typeof response.total_matching === 'number' ? response.total_matching : null,
  }
}

export interface TagVote {
  name: string
  weight: number
}

export function parseTagNames(body: unknown): Map<number, string> {
  if (!isRecord(body) || !isRecord(body.response) || !Array.isArray(body.response.tags)) {
    throw new Error('GetTagList returned no tag list')
  }
  const names = new Map<number, string>()
  for (const tag of body.response.tags as unknown[]) {
    if (isRecord(tag) && typeof tag.tagid === 'number' && typeof tag.name === 'string') {
      names.set(tag.tagid, tag.name)
    }
  }
  return names
}

/** Tag weights per app. Steam's weights are proportional to the player votes on each tag. */
export function parseStoreItemTags(
  body: unknown,
  tagNames: ReadonlyMap<number, string>,
): Map<number, TagVote[]> {
  if (!isRecord(body) || !isRecord(body.response)) {
    throw new Error('GetItems returned no response object')
  }
  const items: unknown[] = Array.isArray(body.response.store_items) ? body.response.store_items : []
  const tagsByApp = new Map<number, TagVote[]>()
  for (const item of items) {
    if (!isRecord(item) || typeof item.appid !== 'number') continue
    const tags: unknown[] = Array.isArray(item.tags) ? item.tags : []
    tagsByApp.set(
      item.appid,
      tags.flatMap((tag): TagVote[] => {
        if (!isRecord(tag) || typeof tag.tagid !== 'number' || typeof tag.weight !== 'number') {
          return []
        }
        const name = tagNames.get(tag.tagid)
        return name === undefined ? [] : [{ name, weight: tag.weight }]
      }),
    )
  }
  return tagsByApp
}

export type Fetcher = (url: string) => Promise<Response>
export type Sleeper = (milliseconds: number) => Promise<void>

export const sleep: Sleeper = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

/** GET a JSON body, retrying rate limits (429) and server errors with exponential backoff. */
export async function getJson(
  url: string,
  fetcher: Fetcher,
  wait: Sleeper = sleep,
  attempts = 6,
): Promise<unknown> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher(url)
    if (response.ok) return response.json()
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`Steam request failed with HTTP ${response.status}: ${url}`)
    }
    await wait(2000 * 2 ** attempt)
  }
  throw new Error(`Steam request still failing after ${attempts} attempts: ${url}`)
}

/** Page through GetAppReviews until `count` unique reviews or the end of the list. */
export async function fetchAppReviews(
  appid: number,
  count: number,
  fetcher: Fetcher,
  wait: Sleeper = sleep,
): Promise<SteamReview[]> {
  const reviews = new Map<string, SteamReview>()
  let cursor = '*'
  while (reviews.size < count) {
    const page = parseAppReviewsPage(
      await getJson(appReviewsUrl(appid, cursor, Math.min(100, count)), fetcher, wait),
    )
    for (const review of page.reviews) reviews.set(review.id, review)
    if (page.reviews.length === 0 || page.cursor === null || page.cursor === cursor) break
    cursor = page.cursor
    await wait(300)
  }
  return [...reviews.values()].slice(0, count)
}

// ---------- review text ----------

export const REVIEW_LEXICON: Readonly<AxisRecord<readonly RegExp[]>> = {
  micro: [
    /\baim(s|ing|ed)?\b/,
    /\breflex(es)?\b/,
    /\breaction (time|speed)s?\b/,
    /\bprecis(e|ion)\b/,
    /\btiming\b/,
    /\brecoil\b/,
    /\bspray(ing)?\b/,
    /\bflick(s|ing)?\b/,
    /\bheadshots?\b/,
    /\bdodg(e|es|ing|ed)\b/,
    /\bparr(y|ies|ying|ied)\b/,
    /\bi-?frames?\b/,
    /\bcombos?\b/,
    /\bexecution\b/,
    /\bfast[- ]paced\b/,
    /\btwitchy\b/,
    /\btwitch shooter\b/,
    /\bmovement tech\b/,
    /\bbunny ?hop(ping)?\b/,
    /\bbhop\b/,
    /\bstraf(e|es|ing)\b/,
    /\bskill (ceiling|gap)\b/,
    /\bmechanical(ly)? skill\b/,
    /\bmechanically\b/,
    /\bhand[- ]eye\b/,
    /\bmuscle memory\b/,
    /\bhitbox(es)?\b/,
    /\bhit ?reg(istration)?\b/,
    /\binputs\b/,
    /\binput (lag|delay|buffer)\b/,
  ],
  meso: [
    /\bmind ?games?\b/,
    /\bout(smart|think|wit|guess|play)(s|ed|ing)?\b/,
    /\bbluff(s|ing|ed)?\b/,
    /\bbait(s|ing|ed)?\b/,
    /\bdecei(t|ve|ving|ved)\b/,
    /\bdecept(ion|ive)\b/,
    /\bpredict(s|ed|ing|able|ability|ion)?\b/,
    /\bunpredictab(le|ility)\b/,
    /\bguessing\b/,
    /\bhidden (information|info|roles?|identit(y|ies)|traitors?)\b/,
    /\bintel\b/,
    /\binfo(rmation)? (gathering|denial|war)\b/,
    /\brandomness\b/,
    /\brandomi[sz]ed\b/,
    /\brng\b/,
    /\bluck(y)?\b/,
    /\bunlucky\b/,
    /\bdeduc(e|tion|tive)\b/,
    /\bsuspicio(n|us)\b/,
    /\bsus\b/,
    /\bunknown\b/,
    /\buncertain(ty)?\b/,
    /\bambush(ed|es)?\b/,
    /\bflank(s|ing|ed)?\b/,
    /\bfootsteps\b/,
    /\b(sound|audio) cues?\b/,
    /\bread(ing)? (the|your|my|their) (opponents?|enem(y|ies))\b/,
    /\bfog of war\b/,
    /\badapt(ing|ation|ive)?\b/,
  ],
  macro: [
    /\bstrateg(y|ies|ic|ically|ize|izing)\b/,
    /\btactic(s|al|ally)?\b/,
    /\bplanning\b/,
    /\bplans? ahead\b/,
    /\bgame ?plan\b/,
    /\blong[- ]term\b/,
    /\beconom(y|ies|ic)\b/,
    /\bresources?\b/,
    /\bmanagement\b/,
    /\bmanaging\b/,
    /\bmicro ?manag\w*\b/,
    /\bbuilds\b/,
    /\bbuild ?(variety|diversity|crafting|options|making)\b/,
    /\btheory ?craft(ing)?\b/,
    /\bmin[- ]?max(ing|ers?)?\b/,
    /\bloadouts?\b/,
    /\bteam comp(osition)?s?\b/,
    /\bcomps\b/,
    /\bsynerg(y|ies|ize)\b/,
    /\brotat(e|es|ion|ions|ing)\b/,
    /\bcrafting\b/,
    /\bautomat(e|es|ion|ing)\b/,
    /\bbase[- ]?building\b/,
    /\bdecision(s|[- ]making)?\b/,
    /\b(skill|tech) trees?\b/,
    /\bcounter[- ]?pick(s|ing)?\b/,
    /\bcoordinat(e|es|ion|ed|ing)\b/,
  ],
}

/** Steam review text with its BBCode markup ([b], [url=...], [list], [*]) removed. */
export function cleanReviewText(text: string): string {
  return text
    .replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function wordCount(text: string): number {
  return text.length === 0 ? 0 : text.split(' ').length
}

/**
 * Which axes a review mentions. The game's own titles are removed first, so a title such as
 * "Liar's Dice" or "Strategy Hero" does not count as a mention.
 */
export function axisMentions(text: string, titles: readonly string[]): AxisRecord<boolean> {
  let lower = text.toLowerCase()
  for (const title of titles) lower = lower.split(title.toLowerCase()).join(' ')
  return {
    micro: REVIEW_LEXICON.micro.some((pattern) => pattern.test(lower)),
    meso: REVIEW_LEXICON.meso.some((pattern) => pattern.test(lower)),
    macro: REVIEW_LEXICON.macro.some((pattern) => pattern.test(lower)),
  }
}

/** Axis mentions for every review with at least MIN_REVIEW_WORDS words. */
export function usableReviewMentions(
  reviews: readonly string[],
  titles: readonly string[],
): AxisRecord<boolean>[] {
  return reviews
    .map(cleanReviewText)
    .filter((text) => wordCount(text) >= MIN_REVIEW_WORDS)
    .map((text) => axisMentions(text, titles))
}

export function mentionRate(mentions: readonly AxisRecord<boolean>[], axis: MimmaAxis): number {
  return mentions.length === 0
    ? Number.NaN
    : mentions.filter((mention) => mention[axis]).length / mentions.length
}

// ---------- tags ----------

export function tagShares(tags: readonly TagVote[]): Map<string, number> {
  const total = tags.reduce((sum, tag) => sum + tag.weight, 0)
  return new Map(tags.map((tag) => [tag.name, total > 0 ? tag.weight / total : 0]))
}

export interface TagLabeledGame {
  appid: number
  levels: AxisRecord<SurnexLevel>
  shares: ReadonlyMap<string, number>
}

export interface TagAxisMean {
  games: number
  value: AxisRecord<number>
}

/**
 * For each tag on at least MIN_TAG_SUPPORT reference games, the vote-weighted average label of
 * those games. Pass `excludeAppid` to leave one game out.
 */
export function tagAxisMeans(
  reference: readonly TagLabeledGame[],
  excludeAppid?: number,
): Map<string, TagAxisMean> {
  const sums = new Map<string, { games: number; weight: number; totals: AxisRecord<number> }>()
  for (const game of reference) {
    if (game.appid === excludeAppid) continue
    for (const [tag, share] of game.shares) {
      const entry = sums.get(tag) ?? {
        games: 0,
        weight: 0,
        totals: { micro: 0, meso: 0, macro: 0 },
      }
      entry.games += 1
      entry.weight += share
      for (const axis of AXES) entry.totals[axis] += share * LEVEL_SCORE[game.levels[axis]]
      sums.set(tag, entry)
    }
  }
  const means = new Map<string, TagAxisMean>()
  for (const [tag, entry] of sums) {
    if (entry.games < MIN_TAG_SUPPORT || entry.weight === 0) continue
    means.set(tag, {
      games: entry.games,
      value: {
        micro: entry.totals.micro / entry.weight,
        meso: entry.totals.meso / entry.weight,
        macro: entry.totals.macro / entry.weight,
      },
    })
  }
  return means
}

export interface TagPrediction {
  /** Share of the game's tag votes on tags the reference set supports. */
  coverage: number
  raw: AxisRecord<number> | null
}

export function predictFromTags(
  shares: ReadonlyMap<string, number>,
  means: ReadonlyMap<string, TagAxisMean>,
): TagPrediction {
  let coverage = 0
  const totals = { micro: 0, meso: 0, macro: 0 }
  for (const [tag, share] of shares) {
    const mean = means.get(tag)
    if (mean === undefined) continue
    coverage += share
    for (const axis of AXES) totals[axis] += share * mean.value[axis]
  }
  if (coverage === 0) return { coverage, raw: null }
  return {
    coverage,
    raw: {
      micro: totals.micro / coverage,
      meso: totals.meso / coverage,
      macro: totals.macro / coverage,
    },
  }
}

// ---------- statistics ----------

export function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/** Clamp to 0-100 and round to the rubric's steps of 10. */
export function roundToTen(value: number): number {
  return Math.round(clampScore(value) / 10) * 10
}

/** 1-based ranks, with ties sharing their average rank. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ index, value })).sort((a, b) => a.value - b.value)
  const result = new Array<number>(values.length)
  for (let start = 0; start < order.length;) {
    let end = start
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1
    for (let position = start; position <= end; position += 1) {
      result[order[position].index] = (start + end) / 2 + 1
    }
    start = end + 1
  }
  return result
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const meanX = mean(xs)
  const meanY = mean(ys)
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let index = 0; index < xs.length; index += 1) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY)
    varianceX += (xs[index] - meanX) ** 2
    varianceY += (ys[index] - meanY) ** 2
  }
  return varianceX === 0 || varianceY === 0
    ? Number.NaN
    : covariance / Math.sqrt(varianceX * varianceY)
}

/** Rank correlation: 1 means the same order, 0 no relation, -1 the reverse order. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  return pearson(ranks(xs), ranks(ys))
}

/** Share of (high, low) pairs where the high game has the larger value. Ties count half. */
export function highAboveLow(pairs: readonly { level: SurnexLevel; value: number }[]): number {
  const high = pairs.filter((pair) => pair.level === 'high').map((pair) => pair.value)
  const low = pairs.filter((pair) => pair.level === 'low').map((pair) => pair.value)
  let wins = 0
  for (const highValue of high) {
    for (const lowValue of low) wins += highValue > lowValue ? 1 : highValue === lowValue ? 0.5 : 0
  }
  return wins / (high.length * low.length)
}

export interface Line {
  intercept: number
  slope: number
}

/** Least-squares line from xs to ys. */
export function fitLine(xs: readonly number[], ys: readonly number[]): Line {
  const meanX = mean(xs)
  const meanY = mean(ys)
  let covariance = 0
  let varianceX = 0
  for (let index = 0; index < xs.length; index += 1) {
    covariance += (xs[index] - meanX) * (ys[index] - meanY)
    varianceX += (xs[index] - meanX) ** 2
  }
  const slope = varianceX === 0 ? 0 : covariance / varianceX
  return { intercept: meanY - slope * meanX, slope }
}

export function applyLine(line: Line, x: number): number {
  return clampScore(line.intercept + line.slope * x)
}

/** Deterministic random numbers in [0, 1), so bootstrap ranges are reproducible. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** The 10th and 90th percentile of the calibrated score over bootstrap resamples of the reviews. */
export function bootstrapRange(
  mentions: readonly AxisRecord<boolean>[],
  axis: MimmaAxis,
  line: Line,
  random: () => number,
  rounds = 2000,
): { low: number; high: number } {
  const samples: number[] = []
  for (let round = 0; round < rounds; round += 1) {
    let hits = 0
    for (let draw = 0; draw < mentions.length; draw += 1) {
      if (mentions[Math.floor(random() * mentions.length)][axis]) hits += 1
    }
    samples.push(applyLine(line, hits / mentions.length))
  }
  samples.sort((a, b) => a - b)
  return {
    low: roundToTen(samples[Math.floor(0.1 * rounds)]),
    high: roundToTen(samples[Math.floor(0.9 * rounds)]),
  }
}
