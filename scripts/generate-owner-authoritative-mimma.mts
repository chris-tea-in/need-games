import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256 =
  'da26d8f94ebbc932bc6cb7ea70591a19ab316e028f8bc013dcb0fbb8356a9a65'

const APPROVED_ON = '2026-08-21'
const MANIFEST_VERSION = 'owner-authoritative-mimma-v1'
const SNAPSHOT_ID = 'snapshot-owner-authoritative-mimma-v1'
const ROUNDING_MODE = 'half-up-to-integer-v1'
const VERIFICATION_REF = 'owner-approved-manifest-v1'

export interface OwnerAuthoritativeScoreV1 {
  id: string
  version: number
  microOriginal: string
  mesoOriginal: string
  macroOriginal: string
  micro: number
  meso: number
  macro: number
  approvalReason: 'initial-owner-snapshot'
  approvedOn: '2026-08-21'
}

export interface OwnerAuthoritativeGameV1 {
  id: string
  identityKey: string
  canonicalTitle: string
  score: OwnerAuthoritativeScoreV1
}

export interface OwnerAuthoritativeMappingV1 {
  id: string
  authoritativeGameId: string
  provider: 'steam'
  externalId: string
  catalogGameId: string
  version: number
  decision: 'verified'
  verificationRef: 'owner-approved-manifest-v1'
  decidedOn: '2026-08-21'
}

export interface OwnerAuthoritativeManifestV1 {
  schemaVersion: 1
  manifestVersion: 'owner-authoritative-mimma-v1'
  snapshot: {
    id: 'snapshot-owner-authoritative-mimma-v1'
    version: 1
    approvedOn: '2026-08-21'
  }
  rounding: {
    decimalScale: 1
    mode: 'half-up-to-integer-v1'
  }
  games: OwnerAuthoritativeGameV1[]
  mappings: OwnerAuthoritativeMappingV1[]
}

const EXPECTED_GAMES = [
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

const EXPECTED_MAPPINGS = [
  ['auth-game-counter-strike-2', '730', 'steam-730'],
  ['auth-game-palworld', '1623730', 'steam-1623730'],
  ['auth-game-marvel-rivals', '2767030', 'steam-2767030'],
  ['auth-game-apex-legends', '1172470', 'steam-1172470'],
  ['auth-game-rainbow-six-siege', '359550', 'steam-359550'],
  ['auth-game-baldurs-gate-3', '1086940', 'steam-1086940'],
  ['auth-game-monster-hunter-wilds', '2246340', 'steam-2246340'],
  ['auth-game-elden-ring', '1245620', 'steam-1245620'],
] as const

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(
  repositoryRoot,
  'data/authoritative-records/owner-authoritative-mimma-v1.json',
)
const catalogPath = resolve(repositoryRoot, 'data/catalog-release-v1.json')
const migrationPath = resolve(repositoryRoot, 'migrations/0005_owner_authoritative_mimma_v1.sql')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be an object`)
}

function assertKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const actual = Object.keys(value)
  const unexpected = actual.filter((key) => !expected.includes(key))
  const missing = expected.filter((key) => !actual.includes(key))
  if (unexpected.length > 0) throw new Error(`${name} has unexpected key: ${unexpected[0]}`)
  if (missing.length > 0) throw new Error(`${name} is missing key: ${missing[0]}`)
  if (actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${name} keys are out of order`)
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
}

function assertInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`)
  }
}

function assertExactString(value: unknown, expected: string, name: string): void {
  assertString(value, name)
  if (value !== expected) throw new Error(`${name} must be ${expected}`)
}

function assertUnique(values: readonly string[], name: string, caseInsensitive = false): void {
  const seen = new Set<string>()
  for (const value of values) {
    const key = caseInsensitive ? value.toLocaleLowerCase('en-US') : value
    if (seen.has(key)) throw new Error(`duplicate ${name}: ${value}`)
    seen.add(key)
  }
}

function assertNoForbiddenKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`))
    return
  }
  if (!isRecord(value)) return

  const forbidden = new Set([
    'survey',
    'response',
    'answer',
    'comment',
    'reviewtext',
    'hours',
    'playtime',
    'respondent',
    'rawpayload',
  ])
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) {
      throw new Error(`forbidden raw-data key ${path}.${key}`)
    }
    assertNoForbiddenKeys(child, `${path}.${key}`)
  }
}

const DECIMAL_PATTERN = /^(?:0|[1-9]\d?|100)\.\d$/

