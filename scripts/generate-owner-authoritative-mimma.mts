import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

/** Render deterministic data statements from a validated manifest. */
export function renderOwnerAuthoritativeMimmaSql(manifest: OwnerAuthoritativeManifestV1): string {
  validateOwnerAuthoritativeManifest(manifest)
  const statements: string[] = []
  for (const game of manifest.games) {
    statements.push(
      `INSERT INTO authoritative_games (id, identity_key, canonical_title) VALUES (${sqlString(game.id)}, ${sqlString(game.identityKey)}, ${sqlString(game.canonicalTitle)});`,
    )
    statements.push(
      `INSERT INTO authoritative_mimma_score_versions (id, game_id, version, micro_score, meso_score, macro_score, micro_original_decimal, meso_original_decimal, macro_original_decimal) VALUES (${sqlString(game.score.id)}, ${sqlString(game.id)}, ${game.score.version}, ${game.score.micro}, ${game.score.meso}, ${game.score.macro}, ${sqlString(game.score.microOriginal)}, ${sqlString(game.score.mesoOriginal)}, ${sqlString(game.score.macroOriginal)});`,
    )
    statements.push(
      `INSERT INTO authoritative_snapshot_members (snapshot_id, game_id, score_id) VALUES (${sqlString(SNAPSHOT_ID)}, ${sqlString(game.id)}, ${sqlString(game.score.id)});`,
    )
  }
  statements.push(
    `INSERT INTO authoritative_snapshots (id, version, manifest_version, source_hash, expected_member_count, state, created_on) VALUES (${sqlString(SNAPSHOT_ID)}, 1, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, 10, 'draft', ${sqlString(APPROVED_ON)});`,
  )
  for (const mapping of manifest.mappings) {
    statements.push(
      `INSERT INTO authoritative_game_mappings (id, game_id, provider, external_id, catalog_game_id, mapping_version, decision, verification_ref, source_manifest_version, source_hash, decided_on) VALUES (${sqlString(mapping.id)}, ${sqlString(mapping.authoritativeGameId)}, ${sqlString(mapping.provider)}, ${sqlString(mapping.externalId)}, ${sqlString(mapping.catalogGameId)}, ${mapping.version}, ${sqlString(mapping.decision)}, ${sqlString(mapping.verificationRef)}, ${sqlString(MANIFEST_VERSION)}, ${sqlString(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256)}, ${sqlString(mapping.decidedOn)});`,
    )
  }
  return `${statements.join('\n--> statement-breakpoint\n')}\n`
}

function main(): void {
  const source = readFileSync(manifestPath, 'utf8')
  assertOwnerAuthoritativeManifestIdentity(source)
  const manifest = parseOwnerAuthoritativeManifest(source)
  renderOwnerAuthoritativeMimmaSql(manifest)
  process.stdout.write('Owner-authoritative MiMMa V1 manifest matches source.\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
