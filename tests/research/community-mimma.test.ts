import { describe, expect, test } from 'vitest'

import {
  type Fetcher,
  type TagLabeledGame,
  appReviewsUrl,
  axisMentions,
  bootstrapRange,
  cleanReviewText,
  createRandom,
  fetchAppReviews,
  fitLine,
  getJson,
  highAboveLow,
  mentionRate,
  parseAppReviewsPage,
  parseStoreItemTags,
  parseTagNames,
  predictFromTags,
  ranks,
  roundToTen,
  spearman,
  storeItemTagsUrl,
  tagAxisMeans,
  tagShares,
  usableReviewMentions,
  wordCount,
} from '../../scripts/research/community-mimma.mts'

const noWait = () => Promise.resolve()

function inputJson(url: string): unknown {
  return JSON.parse(new URL(url).searchParams.get('input_json') ?? 'null')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function reviewPage(ids: string[], cursor: string | null) {
  return {
    response: {
      cursor,
      reviews: ids.map((id) => ({
        recommendationid: id,
        review: `review ${id}`,
        voted_up: true,
        votes_up: 3,
      })),
      total_matching: 99,
    },
  }
}

describe('Steam API requests', () => {
  test('asks GetAppReviews for the most helpful English reviews of all time', () => {
    const url = appReviewsUrl(730, 'AoJ+/x==', 100)

    expect(
      url.startsWith('https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?'),
    ).toBe(true)
    expect(inputJson(url)).toEqual({
      appid: 730,
      cursor: 'AoJ+/x==',
      day_range: 0,
      filter: 0,
      languages: ['english'],
      num_per_page: 100,
      purchase_type: 1,
      review_type: 0,
    })
  })

  test('asks GetItems for tag weights of several apps at once', () => {
    expect(inputJson(storeItemTagsUrl([730, 570], 20))).toEqual({
      context: { country_code: 'US', language: 'english' },
      data_request: { include_tag_count: 20 },
      ids: [{ appid: 730 }, { appid: 570 }],
    })
  })
})

describe('Steam API responses', () => {
  test('reads reviews and the next cursor, skipping malformed entries', () => {
    const page = parseAppReviewsPage({
      response: {
        cursor: 'next',
        reviews: [
          { recommendationid: '1', review: 'Great aim duels', voted_up: true, votes_up: 12 },
          { recommendationid: 2, review: 'Numeric id', voted_up: false },
          { recommendationid: '3' },
          'not a review',
        ],
        total_matching: 2,
      },
    })

    expect(page).toEqual({
      cursor: 'next',
      reviews: [
        { id: '1', text: 'Great aim duels', votedUp: true, votesUp: 12 },
        { id: '2', text: 'Numeric id', votedUp: false, votesUp: 0 },
      ],
      totalMatching: 2,
    })
    expect(() => parseAppReviewsPage({ success: 1 })).toThrow('no response object')
  })

  test('names tag weights and drops tags missing from the tag list', () => {
    const names = parseTagNames({
      response: {
        tags: [
          { name: 'FPS', tagid: 1663 },
          { name: 'Tactical', tagid: 1708 },
        ],
      },
    })
    const tags = parseStoreItemTags(
      {
        response: {
          store_items: [
            {
              appid: 730,
              tags: [
                { tagid: 1663, weight: 900 },
                { tagid: 1708, weight: 400 },
                { tagid: 99, weight: 50 },
              ],
            },
          ],
        },
      },
      names,
    )

    expect(tags.get(730)).toEqual([
      { name: 'FPS', weight: 900 },
      { name: 'Tactical', weight: 400 },
    ])
    expect(() => parseTagNames({ response: {} })).toThrow('no tag list')
  })
})

describe('Steam API fetching', () => {
  test('retries rate limits and server errors, then returns the body', async () => {
    const statuses = [429, 503, 200]
    const waits: number[] = []
    const fetcher: Fetcher = () => {
      const status = statuses.shift() ?? 200
      return Promise.resolve(jsonResponse({ ok: status === 200 }, status))
    }

    await expect(
      getJson('https://example.test', fetcher, (ms) => {
        waits.push(ms)
        return Promise.resolve()
      }),
    ).resolves.toEqual({ ok: true })
    expect(waits).toEqual([2000, 4000])
  })

  test('fails at once on a client error and after the last retry', async () => {
    await expect(
      getJson('https://example.test', () => Promise.resolve(jsonResponse({}, 404)), noWait),
    ).rejects.toThrow('HTTP 404')
    await expect(
      getJson('https://example.test', () => Promise.resolve(jsonResponse({}, 429)), noWait, 2),
    ).rejects.toThrow('after 2 attempts')
  })

  test('pages by cursor, removes duplicates, and stops at the count', async () => {
    const pages = [
      reviewPage(['a', 'b'], 'c1'),
      reviewPage(['b', 'c'], 'c2'),
      reviewPage(['d', 'e'], 'c3'),
    ]
    const cursors: unknown[] = []
    const fetcher: Fetcher = (url) => {
      cursors.push((inputJson(url) as { cursor: string }).cursor)
      return Promise.resolve(jsonResponse(pages.shift() ?? reviewPage([], null)))
    }

    const reviews = await fetchAppReviews(730, 4, fetcher, noWait)

    expect(reviews.map((review) => review.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(cursors).toEqual(['*', 'c1', 'c2'])
  })

  test('stops when the cursor repeats or a page is empty', async () => {
    const repeating: Fetcher = () => Promise.resolve(jsonResponse(reviewPage(['a'], '*')))
    const empty: Fetcher = () => Promise.resolve(jsonResponse(reviewPage([], 'next')))

    await expect(fetchAppReviews(730, 50, repeating, noWait)).resolves.toHaveLength(1)
    await expect(fetchAppReviews(730, 50, empty, noWait)).resolves.toEqual([])
  })
})

describe('review text', () => {
  test('removes BBCode and collapses whitespace', () => {
    expect(
      cleanReviewText('[h1]Verdict[/h1]\n[b]Great[/b] [url=https://x.test]link[/url] [*]x'),
    ).toBe('Verdict Great link x')
    expect(wordCount('')).toBe(0)
    expect(wordCount('one two three')).toBe(3)
  })

  test('finds axis terms as whole words and ignores look-alikes', () => {
    expect(axisMentions('Recoil control and long-term planning', [])).toEqual({
      macro: true,
      meso: false,
      micro: true,
    })
    expect(axisMentions('I guess the optimization is bad and the aimbot ruins it', [])).toEqual({
      macro: false,
      meso: false,
      micro: false,
    })
    expect(axisMentions('Bluffing and reading the enemy with RNG', []).meso).toBe(true)
  })

  test('does not count words from the game title', () => {
    expect(axisMentions('Strategy Hero is fun', ['Strategy Hero']).macro).toBe(false)
    expect(axisMentions('Strategy Hero has real strategy', ['Strategy Hero']).macro).toBe(true)
  })

  test('uses only reviews with at least 20 words', () => {
    const long = `${'word '.repeat(19)}strategy`
    const mentions = usableReviewMentions(['strategy', long, `[b]${long}[/b]`], [])

    expect(mentions).toHaveLength(2)
    expect(mentionRate(mentions, 'macro')).toBe(1)
    expect(mentionRate([], 'macro')).toBeNaN()
  })
})

describe('tag model', () => {
  const game = (
    appid: number,
    level: 'high' | 'low',
    tags: [string, number][],
  ): TagLabeledGame => ({
    appid,
    levels: { macro: level, meso: 'low', micro: level === 'high' ? 'low' : 'high' },
    shares: tagShares(tags.map(([name, weight]) => ({ name, weight }))),
  })
  const reference = [
    game(1, 'high', [
      ['Strategy', 3],
      ['Multiplayer', 1],
    ]),
    game(2, 'high', [
      ['Strategy', 1],
      ['Multiplayer', 1],
    ]),
    game(3, 'high', [['Strategy', 1]]),
    game(4, 'low', [
      ['Rhythm', 1],
      ['Multiplayer', 1],
    ]),
  ]

  test('turns tag weights into vote shares', () => {
    expect([
      ...tagShares([
        { name: 'A', weight: 3 },
        { name: 'B', weight: 1 },
      ]),
    ]).toEqual([
      ['A', 0.75],
      ['B', 0.25],
    ])
  })

  test('averages labels per tag, weighted by share, on tags with enough games', () => {
    const means = tagAxisMeans(reference)

    expect(means.get('Strategy')).toEqual({ games: 3, value: { macro: 80, meso: 20, micro: 20 } })
    expect(means.get('Multiplayer')?.value.macro).toBeCloseTo(
      (0.25 * 80 + 0.5 * 80 + 0.5 * 20) / 1.25,
    )
    expect(means.has('Rhythm')).toBe(false)
  })

  test('leaves one game out on request', () => {
    expect(tagAxisMeans(reference, 3).has('Strategy')).toBe(false)
  })

  test('predicts from supported tags and reports their share as coverage', () => {
    const means = tagAxisMeans(reference)
    const prediction = predictFromTags(
      tagShares([
        { name: 'Strategy', weight: 1 },
        { name: 'Unknown', weight: 1 },
      ]),
      means,
    )

    expect(prediction.coverage).toBe(0.5)
    expect(prediction.raw).toEqual({ macro: 80, meso: 20, micro: 20 })
    expect(predictFromTags(tagShares([{ name: 'Unknown', weight: 1 }]), means)).toEqual({
      coverage: 0,
      raw: null,
    })
  })
})

describe('statistics', () => {
  test('ranks ties by their average rank', () => {
    expect(ranks([10, 30, 10, 20])).toEqual([1.5, 4, 1.5, 3])
  })

  test('measures rank correlation', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1)
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNaN()
  })

  test('counts how often high games beat low games, ties as half', () => {
    expect(
      highAboveLow([
        { level: 'high', value: 3 },
        { level: 'high', value: 1 },
        { level: 'low', value: 1 },
        { level: 'med', value: 9 },
      ]),
    ).toBe(0.75)
  })

  test('fits a least-squares line and clamps rounded scores to 0-100', () => {
    expect(fitLine([0, 1, 2], [20, 50, 80])).toEqual({ intercept: 20, slope: 30 })
    expect(fitLine([1, 1], [5, 9])).toEqual({ intercept: 7, slope: 0 })
    expect(roundToTen(84.9)).toBe(80)
    expect(roundToTen(-12)).toBe(0)
    expect(roundToTen(123)).toBe(100)
  })

  test('draws the same random numbers for the same seed', () => {
    const first = createRandom(7)
    const second = createRandom(7)
    const values = [first(), first(), first()]

    expect([second(), second(), second()]).toEqual(values)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  test('brackets the calibrated score with a bootstrap range', () => {
    const mentions = Array.from({ length: 40 }, (_, index) => ({
      macro: index % 2 === 0,
      meso: false,
      micro: true,
    }))
    const line = { intercept: 0, slope: 100 }

    expect(bootstrapRange(mentions, 'micro', line, createRandom(1), 200)).toEqual({
      high: 100,
      low: 100,
    })
    const range = bootstrapRange(mentions, 'macro', line, createRandom(1), 500)
    expect(range.low).toBeLessThanOrEqual(50)
    expect(range.high).toBeGreaterThanOrEqual(50)
  })
})