/** Parse one-decimal canonical source text as integer tenths without floating point. */
export function parseDecimalTenths(value: string): number {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`invalid canonical decimal: ${JSON.stringify(value)}`)
  }
  const [whole, fraction] = value.split('.')
  const tenths = Number(whole) * 10 + Number(fraction)
  if (tenths > 1000) throw new Error(`decimal must be between 0.0 and 100.0: ${value}`)
  return tenths
}

export function roundDecimalHalfUp(value: string): number {
  return Math.floor((parseDecimalTenths(value) + 5) / 10)
}

function assertAxis(value: unknown, name: string): asserts value is number {
  assertInteger(value, name)
  if (value < 0 || value > 100) throw new Error(`${name} must be between 0 and 100`)
}

function assertScore(
  score: unknown,
  gameId: string,
  expected: (typeof EXPECTED_GAMES)[number],
): void {
  assertRecord(score, `${gameId}.score`)
  assertKeys(
    score,
    [
      'id',
      'version',
      'microOriginal',
      'mesoOriginal',
      'macroOriginal',
      'micro',
      'meso',
      'macro',
      'approvalReason',
      'approvedOn',
    ],
    `${gameId}.score`,
  )
  const [, , microOriginal, mesoOriginal, macroOriginal, micro, meso, macro] = expected
  assertExactString(
    score.id,
    `auth-score-${gameId.slice('auth-game-'.length)}-v1`,
    `${gameId}.score.id`,
  )
  assertInteger(score.version, `${gameId}.score.version`)
  if (score.version !== 1) throw new Error(`${gameId}.score.version must be 1`)
  assertExactString(score.microOriginal, microOriginal, `${gameId}.score.microOriginal`)
  assertExactString(score.mesoOriginal, mesoOriginal, `${gameId}.score.mesoOriginal`)
  assertExactString(score.macroOriginal, macroOriginal, `${gameId}.score.macroOriginal`)
  for (const axis of ['micro', 'meso', 'macro'] as const) {
    const original = score[`${axis}Original`]
    const stored = score[axis]
    assertString(original, `${gameId}.score.${axis}Original`)
    assertAxis(stored, `${gameId}.score.${axis}`)
  }
  if (score.micro === 0 && score.meso === 0 && score.macro === 0) {
    throw new Error(`${gameId}.score all-zero vector is invalid`)
  }
  if (score.micro === 100 && score.meso === 100 && score.macro === 100) {
    throw new Error(`${gameId}.score all-100 vector is invalid`)
  }
  for (const axis of ['micro', 'meso', 'macro'] as const) {
    const original = score[`${axis}Original`]
    const stored = score[axis]
    assertString(original, `${gameId}.score.${axis}Original`)
    if (stored !== roundDecimalHalfUp(original)) {
      throw new Error(`${gameId}.score.${axis} rounding mismatch`)
    }
  }
  if (score.micro !== micro || score.meso !== meso || score.macro !== macro) {
    throw new Error(`${gameId}.score stored vector does not match V1`)
  }
  assertExactString(
    score.approvalReason,
    'initial-owner-snapshot',
    `${gameId}.score.approvalReason`,
  )
  assertExactString(score.approvedOn, APPROVED_ON, `${gameId}.score.approvedOn`)
}

