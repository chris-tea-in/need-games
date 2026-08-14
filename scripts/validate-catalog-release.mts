import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { CatalogRelease } from '../src/shared/catalog-contract.js'

type JsonRecord = Record<string, unknown>
type ApprovedGame = readonly [number, string, string]

const approvedGames: readonly ApprovedGame[] = [
  [730, 'counter-strike-2', 'Counter-Strike 2'],
  [1623730, 'palworld', 'Palworld'],
  [2767030, 'marvel-rivals', 'Marvel Rivals'],
  [1172470, 'apex-legends', 'Apex Legends'],
  [359550, 'tom-clancys-rainbow-six-siege', "Tom Clancy's Rainbow Six Siege"],
  [1086940, 'baldurs-gate-3', "Baldur's Gate 3"],
  [1085660, 'destiny-2', 'Destiny 2'],
  [2246340, 'monster-hunter-wilds', 'Monster Hunter Wilds'],
  [1245620, 'elden-ring', 'ELDEN RING'],
  [284160, 'beamng-drive', 'BeamNG.drive'],
]

const permittedReviewCategories = new Set([
  'Mixed',
  'Mostly Positive',
  'Very Positive',
  'Overwhelmingly Positive',
])

const forbiddenFieldNames = new Set([
  'authoritativeScore',
  'authoritativeScores',
  'raw',
  'rawPayload',
  'rawProviderResponse',
  'rawResponse',
  'reviewText',
  'score',
  'scores',
])

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function addError(errors: string[], condition: boolean, message: string): void {
  if (!condition) {
    errors.push(message)
  }
}

function findForbiddenFields(value: unknown, path = '$', errors: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenFields(entry, `${path}[${index}]`, errors))
    return errors
  }

  if (!isRecord(value)) {
    return errors
  }

  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenFieldNames.has(key)) {
      errors.push(`${path}.${key} is not permitted in a compact catalog release`)
    }
    findForbiddenFields(entry, `${path}.${key}`, errors)
  }

  return errors
}

function validateGame(game: unknown, approvedGame: ApprovedGame, errors: string[]): void {
  const [steamAppId, slug, title] = approvedGame
  const path = `games[${steamAppId}]`

  addError(errors, isRecord(game), `${path} must be an object`)
  if (!isRecord(game)) {
    return
  }

  addError(errors, game.id === `steam-${steamAppId}`, `${path}.id must be steam-${steamAppId}`)
  addError(errors, game.steamAppId === steamAppId, `${path}.steamAppId must be ${steamAppId}`)
  addError(errors, game.slug === slug, `${path}.slug must be ${slug}`)
  addError(errors, game.title === title, `${path}.title must be ${title}`)
  addError(
    errors,
    typeof game.shortDescription === 'string' && game.shortDescription.length > 0,
    `${path}.shortDescription is required`,
  )
  addError(
    errors,
    Array.isArray(game.tags) &&
      game.tags.length === 6 &&
      game.tags.every((tag: unknown) => typeof tag === 'string' && tag.length > 0),
    `${path}.tags must contain the first six visible Steam tags`,
  )

  addError(errors, isRecord(game.review), `${path}.review is required`)
  if (isRecord(game.review)) {
    addError(
      errors,
      typeof game.review.category === 'string' &&
        permittedReviewCategories.has(game.review.category),
      `${path}.review.category must satisfy the V1 main catalog admission rule`,
    )
    addError(
      errors,
      typeof game.review.count === 'number' &&
        Number.isInteger(game.review.count) &&
        game.review.count >= 1000,
      `${path}.review.count must be an integer of at least 1000`,
    )
    addError(
      errors,
      game.review.scope === 'All Reviews: English Reviews',
      `${path}.review.scope must model Steam's displayed English lifetime review scope`,
    )
  }

  addError(errors, isRecord(game.admission), `${path}.admission is required`)
  if (isRecord(game.admission)) {
    addError(
      errors,
      game.admission.criteriaVersion === 'v1-steam-catalog-2026-07-26',
      `${path}.admission.criteriaVersion is invalid`,
    )
    addError(
      errors,
      game.admission.path === 'main_catalog',
      `${path}.admission.path must be main_catalog`,
    )
  }

  addError(errors, isRecord(game.provenance), `${path}.provenance is required`)
  if (isRecord(game.provenance)) {
    addError(
      errors,
      game.provenance.officialTitle === game.steamTitle,
      `${path}.provenance.officialTitle must match steamTitle`,
    )
    addError(
      errors,
      game.provenance.appDetailsUrl ===
        `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=english&cc=us`,
      `${path}.provenance.appDetailsUrl must be the official Steam App Details URL`,
    )
    addError(
      errors,
      game.provenance.storePageUrl ===
        `https://store.steampowered.com/app/${steamAppId}/?l=english&cc=us`,
      `${path}.provenance.storePageUrl must be the official Steam Store URL`,
    )
    addError(
      errors,
      isIsoDate(game.provenance.fetchedAt),
      `${path}.provenance.fetchedAt must be an ISO timestamp`,
    )
  }

  if (steamAppId === 1172470) {
    addError(
      errors,
      game.steamTitle === 'Apex Legends™',
      `${path}.steamTitle must preserve the official Steam title`,
    )
    addError(
      errors,
      isRecord(game.titleMapping) &&
        game.titleMapping.kind === 'owner_approved_display_title' &&
        typeof game.titleMapping.explanation === 'string' &&
        game.titleMapping.explanation.length > 0,
      `${path}.titleMapping must explain the approved display-title mapping`,
    )
  } else {
    addError(errors, game.steamTitle === title, `${path}.steamTitle must match the approved title`)
    addError(
      errors,
      game.titleMapping === undefined,
      `${path}.titleMapping is only permitted for the documented Apex Legends mapping`,
    )
  }
}

