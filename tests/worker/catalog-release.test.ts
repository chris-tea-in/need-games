import release from '../../data/catalog-release-v1.json' with { type: 'json' }
import {
  CATALOG_ERROR_CODES,
  CATALOG_SCHEMA_VERSION,
  isCatalogSnapshot,
} from '../../src/shared/catalog-contract.js'
import { catalogSnapshot } from '../../src/ui/generated/catalog-snapshot.js'

import { describe, expect, test } from 'vitest'

interface CatalogReleaseValidator {
  validateCatalogRelease(release: unknown): string[]
}

type ManifestDraft = {
  games: Array<Record<string, unknown>>
}

const validatorModuleUrl = '../../scripts/validate-catalog-release.mts'
const catalogReleaseValidator = (await import(validatorModuleUrl)) as CatalogReleaseValidator

function cloneRelease(): ManifestDraft {
  return structuredClone(release)
}

const approvedGames = [
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

describe('catalog release artifacts', () => {
  test('freezes the exact ten approved game identities', () => {
    expect(release.games).toHaveLength(10)
    expect(release.games.map(({ steamAppId, slug, title }) => [steamAppId, slug, title])).toEqual(
      approvedGames,
    )
  })

  test('records compact Steam provenance and English lifetime review scope', () => {
    for (const game of release.games) {
      expect(game.review.scope).toBe('All Reviews: English Reviews')
      expect(game.provenance.appDetailsUrl).toContain(`appids=${game.steamAppId}`)
      expect(game.provenance.storePageUrl).toContain(`/app/${game.steamAppId}/`)
      expect(game.provenance.fetchedAt).toMatch(/^2026-08-14T/)
      expect(game).not.toHaveProperty('rawResponse')
      expect(game).not.toHaveProperty('authoritativeScore')
    }
  })

  test('documents the approved Apex title mapping and preserves Steam source tags', () => {
    const apex = release.games.find((game) => game.steamAppId === 1172470)
    const baldursGate = release.games.find((game) => game.steamAppId === 1086940)

    expect(apex).toMatchObject({
      steamTitle: 'Apex Legends™',
      title: 'Apex Legends',
      titleMapping: { kind: 'owner_approved_display_title' },
    })
    expect(baldursGate?.tags).toContain('Sexual Content')
  })

  test('keeps the snapshot and frozen API contract on the same release version', () => {
    expect(CATALOG_ERROR_CODES).toEqual([
      'game_not_found',
      'unscored_game',
      'invalid_query',
      'catalog_temporarily_unavailable',
    ])
    expect(release.schemaVersion).toBe(CATALOG_SCHEMA_VERSION)
    expect(catalogSnapshot).toMatchObject({
      datasetVersion: release.datasetVersion,
      schemaVersion: release.schemaVersion,
    })
    expect(catalogSnapshot.games).toHaveLength(release.games.length)
    expect(isCatalogSnapshot(catalogSnapshot)).toBe(true)
  })

  test('rejects retained raw provider responses', () => {
    const invalidRelease = cloneRelease()
    invalidRelease.games[0].rawProviderResponse = { appdetails: 'not retained' }

    expect(catalogReleaseValidator.validateCatalogRelease(invalidRelease)).not.toEqual([])
  })

  test('rejects every forbidden catalog-manifest mutation', () => {
    const mutations = [
      (invalidRelease: ManifestDraft) =>
        invalidRelease.games.push(structuredClone(invalidRelease.games[0])),
      (invalidRelease: ManifestDraft) => (invalidRelease.games[0].slug = 'wrong-slug'),
      (invalidRelease: ManifestDraft) => (invalidRelease.games[0].title = 'Wrong title'),
      (invalidRelease: ManifestDraft) => delete invalidRelease.games[0].provenance,
      (invalidRelease: ManifestDraft) => {
        ;(invalidRelease.games[0].review as Record<string, unknown>).count = 'many'
      },
      (invalidRelease: ManifestDraft) => (invalidRelease.games[0].authoritativeScore = null),
    ]

    for (const mutate of mutations) {
      const invalidRelease = cloneRelease()
      mutate(invalidRelease)
      expect(catalogReleaseValidator.validateCatalogRelease(invalidRelease)).not.toEqual([])
    }
  })
})
