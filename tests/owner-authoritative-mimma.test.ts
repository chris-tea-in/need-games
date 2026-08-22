import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
  assertOwnerAuthoritativeManifestIdentity,
  hashOwnerAuthoritativeManifest,
  parseDecimalTenths,
  renderOwnerAuthoritativeMimmaSql,
  roundDecimalHalfUp,
  validateOwnerAuthoritativeManifest,
} from '../scripts/generate-owner-authoritative-mimma.mjs'

import type { OwnerAuthoritativeManifestV1 } from '../scripts/generate-owner-authoritative-mimma.mjs'

const manifestPath = new URL(
  '../data/authoritative-records/owner-authoritative-mimma-v1.json',
  import.meta.url,
)
const manifestSource = readFileSync(manifestPath, 'utf8')
const manifest = JSON.parse(manifestSource) as OwnerAuthoritativeManifestV1

const expectedGames = [
  ['auth-game-counter-strike-2', 'Counter-Strike 2', '100.0', '65.0', '80.0', 100, 65, 80],
  ['auth-game-palworld', 'Palworld', '40.0', '20.0', '70.0', 40, 20, 70],
  ['auth-game-marvel-rivals', 'Marvel Rivals', '80.0', '60.0', '80.0', 80, 60, 80],
  ['auth-game-apex-legends', 'Apex Legends', '80.0', '80.0', '100.0', 80, 80, 100],
  [
    'auth-game-rainbow-six-siege',
    "Tom Clancy's Rainbow Six Siege",
    '80.0',
    '60.0',
    '80.0',
    80,
    60,
    80,
  ],
  ['auth-game-baldurs-gate-3', "Baldur's Gate 3", '20.0', '20.0', '100.0', 20, 20, 100],
  ['auth-game-monster-hunter-wilds', 'Monster Hunter Wilds', '80.0', '40.0', '60.0', 80, 40, 60],
  ['auth-game-elden-ring', 'ELDEN RING', '80.0', '100.0', '40.0', 80, 100, 40],
  ['auth-game-league-of-legends', 'League of Legends', '68.6', '77.1', '100.0', 69, 77, 100],
  ['auth-game-valorant', 'Valorant', '100.0', '73.3', '80.0', 100, 73, 80],
] as const

const expectedMappings = [
  ['auth-game-counter-strike-2', '730', 'steam-730'],
  ['auth-game-palworld', '1623730', 'steam-1623730'],
  ['auth-game-marvel-rivals', '2767030', 'steam-2767030'],
  ['auth-game-apex-legends', '1172470', 'steam-1172470'],
  ['auth-game-rainbow-six-siege', '359550', 'steam-359550'],
  ['auth-game-baldurs-gate-3', '1086940', 'steam-1086940'],
  ['auth-game-monster-hunter-wilds', '2246340', 'steam-2246340'],
  ['auth-game-elden-ring', '1245620', 'steam-1245620'],
] as const