export function validateOwnerAuthoritativeManifest(
  value: unknown,
): asserts value is OwnerAuthoritativeManifestV1 {
  assertNoForbiddenKeys(value)
  assertRecord(value, 'manifest')
  assertKeys(
    value,
    ['schemaVersion', 'manifestVersion', 'snapshot', 'rounding', 'games', 'mappings'],
    'manifest',
  )
  if (value.schemaVersion !== 1) throw new Error('manifest.schemaVersion must be 1')
  assertExactString(value.manifestVersion, MANIFEST_VERSION, 'manifest.manifestVersion')

  assertRecord(value.snapshot, 'manifest.snapshot')
  assertKeys(value.snapshot, ['id', 'version', 'approvedOn'], 'manifest.snapshot')
  assertExactString(value.snapshot.id, SNAPSHOT_ID, 'manifest.snapshot.id')
  if (value.snapshot.version !== 1) throw new Error('manifest.snapshot.version must be 1')
  assertExactString(value.snapshot.approvedOn, APPROVED_ON, 'manifest.snapshot.approvedOn')

  assertRecord(value.rounding, 'manifest.rounding')
  assertKeys(value.rounding, ['decimalScale', 'mode'], 'manifest.rounding')
  if (value.rounding.decimalScale !== 1) throw new Error('manifest.rounding.decimalScale must be 1')
  assertExactString(value.rounding.mode, ROUNDING_MODE, 'manifest.rounding.mode')

  if (!Array.isArray(value.games)) throw new Error('manifest.games must be an array')
  if (value.games.length !== 10) throw new Error('manifest must contain exactly ten games')
  if (!Array.isArray(value.mappings)) throw new Error('manifest.mappings must be an array')
  if (value.mappings.length !== 8) throw new Error('manifest must contain exactly eight mappings')

  assertUnique(
    value.games.map((game) => (isRecord(game) && typeof game.id === 'string' ? game.id : '')),
    'game id',
  )
  assertUnique(
    value.games.map((game) =>
      isRecord(game) && typeof game.identityKey === 'string' ? game.identityKey : '',
    ),
    'identity key',
  )
  assertUnique(
    value.games.map((game) =>
      isRecord(game) && typeof game.canonicalTitle === 'string' ? game.canonicalTitle : '',
    ),
    'canonical title',
    true,
  )
  assertUnique(
    value.games.map((game) =>
      isRecord(game) && isRecord(game.score) && typeof game.score.id === 'string'
        ? game.score.id
        : '',
    ),
    'score id',
  )

  value.games.forEach((game, index) => {
    const expected = EXPECTED_GAMES[index]
    assertRecord(game, `manifest.games[${index}]`)
    assertKeys(game, ['id', 'identityKey', 'canonicalTitle', 'score'], `manifest.games[${index}]`)
    const [expectedId, expectedTitle] = expected
    assertExactString(game.id, expectedId, `manifest.games[${index}].id`)
    assertString(game.id, `manifest.games[${index}].id`)
    const gameId = game.id
    assertExactString(
      game.identityKey,
      expectedId.slice('auth-game-'.length),
      `manifest.games[${index}].identityKey`,
    )
    assertString(game.identityKey, `manifest.games[${index}].identityKey`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.identityKey)) {
      throw new Error(`${gameId}.identityKey must be lowercase kebab-case`)
    }
    if (gameId.includes('steam')) throw new Error(`${gameId} must remain platform-neutral`)
    assertExactString(game.canonicalTitle, expectedTitle, `${gameId}.canonicalTitle`)
    assertScore(game.score, gameId, expected)
  })

  const gameIds = new Set(value.games.map((game) => game.id))
  assertUnique(
    value.mappings.map((mapping) =>
      isRecord(mapping) && typeof mapping.id === 'string' ? mapping.id : '',
    ),
    'mapping id',
  )
  assertUnique(
    value.mappings.map((mapping) =>
      isRecord(mapping) && typeof mapping.externalId === 'string' ? mapping.externalId : '',
    ),
    'Steam external id',
  )
  assertUnique(
    value.mappings.map((mapping) =>
      isRecord(mapping) && typeof mapping.catalogGameId === 'string' ? mapping.catalogGameId : '',
    ),
    'catalog game id',
  )
  value.mappings.forEach((mapping, index) => {
    const expected = EXPECTED_MAPPINGS[index]
    assertRecord(mapping, `manifest.mappings[${index}]`)
    assertKeys(
      mapping,
      [
        'id',
        'authoritativeGameId',
        'provider',
        'externalId',
        'catalogGameId',
        'version',
        'decision',
        'verificationRef',
        'decidedOn',
      ],
      `manifest.mappings[${index}]`,
    )
    const [expectedGameId, expectedExternalId, expectedCatalogGameId] = expected
    assertExactString(
      mapping.id,
      `auth-map-steam-${expectedGameId.slice('auth-game-'.length)}-v1`,
      `${mapping.id}.id`,
    )
    assertExactString(
      mapping.authoritativeGameId,
      expectedGameId,
      `${mapping.id}.authoritativeGameId`,
    )
    if (!gameIds.has(mapping.authoritativeGameId))
      throw new Error(`${mapping.id} references unknown game`)
    assertExactString(mapping.provider, 'steam', `${mapping.id}.provider`)
    assertExactString(mapping.externalId, expectedExternalId, `${mapping.id}.externalId`)
    assertExactString(mapping.catalogGameId, expectedCatalogGameId, `${mapping.id}.catalogGameId`)
    assertInteger(mapping.version, `${mapping.id}.version`)
    if (mapping.version !== 1) throw new Error(`${mapping.id}.version must be 1`)
    assertExactString(mapping.decision, 'verified', `${mapping.id}.decision`)
    assertExactString(mapping.verificationRef, VERIFICATION_REF, `${mapping.id}.verificationRef`)
    assertExactString(mapping.decidedOn, APPROVED_ON, `${mapping.id}.decidedOn`)
  })
}