export function validateCatalogRelease(release: unknown): string[] {
  const errors: string[] = []
  addError(errors, isRecord(release), 'release must be an object')
  if (!isRecord(release)) {
    return errors
  }

  addError(
    errors,
    release.datasetVersion === 'catalog-release-v1',
    'datasetVersion must be catalog-release-v1',
  )
  addError(errors, release.schemaVersion === 1, 'schemaVersion must be 1')
  addError(errors, isIsoDate(release.generatedAt), 'generatedAt must be an ISO timestamp')
  addError(errors, Array.isArray(release.games), 'games must be an array')
  if (!Array.isArray(release.games)) {
    return [...errors, ...findForbiddenFields(release)]
  }

  const games: unknown[] = release.games

  addError(
    errors,
    games.length === approvedGames.length,
    `games must contain exactly ${approvedGames.length} approved titles`,
  )
  const appIds = games.map((game: unknown) => (isRecord(game) ? game.steamAppId : undefined))
  const slugs = games.map((game: unknown) => (isRecord(game) ? game.slug : undefined))
  addError(
    errors,
    new Set(appIds).size === appIds.length,
    'games must not contain duplicate Steam App IDs',
  )
  addError(errors, new Set(slugs).size === slugs.length, 'games must not contain duplicate slugs')

  for (const approvedGame of approvedGames) {
    const game = games.find(
      (candidate: unknown) => isRecord(candidate) && candidate.steamAppId === approvedGame[0],
    )
    addError(errors, game !== undefined, `approved Steam App ID ${approvedGame[0]} is missing`)
    if (game !== undefined) {
      validateGame(game, approvedGame, errors)
    }
  }

  return [...errors, ...findForbiddenFields(release)]
}

export function assertValidCatalogRelease(release: unknown): CatalogRelease {
  const errors = validateCatalogRelease(release)
  if (errors.length > 0) {
    throw new Error(`Catalog release validation failed:\n- ${errors.join('\n- ')}`)
  }
  return release as CatalogRelease
}

function readReleaseFromDisk() {
  const releaseUrl = new URL('../data/catalog-release-v1.json', import.meta.url)
  return JSON.parse(readFileSync(releaseUrl, 'utf8')) as unknown
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertValidCatalogRelease(readReleaseFromDisk())
  process.stdout.write('Catalog release is valid.\n')
}
