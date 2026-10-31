import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type Fetcher,
  STEAM_API,
  fetchAppReviews,
  getJson,
  parseStoreItemTags,
  parseTagNames,
  storeItemTagsUrl,
  tagListUrl,
} from './community-mimma.mts'
import { type SurnexSteamApp, surnexSteamAppsPath } from './resolve-surnex-steam-apps.mts'

/**
 * Downloads the community signals for the catalog games and the surnex reference games: Steam
 * tag weights and the most helpful English reviews. Writes them to .cache/community-mimma/,
 * which git ignores. Usage:
 *
 *   node scripts/research/fetch-community-signals.mts [--reviews 300] [--refresh]
 *
 * Existing files are kept unless --refresh is given.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const communityCachePath = resolve(repositoryRoot, '.cache/community-mimma')
const catalogPath = resolve(repositoryRoot, 'data/catalog-release-v1.json')

export interface CommunityGame {
  appid: number
  group: 'catalog' | 'reference'
  name: string
}

export function readCatalogGames(source: string): { appid: number; title: string }[] {
  const parsed: unknown = JSON.parse(source)
  const games: unknown =
    typeof parsed === 'object' && parsed !== null && 'games' in parsed ? parsed.games : null
  if (!Array.isArray(games)) throw new Error('catalog release has no games array')
  return (games as unknown[]).map((game, index) => {
    const { steamAppId, title } = (game ?? {}) as Record<string, unknown>
    if (typeof steamAppId !== 'number' || typeof title !== 'string') {
      throw new Error(`catalog game ${index} has no Steam app ID or title`)
    }
    return { appid: steamAppId, title }
  })
}

export function readSurnexSteamApps(source: string): SurnexSteamApp[] {
  const parsed: unknown = JSON.parse(source)
  if (!Array.isArray(parsed)) throw new Error('surnex Steam app mapping must be an array')
  return parsed as SurnexSteamApp[]
}

/** The catalog games, then every matched surnex game that is not a catalog game. */
export function communityGames(
  catalog: readonly { appid: number; title: string }[],
  apps: readonly SurnexSteamApp[],
): CommunityGame[] {
  const catalogIds = new Set(catalog.map((game) => game.appid))
  const games: CommunityGame[] = catalog.map((game) => ({
    appid: game.appid,
    group: 'catalog',
    name: game.title,
  }))
  const seen = new Set(catalogIds)
  for (const app of apps) {
    if (app.appid === null || seen.has(app.appid)) continue
    seen.add(app.appid)
    games.push({ appid: app.appid, group: 'reference', name: app.name })
  }
  return games
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

async function main(): Promise<void> {
  const reviewsFlag = process.argv.indexOf('--reviews')
  const reviewsPerGame = reviewsFlag === -1 ? 300 : Number(process.argv[reviewsFlag + 1])
  if (!Number.isSafeInteger(reviewsPerGame) || reviewsPerGame < 1) {
    throw new Error('--reviews must be a positive integer')
  }
  const refresh = process.argv.includes('--refresh')
  const fetcher: Fetcher = (url) => fetch(url)
  const games = communityGames(
    readCatalogGames(readFileSync(catalogPath, 'utf8')),
    readSurnexSteamApps(readFileSync(surnexSteamAppsPath, 'utf8')),
  )

  const tagNames = parseTagNames(await getJson(tagListUrl(), fetcher))
  for (let start = 0; start < games.length; start += 50) {
    const batch = games.slice(start, start + 50).map((game) => game.appid)
    const tagsByApp = parseStoreItemTags(await getJson(storeItemTagsUrl(batch), fetcher), tagNames)
    for (const appid of batch) {
      const path = resolve(communityCachePath, 'tags', `${appid}.json`)
      if (refresh || !existsSync(path)) writeJson(path, tagsByApp.get(appid) ?? [])
    }
  }
  process.stdout.write(`Tags written for ${games.length} games.\n`)

  for (const [index, game] of games.entries()) {
    const path = resolve(communityCachePath, 'reviews', `${game.appid}.json`)
    if (!refresh && existsSync(path)) continue
    const reviews = await fetchAppReviews(game.appid, reviewsPerGame, fetcher)
    writeJson(path, reviews)
    process.stdout.write(`${index + 1}/${games.length} ${game.name}: ${reviews.length} reviews\n`)
  }

  writeJson(resolve(communityCachePath, 'manifest.json'), {
    fetchedAt: new Date().toISOString(),
    reviewsPerGame,
    endpoints: STEAM_API,
    games,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