const expectedFullGames = [
  {
    id: 'auth-game-counter-strike-2',
    identityKey: 'counter-strike-2',
    canonicalTitle: 'Counter-Strike 2',
    score: {
      id: 'auth-score-counter-strike-2-v1',
      version: 1,
      microOriginal: '100.0',
      mesoOriginal: '65.0',
      macroOriginal: '80.0',
      micro: 100,
      meso: 65,
      macro: 80,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-palworld',
    identityKey: 'palworld',
    canonicalTitle: 'Palworld',
    score: {
      id: 'auth-score-palworld-v1',
      version: 1,
      microOriginal: '40.0',
      mesoOriginal: '20.0',
      macroOriginal: '70.0',
      micro: 40,
      meso: 20,
      macro: 70,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-marvel-rivals',
    identityKey: 'marvel-rivals',
    canonicalTitle: 'Marvel Rivals',
    score: {
      id: 'auth-score-marvel-rivals-v1',
      version: 1,
      microOriginal: '80.0',
      mesoOriginal: '60.0',
      macroOriginal: '80.0',
      micro: 80,
      meso: 60,
      macro: 80,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-apex-legends',
    identityKey: 'apex-legends',
    canonicalTitle: 'Apex Legends',
    score: {
      id: 'auth-score-apex-legends-v1',
      version: 1,
      microOriginal: '80.0',
      mesoOriginal: '80.0',
      macroOriginal: '100.0',
      micro: 80,
      meso: 80,
      macro: 100,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-rainbow-six-siege',
    identityKey: 'rainbow-six-siege',
    canonicalTitle: "Tom Clancy's Rainbow Six Siege",
    score: {
      id: 'auth-score-rainbow-six-siege-v1',
      version: 1,
      microOriginal: '80.0',
      mesoOriginal: '60.0',
      macroOriginal: '80.0',
      micro: 80,
      meso: 60,
      macro: 80,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-baldurs-gate-3',
    identityKey: 'baldurs-gate-3',
    canonicalTitle: "Baldur's Gate 3",
    score: {
      id: 'auth-score-baldurs-gate-3-v1',
      version: 1,
      microOriginal: '20.0',
      mesoOriginal: '20.0',
      macroOriginal: '100.0',
      micro: 20,
      meso: 20,
      macro: 100,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-monster-hunter-wilds',
    identityKey: 'monster-hunter-wilds',
    canonicalTitle: 'Monster Hunter Wilds',
    score: {
      id: 'auth-score-monster-hunter-wilds-v1',
      version: 1,
      microOriginal: '80.0',
      mesoOriginal: '40.0',
      macroOriginal: '60.0',
      micro: 80,
      meso: 40,
      macro: 60,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-elden-ring',
    identityKey: 'elden-ring',
    canonicalTitle: 'ELDEN RING',
    score: {
      id: 'auth-score-elden-ring-v1',
      version: 1,
      microOriginal: '80.0',
      mesoOriginal: '100.0',
      macroOriginal: '40.0',
      micro: 80,
      meso: 100,
      macro: 40,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-league-of-legends',
    identityKey: 'league-of-legends',
    canonicalTitle: 'League of Legends',
    score: {
      id: 'auth-score-league-of-legends-v1',
      version: 1,
      microOriginal: '68.6',
      mesoOriginal: '77.1',
      macroOriginal: '100.0',
      micro: 69,
      meso: 77,
      macro: 100,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
  {
    id: 'auth-game-valorant',
    identityKey: 'valorant',
    canonicalTitle: 'Valorant',
    score: {
      id: 'auth-score-valorant-v1',
      version: 1,
      microOriginal: '100.0',
      mesoOriginal: '73.3',
      macroOriginal: '80.0',
      micro: 100,
      meso: 73,
      macro: 80,
      approvalReason: 'initial-owner-snapshot',
      approvedOn: '2026-08-21',
    },
  },
] as const

const expectedFullMappings = [
  {
    id: 'auth-map-steam-counter-strike-2-v1',
    authoritativeGameId: 'auth-game-counter-strike-2',
    provider: 'steam',
    externalId: '730',
    catalogGameId: 'steam-730',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-palworld-v1',
    authoritativeGameId: 'auth-game-palworld',
    provider: 'steam',
    externalId: '1623730',
    catalogGameId: 'steam-1623730',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-marvel-rivals-v1',
    authoritativeGameId: 'auth-game-marvel-rivals',
    provider: 'steam',
    externalId: '2767030',
    catalogGameId: 'steam-2767030',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-apex-legends-v1',
    authoritativeGameId: 'auth-game-apex-legends',
    provider: 'steam',
    externalId: '1172470',
    catalogGameId: 'steam-1172470',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-rainbow-six-siege-v1',
    authoritativeGameId: 'auth-game-rainbow-six-siege',
    provider: 'steam',
    externalId: '359550',
    catalogGameId: 'steam-359550',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-baldurs-gate-3-v1',
    authoritativeGameId: 'auth-game-baldurs-gate-3',
    provider: 'steam',
    externalId: '1086940',
    catalogGameId: 'steam-1086940',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-monster-hunter-wilds-v1',
    authoritativeGameId: 'auth-game-monster-hunter-wilds',
    provider: 'steam',
    externalId: '2246340',
    catalogGameId: 'steam-2246340',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
  {
    id: 'auth-map-steam-elden-ring-v1',
    authoritativeGameId: 'auth-game-elden-ring',
    provider: 'steam',
    externalId: '1245620',
    catalogGameId: 'steam-1245620',
    version: 1,
    decision: 'verified',
    verificationRef: 'owner-approved-manifest-v1',
    decidedOn: '2026-08-21',
  },
] as const

describe('owner-authoritative MiMMa V1 manifest', () => {
  test('contains the exact ten approved rows, vectors, and source decimals', () => {
    expect(manifest.games).toHaveLength(10)
    expect(
      manifest.games.map(({ id, canonicalTitle, score }) => [
        id,
        canonicalTitle,
        score.microOriginal,
        score.mesoOriginal,
        score.macroOriginal,
        score.micro,
        score.meso,
        score.macro,
      ]),
    ).toEqual(expectedGames)
  })

  test('projects every game and score field against independent literal expectations', () => {
    expect(manifest.games).toEqual(expectedFullGames)
  })

  test('contains eight verified mappings and leaves League of Legends and Valorant unmapped', () => {
    expect(manifest.mappings).toHaveLength(8)
    expect(
      manifest.mappings.map(({ authoritativeGameId, externalId, catalogGameId }) => [
        authoritativeGameId,
        externalId,
        catalogGameId,
      ]),
    ).toEqual(expectedMappings)
    expect(
      manifest.games
        .filter(
          ({ id }) => !manifest.mappings.some((mapping) => mapping.authoritativeGameId === id),
        )
        .map(({ id }) => id),
    ).toEqual(['auth-game-league-of-legends', 'auth-game-valorant'])
  })

  test('projects every mapping field against independent literal expectations', () => {
    expect(manifest.mappings).toEqual(expectedFullMappings)
  })

  test('validates the exact V1 contract and locks the byte identity', () => {
    expect(() => validateOwnerAuthoritativeManifest(manifest)).not.toThrow()
    expect(hashOwnerAuthoritativeManifest(manifestSource)).toBe(
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
    )
    expect(() => assertOwnerAuthoritativeManifestIdentity(manifestSource)).not.toThrow()
    expect(createHash('sha256').update(manifestSource, 'utf8').digest('hex')).toBe(
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
    )
  })

  test.each([
    ['68.4', 684, 68],
    ['68.5', 685, 69],
    ['68.6', 686, 69],
    ['77.1', 771, 77],
    ['73.3', 733, 73],
  ])('rounds canonical decimal %s with integer arithmetic', (source, tenths, rounded) => {
    expect(parseDecimalTenths(source)).toBe(tenths)
    expect(roundDecimalHalfUp(source)).toBe(rounded)
  })

  test.each(['68', '68.50', '+68.5', '-1.0', '1e1', ' 68.5', '68.5 ', '100.1', ''])(
    'rejects non-canonical decimal %s',
    (source) => {
      expect(() => parseDecimalTenths(source)).toThrow()
    },
  )

  test.each([
    ['line ending drift', manifestSource.replaceAll('\n', '\r\n')],
    ['BOM drift', `\uFEFF${manifestSource}`],
    ['missing final newline', manifestSource.replace(/\n$/, '')],
    [
      'field-order drift',
      manifestSource.replace(
        '"schemaVersion": 1,\n  "manifestVersion"',
        '"manifestVersion": "owner-authoritative-mimma-v1",\n  "schemaVersion"',
      ),
    ],
    ['semantic drift', manifestSource.replace('"micro": 100', '"micro": 99')],
  ])('rejects %s in the immutable source', (_label, changedSource) => {
    expect(() => assertOwnerAuthoritativeManifestIdentity(changedSource)).toThrow(
      /identity mismatch|format drift|hash/i,
    )
  })

  test.each([
    ['SuRvEy', { SuRvEy: true }],
    ['ReSpOnSe', { metadata: { ReSpOnSe: 'raw' } }],
    ['AnSwEr', { metadata: { details: { AnSwEr: 'raw' } } }],
    ['CoMmEnT', { CoMmEnT: 'not allowed' }],
    ['ReViEwTeXt', { metadata: { ReViEwTeXt: 'not allowed' } }],
    ['HoUrS', { HoUrS: 10 }],
    ['PlAyTiMe', { PlAyTiMe: 10 }],
    ['ReSpOnDeNt', { ReSpOnDeNt: 'id' }],
    ['RaWPaYlOaD', { RaWPaYlOaD: {} }],
  ])('rejects nested or mixed-case forbidden raw-data key: %s', (_label, forbidden) => {
    const changed = structuredClone(manifest) as unknown as Record<string, unknown>
    changed.metadata = forbidden
    expect(() => validateOwnerAuthoritativeManifest(changed)).toThrow(/forbidden/i)
  })

  test('rejects duplicate identities, scores, mappings, and incorrect counts', () => {
    const duplicateGame = structuredClone(manifest)
    duplicateGame.games[1].id = duplicateGame.games[0].id
    expect(() => validateOwnerAuthoritativeManifest(duplicateGame)).toThrow(/duplicate game id/i)

    const duplicateIdentity = structuredClone(manifest)
    duplicateIdentity.games[1].identityKey = duplicateIdentity.games[0].identityKey
    expect(() => validateOwnerAuthoritativeManifest(duplicateIdentity)).toThrow(/duplicate/i)

    const duplicateScore = structuredClone(manifest)
    duplicateScore.games[1].score.id = duplicateScore.games[0].score.id
    expect(() => validateOwnerAuthoritativeManifest(duplicateScore)).toThrow(/duplicate/i)

    const duplicateMapping = structuredClone(manifest)
    duplicateMapping.mappings[1].id = duplicateMapping.mappings[0].id
    expect(() => validateOwnerAuthoritativeManifest(duplicateMapping)).toThrow(/duplicate/i)

    const duplicateTitle = structuredClone(manifest)
    duplicateTitle.games[1].canonicalTitle = duplicateTitle.games[0].canonicalTitle.toUpperCase()
    expect(() => validateOwnerAuthoritativeManifest(duplicateTitle)).toThrow(
      /duplicate canonical title/i,
    )

    const duplicateExternalId = structuredClone(manifest)
    duplicateExternalId.mappings[1].externalId = duplicateExternalId.mappings[0].externalId
    expect(() => validateOwnerAuthoritativeManifest(duplicateExternalId)).toThrow(
      /duplicate Steam external id/i,
    )

    const duplicateCatalogId = structuredClone(manifest)
    duplicateCatalogId.mappings[1].catalogGameId = duplicateCatalogId.mappings[0].catalogGameId
    expect(() => validateOwnerAuthoritativeManifest(duplicateCatalogId)).toThrow(
      /duplicate catalog game id/i,
    )

    const wrongCount = structuredClone(manifest)
    wrongCount.games.pop()
    expect(() => validateOwnerAuthoritativeManifest(wrongCount)).toThrow(/exactly ten games/i)
  })

  test('rejects stored decimal mismatches and invalid score vectors', () => {
    const mismatch = structuredClone(manifest)
    mismatch.games[8].score.meso = 78
    expect(() => validateOwnerAuthoritativeManifest(mismatch)).toThrow(/rounding|mismatch/i)

    const allZero = structuredClone(manifest)
    allZero.games[0].score.micro = 0
    allZero.games[0].score.meso = 0
    allZero.games[0].score.macro = 0
    expect(() => validateOwnerAuthoritativeManifest(allZero)).toThrow(/zero/i)

    const allHundred = structuredClone(manifest)
    allHundred.games[0].score.micro = 100
    allHundred.games[0].score.meso = 100
    allHundred.games[0].score.macro = 100
    expect(() => validateOwnerAuthoritativeManifest(allHundred)).toThrow(/100|vector/i)
  })

  test('validator rejects stored floats even when the source decimal is otherwise valid', () => {
    const storedFloat = structuredClone(manifest)
    storedFloat.games[8].score.micro = 68.5
    expect(() => validateOwnerAuthoritativeManifest(storedFloat)).toThrow(/integer/i)
  })

  test.each([
    ['microOriginal', '68.50'],
    ['mesoOriginal', '+77.1'],
    ['macroOriginal', '1e1'],
  ] as const)('validator rejects malformed %s values', (field, value) => {
    const malformed = structuredClone(manifest)
    malformed.games[8].score[field] = value
    expect(() => validateOwnerAuthoritativeManifest(malformed)).toThrow()
  })

  test('rejects a valid JSON source whose root field order changed', () => {
    const reordered = {
      manifestVersion: manifest.manifestVersion,
      schemaVersion: manifest.schemaVersion,
      snapshot: manifest.snapshot,
      rounding: manifest.rounding,
      games: manifest.games,
      mappings: manifest.mappings,
    }
    const reorderedSource = `${JSON.stringify(reordered, null, 2)}\n`
    expect(JSON.parse(reorderedSource)).toEqual(manifest)
    expect(() => assertOwnerAuthoritativeManifestIdentity(reorderedSource)).toThrow(
      /identity mismatch/i,
    )
  })

  test('renders deterministic SQL from validated data without reading files or D1', () => {
    const sql = renderOwnerAuthoritativeMimmaSql(manifest)
    expect(sql).toContain('auth-game-counter-strike-2')
    expect(sql).toContain('auth-score-counter-strike-2-v1')
    expect(sql).toContain('auth-map-steam-counter-strike-2-v1')
    expect(sql).toContain('snapshot-owner-authoritative-mimma-v1')
    expect(sql.match(/INSERT INTO authoritative_games/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_mimma_score_versions/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_game_mappings/g)).toHaveLength(8)
    expect(sql).not.toContain('survey')
    expect(sql).not.toContain('comment')
    expect(sql).toMatch(/\n$/)
  })
})
