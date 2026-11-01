import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type AxisRecord,
  type Fetcher,
  type Sleeper,
  type SurnexLevel,
  getJson,
  isSurnexLevel,
  sleep,
} from './community-mimma.mts'

/**
 * Matches each row of data/surnex-dataset.csv to a Steam app, for the community MiMMa research.
 * Prints a summary; pass --write to update data/research/surnex-steam-apps.json.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sourcePath = resolve(repositoryRoot, 'data/surnex-dataset.csv')
export const surnexSteamAppsPath = resolve(repositoryRoot, 'data/research/surnex-steam-apps.json')

const SOURCE_HEADER = 'game,zone,micro,meso,macro,provenance'

/**
 * Rows whose name is a franchise or differs from the Steam title, mapped by hand on 2026-10-31.
 * Exact title matches win over this list.
 */
export const MANUAL_STEAM_APPS: Readonly<Record<string, number>> = {
  Battlefield: 2807960,
  'Chivalry II': 1824220,
  'Civilization VI': 289070,
  'Delta Force 2024': 2507950,
  'For Honor': 304390,
  'Getting Over It': 240720,
  'Grand Theft Auto V': 271590,
  'Monster Hunter': 2246340,
  'Mortal Kombat': 1971870,
  'Overwatch 2': 2357570,
  'Rainbow Six Siege': 359550,
  SimCity: 24780,
  'Street Fighter': 1364780,
  'Taiko no Tatsujin': 2288630,
  Tekken: 1778820,
  Tetris: 1003590,
}

export interface SurnexRow {
  name: string
  zone: string
  levels: AxisRecord<SurnexLevel>
}

export interface SurnexSteamApp extends SurnexRow {
  appid: number | null
  steamName: string | null
  match: 'exact' | 'manual' | 'none'
}

export function parseSurnexCsv(source: string): SurnexRow[] {
  const lines = source.replace(/\r\n?/g, '\n').trim().split('\n')
  if (lines[0] !== SOURCE_HEADER) {
    throw new Error(`surnex header must be ${SOURCE_HEADER}`)
  }
  return lines.slice(1).map((line, index) => {
    const [name, zone, micro, meso, macro] = line.split(',')
    if (!isSurnexLevel(micro) || !isSurnexLevel(meso) || !isSurnexLevel(macro)) {
      throw new Error(`surnex line ${index + 2} has an unknown level`)
    }
    return { name, zone, levels: { micro, meso, macro } }
  })
}

/**
 * Lowercase title without marks, punctuation, or trademark signs. The signs go first, because
 * Unicode compatibility normalization would turn "™" into the letters "TM".
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u2019'`:]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function storeSearchUrl(term: string): string {
  return `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`
}

export function parseStoreSearch(body: unknown): { id: number; name: string }[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body) ||
    !Array.isArray(body.items)
  ) {
    return []
  }
  return (body.items as unknown[]).flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const { id, name, type } = item as Record<string, unknown>
    return type === 'app' && typeof id === 'number' && typeof name === 'string'
      ? [{ id, name }]
      : []
  })
}

export async function resolveSurnexRows(
  rows: readonly SurnexRow[],
  fetcher: Fetcher,
  wait: Sleeper = sleep,
): Promise<SurnexSteamApp[]> {
  const resolved: SurnexSteamApp[] = []
  for (const row of rows) {
    const results = parseStoreSearch(await getJson(storeSearchUrl(row.name), fetcher, wait))
    const exact = results.find((result) => normalizeTitle(result.name) === normalizeTitle(row.name))
    const manualId = MANUAL_STEAM_APPS[row.name] as number | undefined
    if (exact !== undefined) {
      resolved.push({ ...row, appid: exact.id, steamName: exact.name, match: 'exact' })
    } else if (manualId !== undefined) {
      const named = results.find((result) => result.id === manualId)
      resolved.push({ ...row, appid: manualId, steamName: named?.name ?? null, match: 'manual' })
    } else {
      resolved.push({ ...row, appid: null, steamName: null, match: 'none' })
    }
    await wait(350)
  }
  return resolved
}

async function main(): Promise<void> {
  const rows = parseSurnexCsv(readFileSync(sourcePath, 'utf8'))
  const apps = await resolveSurnexRows(rows, (url) => fetch(url))
  const count = (match: SurnexSteamApp['match']) => apps.filter((app) => app.match === match).length
  process.stdout.write(
    `${count('exact')} exact, ${count('manual')} manual, ${count('none')} unmatched of ${apps.length} rows.\n`,
  )
  if (process.argv.includes('--write')) {
    mkdirSync(dirname(surnexSteamAppsPath), { recursive: true })
    writeFileSync(surnexSteamAppsPath, `${JSON.stringify(apps, null, 2)}\n`)
    process.stdout.write(`Wrote ${surnexSteamAppsPath}.\n`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