export function hashOwnerAuthoritativeManifest(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

export function assertOwnerAuthoritativeManifestIdentity(source: string): void {
  const actual = hashOwnerAuthoritativeManifest(source)
  if (actual !== EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256) {
    throw new Error(
      `Owner-authoritative MiMMa V1 source identity mismatch: ${actual}; expected ${EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256}`,
    )
  }
}

export function parseOwnerAuthoritativeManifest(source: string): OwnerAuthoritativeManifestV1 {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new Error(`Owner-authoritative MiMMa manifest is not valid JSON: ${String(error)}`)
  }
  validateOwnerAuthoritativeManifest(value)
  return value
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export interface OwnerAuthoritativeCatalogRow {
  id: string
  steamAppId: number
}

/** Prove each owner mapping points at an existing catalog id and Steam id. */
export function validateOwnerAuthoritativeCatalogMappings(
  manifest: OwnerAuthoritativeManifestV1,
  catalogRows: readonly OwnerAuthoritativeCatalogRow[],
): void {
  validateOwnerAuthoritativeManifest(manifest)
  const rowsById = new Map<string, OwnerAuthoritativeCatalogRow>()
  for (const row of catalogRows) {
    if (rowsById.has(row.id)) throw new Error(`duplicate catalog game id: ${row.id}`)
    if (!Number.isInteger(row.steamAppId) || row.steamAppId <= 0) {
      throw new Error(`catalog Steam App ID is invalid for ${row.id}`)
    }
    rowsById.set(row.id, row)
  }
  for (const mapping of manifest.mappings) {
    const catalogRow = rowsById.get(mapping.catalogGameId)
    if (!catalogRow) {
      throw new Error(
        `mapping ${mapping.id} references missing catalog game ${mapping.catalogGameId}`,
      )
    }
    if (mapping.provider !== 'steam' || mapping.externalId !== String(catalogRow.steamAppId)) {
      throw new Error(`mapping ${mapping.id} does not match catalog Steam App ID`)
    }
  }
}

function migrationSchemaStatements(): string[] {
  return [
    `-- Generated by scripts/generate-owner-authoritative-mimma.mts. Do not edit.
-- source_manifest_version: ${MANIFEST_VERSION}
-- source_hash: ${EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256}

CREATE TABLE authoritative_games (
  id TEXT PRIMARY KEY NOT NULL CHECK (id GLOB 'auth-game-*'),
  identity_key TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (
    length(identity_key) > 0 AND
    identity_key NOT GLOB '*[^a-z0-9-]*' AND
    identity_key NOT LIKE '-%' AND identity_key NOT LIKE '%-' AND identity_key NOT LIKE '%--%'
  ),
  canonical_title TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(canonical_title)) > 0),
  introduced_manifest_version TEXT NOT NULL CHECK (length(trim(introduced_manifest_version)) > 0),
  introduced_source_hash TEXT NOT NULL CHECK (
    length(introduced_source_hash) = 64 AND
    introduced_source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_on TEXT NOT NULL CHECK (created_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);`,
    `CREATE TABLE authoritative_mimma_score_versions (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES authoritative_games(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  micro_score INTEGER NOT NULL CHECK (typeof(micro_score) = 'integer' AND micro_score BETWEEN 0 AND 100),
  meso_score INTEGER NOT NULL CHECK (typeof(meso_score) = 'integer' AND meso_score BETWEEN 0 AND 100),
  macro_score INTEGER NOT NULL CHECK (typeof(macro_score) = 'integer' AND macro_score BETWEEN 0 AND 100),
  micro_original_decimal TEXT NOT NULL CHECK (
    micro_original_decimal NOT GLOB '*[^0-9.]*' AND length(micro_original_decimal) BETWEEN 3 AND 5 AND
    instr(micro_original_decimal, '.') = length(micro_original_decimal) - 1 AND
    (length(micro_original_decimal) = 3 OR substr(micro_original_decimal, 1, 1) <> '0') AND
    CAST(replace(micro_original_decimal, '.', '') AS INTEGER) BETWEEN 0 AND 1000
  ),
  meso_original_decimal TEXT NOT NULL CHECK (
    meso_original_decimal NOT GLOB '*[^0-9.]*' AND length(meso_original_decimal) BETWEEN 3 AND 5 AND
    instr(meso_original_decimal, '.') = length(meso_original_decimal) - 1 AND
    (length(meso_original_decimal) = 3 OR substr(meso_original_decimal, 1, 1) <> '0') AND
    CAST(replace(meso_original_decimal, '.', '') AS INTEGER) BETWEEN 0 AND 1000
  ),
  macro_original_decimal TEXT NOT NULL CHECK (
    macro_original_decimal NOT GLOB '*[^0-9.]*' AND length(macro_original_decimal) BETWEEN 3 AND 5 AND
    instr(macro_original_decimal, '.') = length(macro_original_decimal) - 1 AND
    (length(macro_original_decimal) = 3 OR substr(macro_original_decimal, 1, 1) <> '0') AND
    CAST(replace(macro_original_decimal, '.', '') AS INTEGER) BETWEEN 0 AND 1000
  ),
  decimal_scale INTEGER NOT NULL CHECK (decimal_scale = 1),
  rounding_mode TEXT NOT NULL CHECK (rounding_mode = 'half-up-to-integer-v1'),
  source_manifest_version TEXT NOT NULL CHECK (length(trim(source_manifest_version)) > 0),
  source_hash TEXT NOT NULL CHECK (
    length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  provenance TEXT NOT NULL CHECK (provenance = 'owner_authoritative'),
  approval_reason TEXT NOT NULL CHECK (approval_reason IN ('initial-owner-snapshot', 'owner-correction', 'owner-restore')),
  approved_on TEXT NOT NULL CHECK (approved_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  UNIQUE (game_id, version),
  UNIQUE (id, game_id),
  CHECK (micro_score <> 0 OR meso_score <> 0 OR macro_score <> 0),
  CHECK (micro_score <> 100 OR meso_score <> 100 OR macro_score <> 100)
);`,
    `CREATE TABLE authoritative_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL UNIQUE CHECK (typeof(version) = 'integer' AND version > 0),
  manifest_version TEXT NOT NULL CHECK (length(trim(manifest_version)) > 0),
  source_hash TEXT NOT NULL CHECK (
    length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  expected_member_count INTEGER NOT NULL CHECK (typeof(expected_member_count) = 'integer' AND expected_member_count > 0),
  state TEXT NOT NULL CHECK (state IN ('draft', 'frozen')),
  created_on TEXT NOT NULL CHECK (created_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  frozen_on TEXT,
  CHECK ((state = 'draft' AND frozen_on IS NULL) OR (state = 'frozen' AND frozen_on IS NOT NULL AND frozen_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'))
);`,
    `CREATE TABLE authoritative_snapshot_members (
  snapshot_id TEXT NOT NULL REFERENCES authoritative_snapshots(id) ON DELETE RESTRICT,
  game_id TEXT NOT NULL REFERENCES authoritative_games(id) ON DELETE RESTRICT,
  score_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, game_id),
  UNIQUE (snapshot_id, score_id),
  FOREIGN KEY (score_id, game_id) REFERENCES authoritative_mimma_score_versions(id, game_id) ON DELETE RESTRICT
);`,
    `CREATE TABLE authoritative_game_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL REFERENCES authoritative_games(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (length(provider) > 0 AND provider = lower(provider) AND provider NOT GLOB '*[^a-z0-9_-]*'),
  external_id TEXT NOT NULL CHECK (length(external_id) > 0),
  catalog_game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  mapping_version INTEGER NOT NULL CHECK (typeof(mapping_version) = 'integer' AND mapping_version > 0),
  decision TEXT NOT NULL CHECK (decision IN ('verified', 'rejected', 'revoked')),
  verification_ref TEXT NOT NULL CHECK (length(trim(verification_ref)) > 0),
  supersedes_mapping_id TEXT REFERENCES authoritative_game_mappings(id) ON DELETE RESTRICT,
  source_manifest_version TEXT NOT NULL CHECK (length(trim(source_manifest_version)) > 0),
  source_hash TEXT NOT NULL CHECK (
    length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  decided_on TEXT NOT NULL CHECK (decided_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  UNIQUE (game_id, provider, mapping_version),
  UNIQUE (id, game_id, provider, mapping_version)
);`,
    'CREATE INDEX authoritative_mimma_score_versions_game_version_idx ON authoritative_mimma_score_versions(game_id, version DESC);',
    'CREATE INDEX authoritative_snapshots_state_version_idx ON authoritative_snapshots(state, version DESC);',
    'CREATE INDEX authoritative_game_mappings_game_provider_version_idx ON authoritative_game_mappings(game_id, provider, mapping_version DESC);',
    'CREATE INDEX authoritative_game_mappings_provider_external_version_idx ON authoritative_game_mappings(provider, external_id, mapping_version DESC);',
    'CREATE INDEX authoritative_game_mappings_catalog_version_idx ON authoritative_game_mappings(catalog_game_id, mapping_version DESC);',
    `CREATE TRIGGER authoritative_games_prevent_update
BEFORE UPDATE ON authoritative_games
BEGIN
  SELECT RAISE(ABORT, 'authoritative games are immutable');
END;`,
    `CREATE TRIGGER authoritative_games_prevent_delete
BEFORE DELETE ON authoritative_games
BEGIN
  SELECT RAISE(ABORT, 'authoritative games cannot be deleted');
END;`,
    `CREATE TRIGGER authoritative_mimma_score_versions_prevent_update
BEFORE UPDATE ON authoritative_mimma_score_versions
BEGIN
  SELECT RAISE(ABORT, 'authoritative score versions are immutable');
END;`,
    `CREATE TRIGGER authoritative_mimma_score_versions_prevent_delete
BEFORE DELETE ON authoritative_mimma_score_versions
BEGIN
  SELECT RAISE(ABORT, 'authoritative score versions cannot be deleted');
END;`,
    `CREATE TRIGGER authoritative_snapshots_freeze_guard
BEFORE UPDATE ON authoritative_snapshots
WHEN OLD.state = 'draft' AND NEW.state = 'frozen'
BEGIN
  SELECT RAISE(ABORT, 'snapshot freeze requires complete membership')
  WHERE NEW.frozen_on IS NULL
    OR (SELECT COUNT(*) FROM authoritative_snapshot_members WHERE snapshot_id = NEW.id) <> NEW.expected_member_count
    OR (SELECT COUNT(DISTINCT game_id) FROM authoritative_snapshot_members WHERE snapshot_id = NEW.id) <> NEW.expected_member_count
    OR (SELECT COUNT(DISTINCT score_id) FROM authoritative_snapshot_members WHERE snapshot_id = NEW.id) <> NEW.expected_member_count;
  SELECT RAISE(ABORT, 'snapshot identity is immutable')
  WHERE NEW.id <> OLD.id OR NEW.version <> OLD.version OR NEW.manifest_version <> OLD.manifest_version
    OR NEW.source_hash <> OLD.source_hash OR NEW.expected_member_count <> OLD.expected_member_count
    OR NEW.created_on <> OLD.created_on;
END;`,
    `CREATE TRIGGER authoritative_snapshots_prevent_frozen_update
BEFORE UPDATE ON authoritative_snapshots
WHEN OLD.state = 'frozen' OR NOT (OLD.state = 'draft' AND NEW.state = 'frozen')
BEGIN
  SELECT RAISE(ABORT, 'authoritative snapshots are immutable');
END;`,
    `CREATE TRIGGER authoritative_snapshots_prevent_delete
BEFORE DELETE ON authoritative_snapshots
BEGIN
  SELECT RAISE(ABORT, 'authoritative snapshots cannot be deleted');
END;`,
    `CREATE TRIGGER authoritative_snapshot_members_prevent_frozen_insert
BEFORE INSERT ON authoritative_snapshot_members
WHEN (SELECT state FROM authoritative_snapshots WHERE id = NEW.snapshot_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'snapshot members can only be inserted into a draft');
END;`,
    `CREATE TRIGGER authoritative_snapshot_members_prevent_update
BEFORE UPDATE ON authoritative_snapshot_members
BEGIN
  SELECT RAISE(ABORT, 'authoritative snapshot members are immutable');
END;`,
    `CREATE TRIGGER authoritative_snapshot_members_prevent_delete
BEFORE DELETE ON authoritative_snapshot_members
BEGIN
  SELECT RAISE(ABORT, 'authoritative snapshot members cannot be deleted');
END;`,
    `CREATE TRIGGER authoritative_game_mappings_prevent_update
BEFORE UPDATE ON authoritative_game_mappings
BEGIN
  SELECT RAISE(ABORT, 'authoritative mapping history is immutable');
END;`,
    `CREATE TRIGGER authoritative_game_mappings_prevent_delete
BEFORE DELETE ON authoritative_game_mappings
BEGIN
  SELECT RAISE(ABORT, 'authoritative mapping history cannot be deleted');
END;`,
    `CREATE TRIGGER authoritative_game_mappings_insert_guard
BEFORE INSERT ON authoritative_game_mappings
BEGIN
  SELECT RAISE(ABORT, 'Steam mapping does not match catalog identity')
  WHERE NEW.provider = 'steam' AND NOT EXISTS (
    SELECT 1 FROM games AS g
    WHERE g.id = NEW.catalog_game_id AND CAST(g.steam_app_id AS TEXT) = NEW.external_id
  );
  SELECT RAISE(ABORT, 'mapping versions must be contiguous')
  WHERE NEW.mapping_version <> COALESCE((
    SELECT MAX(mapping_version) + 1 FROM authoritative_game_mappings
    WHERE game_id = NEW.game_id AND provider = NEW.provider
  ), 1);
  SELECT RAISE(ABORT, 'mapping version 1 cannot supersede a row')
  WHERE NEW.mapping_version = 1 AND NEW.supersedes_mapping_id IS NOT NULL;
  SELECT RAISE(ABORT, 'mapping supersession must name the prior same-game row')
  WHERE NEW.mapping_version > 1 AND NOT EXISTS (
    SELECT 1 FROM authoritative_game_mappings AS prior
    WHERE prior.id = NEW.supersedes_mapping_id AND prior.game_id = NEW.game_id
      AND prior.provider = NEW.provider AND prior.mapping_version = NEW.mapping_version - 1
  );
END;`,
  ]
}

function renderDataStatements(manifest: OwnerAuthoritativeManifestV1): string[] {
  const expectedCatalogPairs = manifest.mappings
    .map((mapping) => `(${sqlString(mapping.catalogGameId)}, ${sqlString(mapping.externalId)})`)
    .join(', ')
  const expectedGameIds = manifest.games.map((game) => sqlString(game.id)).join(', ')
  const expectedIdentityKeys = manifest.games.map((game) => sqlString(game.identityKey)).join(', ')
  const expectedTitles = manifest.games.map((game) => sqlString(game.canonicalTitle)).join(', ')
  const expectedScoreIds = manifest.games.map((game) => sqlString(game.score.id)).join(', ')
  const expectedScoreVersions = manifest.games
    .map((game) => `(${sqlString(game.id)}, ${game.score.version})`)
    .join(', ')
  const expectedMappingIds = manifest.mappings.map((mapping) => sqlString(mapping.id)).join(', ')
  const expectedMappingVersions = manifest.mappings
    .map(
      (mapping) =>
        `(${sqlString(mapping.authoritativeGameId)}, ${sqlString(mapping.provider)}, ${mapping.version})`,
    )
    .join(', ')
  const statements: string[] = [
    `-- owner-authoritative migration preflight
-- abs(INT64_MIN) deliberately aborts this statement when any preflight predicate fails.
WITH expected_catalog(catalog_game_id, external_id) AS (VALUES ${expectedCatalogPairs}),
expected_score_versions(game_id, score_version) AS (VALUES ${expectedScoreVersions}),
expected_mapping_versions(game_id, provider, mapping_version) AS (VALUES ${expectedMappingVersions})
SELECT abs(CASE WHEN
  (SELECT COUNT(*) FROM expected_catalog AS expected
    INNER JOIN games AS catalog ON catalog.id = expected.catalog_game_id
      AND CAST(catalog.steam_app_id AS TEXT) = expected.external_id) <> ${manifest.mappings.length}
  OR EXISTS (SELECT 1 FROM authoritative_mimma_scores)
  OR EXISTS (SELECT 1 FROM authoritative_games
    WHERE id IN (${expectedGameIds}) OR identity_key IN (${expectedIdentityKeys})
      OR canonical_title IN (${expectedTitles}))
  OR EXISTS (SELECT 1 FROM authoritative_mimma_score_versions AS existing
    WHERE existing.id IN (${expectedScoreIds})
      OR EXISTS (SELECT 1 FROM expected_score_versions AS expected
        WHERE existing.game_id = expected.game_id AND existing.version = expected.score_version))
  OR EXISTS (SELECT 1 FROM authoritative_snapshots
    WHERE id = ${sqlString(SNAPSHOT_ID)} OR version = 1)
  OR EXISTS (SELECT 1 FROM authoritative_snapshot_members WHERE snapshot_id = ${sqlString(SNAPSHOT_ID)})
  OR EXISTS (SELECT 1 FROM authoritative_game_mappings AS existing
    WHERE existing.id IN (${expectedMappingIds})
      OR EXISTS (SELECT 1 FROM expected_mapping_versions AS expected
        WHERE existing.game_id = expected.game_id AND existing.provider = expected.provider
          AND existing.mapping_version = expected.mapping_version))
  THEN -9223372036854775808 ELSE 0 END) AS owner_authoritative_migration_preflight;`,
  ]
  for (const game of manifest.games) {
    statements.push(
      `INSERT INTO authoritative_games (id, identity_key, canonical_title, introduced_manifest_version, introduced_source_hash, created_on) VALUES (${sqlString(game.id)}, ${sqlString(game.identityKey)}, ${sqlString(game.canonicalTitle)}, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, ${sqlString(APPROVED_ON)});`,
    )
  }
  for (const game of manifest.games) {
    statements.push(
      `INSERT INTO authoritative_mimma_score_versions (id, game_id, version, micro_score, meso_score, macro_score, micro_original_decimal, meso_original_decimal, macro_original_decimal, decimal_scale, rounding_mode, source_manifest_version, source_hash, provenance, approval_reason, approved_on) VALUES (${sqlString(game.score.id)}, ${sqlString(game.id)}, ${game.score.version}, ${game.score.micro}, ${game.score.meso}, ${game.score.macro}, ${sqlString(game.score.microOriginal)}, ${sqlString(game.score.mesoOriginal)}, ${sqlString(game.score.macroOriginal)}, 1, ${sqlString(ROUNDING_MODE)}, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, 'owner_authoritative', ${sqlString(game.score.approvalReason)}, ${sqlString(game.score.approvedOn)});`,
    )
  }
  statements.push(
    `INSERT INTO authoritative_snapshots (id, version, manifest_version, source_hash, expected_member_count, state, created_on, frozen_on) VALUES (${sqlString(SNAPSHOT_ID)}, 1, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, 10, 'draft', ${sqlString(APPROVED_ON)}, NULL);`,
  )
  for (const game of manifest.games) {
    statements.push(
      `INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (${sqlString(SNAPSHOT_ID)}, ${sqlString(game.id)}, ${sqlString(game.score.id)});`,
    )
  }
  for (const mapping of manifest.mappings) {
    statements.push(
      `INSERT INTO authoritative_game_mappings (id, game_id, provider, external_id, catalog_game_id, mapping_version, decision, verification_ref, supersedes_mapping_id, source_manifest_version, source_hash, decided_on) VALUES (${sqlString(mapping.id)}, ${sqlString(mapping.authoritativeGameId)}, ${sqlString(mapping.provider)}, ${sqlString(mapping.externalId)}, ${sqlString(mapping.catalogGameId)}, ${mapping.version}, ${sqlString(mapping.decision)}, ${sqlString(mapping.verificationRef)}, NULL, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, ${sqlString(mapping.decidedOn)});`,
    )
  }
  statements.push(
    `UPDATE authoritative_snapshots SET state = 'frozen', frozen_on = ${sqlString(APPROVED_ON)} WHERE id = ${sqlString(SNAPSHOT_ID)} AND state = 'draft';`,
  )
  return statements
}

/** Render the stable LF migration from a validated owner manifest. */
export function renderOwnerAuthoritativeMimmaSql(manifest: OwnerAuthoritativeManifestV1): string {
  validateOwnerAuthoritativeManifest(manifest)
  const statements = [...migrationSchemaStatements(), ...renderDataStatements(manifest)]
  return `${statements.join('\n--> statement-breakpoint\n')}\n`
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

export function assertMigrationArtifactMatches(path: string, expected: string): void {
  let actual: string
  try {
    actual = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      'Owner-authoritative MiMMa migration drift detected. Run node scripts/generate-owner-authoritative-mimma.mts --write.',
    )
  }
  if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
    throw new Error(
      'Owner-authoritative MiMMa migration drift detected. Run node scripts/generate-owner-authoritative-mimma.mts --write.',
    )
  }
}

function readCatalogRows(): readonly OwnerAuthoritativeCatalogRow[] {
  const parsed: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'))
  if (!isRecord(parsed) || !Array.isArray(parsed.games))
    throw new Error('catalog release is invalid')
  return parsed.games.map((game, index) => {
    if (!isRecord(game) || typeof game.id !== 'string' || typeof game.steamAppId !== 'number') {
      throw new Error(`catalog release game ${index} is invalid`)
    }
    return { id: game.id, steamAppId: game.steamAppId }
  })
}

function main(): void {
  const source = readFileSync(manifestPath, 'utf8')
  assertOwnerAuthoritativeManifestIdentity(source)
  const manifest = parseOwnerAuthoritativeManifest(source)
  validateOwnerAuthoritativeCatalogMappings(manifest, readCatalogRows())
  const migration = renderOwnerAuthoritativeMimmaSql(manifest)
  if (process.argv.includes('--write')) {
    writeFileSync(migrationPath, migration, 'utf8')
    process.stdout.write('Owner-authoritative MiMMa migration generated.\n')
    return
  }
  assertMigrationArtifactMatches(migrationPath, migration)
  process.stdout.write('Owner-authoritative MiMMa migration matches committed artifact.\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
