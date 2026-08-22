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
    ['survey', { survey: true }],
    ['nested response', { metadata: { response: 'raw' } }],
    ['comment', { comment: 'not allowed' }],
    ['hours', { hours: 10 }],
    ['playtime', { playtime: 10 }],
    ['respondent', { respondent: 'id' }],
    ['raw payload', { rawPayload: {} }],
  ])('rejects forbidden raw-data key: %s', (_label, forbidden) => {
    const changed = structuredClone(manifest) as unknown as Record<string, unknown>
    changed.metadata = forbidden
    expect(() => validateOwnerAuthoritativeManifest(changed)).toThrow(/forbidden/i)
  })

  test('rejects duplicate identities, scores, mappings, and incorrect counts', () => {
    const duplicateIdentity = structuredClone(manifest)
    duplicateIdentity.games[1].identityKey = duplicateIdentity.games[0].identityKey
    expect(() => validateOwnerAuthoritativeManifest(duplicateIdentity)).toThrow(/duplicate/i)

    const duplicateScore = structuredClone(manifest)
    duplicateScore.games[1].score.id = duplicateScore.games[0].score.id
    expect(() => validateOwnerAuthoritativeManifest(duplicateScore)).toThrow(/duplicate/i)

    const duplicateMapping = structuredClone(manifest)
    duplicateMapping.mappings[1].id = duplicateMapping.mappings[0].id
    expect(() => validateOwnerAuthoritativeManifest(duplicateMapping)).toThrow(/duplicate/i)

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
