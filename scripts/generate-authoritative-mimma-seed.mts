import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { MimmaScore } from '../src/shared/mimma.js'

const DATASET_VERSION = 'authoritative-mimma-seed-v1'
const CREATED_AT = '2026-08-18T20:02:44Z'
const PROVENANCE = 'authoritative_sample_seed'
const SOURCE_HEADER = 'game,zone,micro,meso,macro,provenance,source_url'
const SOURCE_SHA256 = '6b237d4a513a88eceead7d7c5dcaa6a5d073f59b23da49f651f9ee5bb0ee0c74'
const DEFAULT_COUNTS = { macro: 21, meso: 17, micro: 24 } as const

type SingleAxisZone = 'micro' | 'meso' | 'macro'

export interface SurnexRow {
  game: string
  macro: string
  meso: string
  micro: string
  provenance: string
  sourceUrl: string
  zone: string
}

export interface AuthoritativeMimmaSeed extends MimmaScore {
  conceptualName: string
  createdAt: typeof CREATED_AT
  datasetVersion: typeof DATASET_VERSION
  id: string
  provenance: typeof PROVENANCE
}

export interface SeedBuildOptions {
  expectedCounts?: Readonly<Record<SingleAxisZone, number>>
}

const SCORE_BY_ZONE: Readonly<Record<SingleAxisZone, MimmaScore>> = {
  macro: { macro: 100, meso: 0, micro: 0 },
  meso: { macro: 0, meso: 100, micro: 0 },
  micro: { macro: 0, meso: 0, micro: 100 },
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(repositoryRoot, 'data/surnex-dataset.csv')
const migrationPath = resolve(repositoryRoot, 'migrations/0003_authoritative_mimma_seed.sql')

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

export function assertSourceIdentity(source: string): void {
  const normalized = normalizeSource(source)
  const actual = createHash('sha256').update(normalized, 'utf8').digest('hex')
  if (actual !== SOURCE_SHA256) {
    throw new Error(`Authoritative MiMMa source identity mismatch: ${actual}`)
  }
}

export function parseSurnexCsv(source: string): readonly SurnexRow[] {
  const lines = normalizeSource(source).split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }

  if (lines[0] !== SOURCE_HEADER) {
    throw new Error(`Authoritative MiMMa source header is invalid: expected ${SOURCE_HEADER}`)
  }

  return lines.slice(1).map((line, index) => {
    const lineNumber = index + 2
    const fields = line.split(',')
    if (fields.length !== 7) {
      throw new Error(`Authoritative MiMMa source line ${lineNumber} has ${fields.length} fields`)
    }
    if (fields.some((field) => field.trim().length === 0)) {
      throw new Error(`Authoritative MiMMa source line ${lineNumber} contains a blank field`)
    }

    const [game, zone, micro, meso, macro, provenance, sourceUrl] = fields
    return { game, zone, micro, meso, macro, provenance, sourceUrl }
  })
}

function seedIdFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(/[’']/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')

  if (slug.length === 0) throw new Error(`Cannot create seed id from ${name}`)
  return `${DATASET_VERSION}-${slug}`
}

function assertPureAxisScore(seed: MimmaScore): void {
  const isPureAxis =
    (seed.micro === 100 && seed.meso === 0 && seed.macro === 0) ||
    (seed.micro === 0 && seed.meso === 100 && seed.macro === 0) ||
    (seed.micro === 0 && seed.meso === 0 && seed.macro === 100)
  if (!isPureAxis) {
    throw new Error('Authoritative MiMMa seed has an invalid score pattern')
  }
}

export function buildAuthoritativeMimmaSeeds(
  rows: readonly SurnexRow[],
  options: SeedBuildOptions = {},
): readonly AuthoritativeMimmaSeed[] {
  const expectedCounts = options.expectedCounts ?? DEFAULT_COUNTS
  const selectedRows = rows.filter((row): row is SurnexRow & { zone: SingleAxisZone } =>
    Object.hasOwn(SCORE_BY_ZONE, row.zone),
  )
  const counts = { macro: 0, meso: 0, micro: 0 }
  const ids = new Set<string>()
  const names = new Set<string>()
  const seeds = selectedRows.map((row) => {
    const id = seedIdFor(row.game)
    if (ids.has(id)) throw new Error(`Authoritative MiMMa source has duplicate seed id: ${id}`)
    ids.add(id)

    const nameKey = row.game.toLowerCase()
    if (names.has(nameKey)) {
      throw new Error(`Authoritative MiMMa source has duplicate conceptual name: ${row.game}`)
    }
    names.add(nameKey)
    counts[row.zone] += 1

    const score = SCORE_BY_ZONE[row.zone]
    assertPureAxisScore(score)
    return {
      ...score,
      conceptualName: row.game,
      createdAt: CREATED_AT,
      datasetVersion: DATASET_VERSION,
      id,
      provenance: PROVENANCE,
    } as const
  })

  for (const zone of ['micro', 'meso', 'macro'] as const) {
    if (counts[zone] !== expectedCounts[zone]) {
      throw new Error(
        `Authoritative MiMMa source has ${counts[zone]} ${zone} seeds; expected ${expectedCounts[zone]}`,
      )
    }
  }

  return seeds.sort((left, right) => left.id.localeCompare(right.id))
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function renderAuthoritativeMimmaSeedMigration(
  seeds: readonly AuthoritativeMimmaSeed[],
): string {
  for (const seed of seeds) {
    assertPureAxisScore(seed)
    if (seed.provenance !== PROVENANCE || seed.datasetVersion !== DATASET_VERSION) {
      throw new Error(`Authoritative MiMMa seed ${seed.id} has invalid provenance metadata`)
    }
  }

  const inserts = seeds.map((seed) => {
    const values = [
      sqlString(seed.id),
      sqlString(seed.conceptualName),
      seed.micro,
      seed.meso,
      seed.macro,
      sqlString(seed.provenance),
      sqlString(seed.datasetVersion),
      sqlString(seed.createdAt),
    ].join(', ')
    return `INSERT INTO authoritative_mimma_seeds (id, conceptual_name, micro_score, meso_score, macro_score, provenance, dataset_version, created_at) VALUES (${values});\n--> statement-breakpoint`
  })

  return `-- Generated by scripts/generate-authoritative-mimma-seed.mts. Do not edit.
-- dataset_version: ${DATASET_VERSION}
-- source: data/surnex-dataset.csv

CREATE TABLE authoritative_mimma_seeds (
  id TEXT PRIMARY KEY NOT NULL,
  conceptual_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  micro_score INTEGER NOT NULL CHECK (typeof(micro_score) = 'integer' AND micro_score BETWEEN 0 AND 100),
  meso_score INTEGER NOT NULL CHECK (typeof(meso_score) = 'integer' AND meso_score BETWEEN 0 AND 100),
  macro_score INTEGER NOT NULL CHECK (typeof(macro_score) = 'integer' AND macro_score BETWEEN 0 AND 100),
  provenance TEXT NOT NULL CHECK (provenance = '${PROVENANCE}'),
  dataset_version TEXT NOT NULL CHECK (dataset_version = '${DATASET_VERSION}'),
  created_at TEXT NOT NULL,
  CHECK (
    (micro_score = 100 AND meso_score = 0 AND macro_score = 0) OR
    (micro_score = 0 AND meso_score = 100 AND macro_score = 0) OR
    (micro_score = 0 AND meso_score = 0 AND macro_score = 100)
  )
);
--> statement-breakpoint

CREATE TRIGGER authoritative_mimma_seeds_prevent_update
BEFORE UPDATE ON authoritative_mimma_seeds
BEGIN
  SELECT RAISE(ABORT, 'authoritative MiMMa seeds are immutable');
END;
--> statement-breakpoint

CREATE TRIGGER authoritative_mimma_seeds_prevent_delete
BEFORE DELETE ON authoritative_mimma_seeds
BEGIN
  SELECT RAISE(ABORT, 'authoritative MiMMa seeds cannot be deleted');
END;
--> statement-breakpoint

${inserts.join('\n')}

CREATE TRIGGER authoritative_mimma_seeds_prevent_insert
BEFORE INSERT ON authoritative_mimma_seeds
BEGIN
  SELECT RAISE(ABORT, 'authoritative MiMMa seed set is immutable');
END;
--> statement-breakpoint
`
}

function assertArtifactMatches(expected: string): void {
  let actual: string
  try {
    actual = readFileSync(migrationPath, 'utf8')
  } catch {
    throw new Error(
      'Authoritative MiMMa seed artifact drift detected. Run node scripts/generate-authoritative-mimma-seed.mts --write.',
    )
  }
  if (actual !== expected) {
    throw new Error(
      'Authoritative MiMMa seed artifact drift detected. Run node scripts/generate-authoritative-mimma-seed.mts --write.',
    )
  }
}

function writeArtifact(content: string): void {
  writeFileSync(migrationPath, content, 'utf8')
}

function generate(): string {
  const source = readFileSync(sourcePath, 'utf8')
  assertSourceIdentity(source)
  return renderAuthoritativeMimmaSeedMigration(buildAuthoritativeMimmaSeeds(parseSurnexCsv(source)))
}

function main(): void {
  const migration = generate()
  if (process.argv.includes('--write')) {
    writeArtifact(migration)
    process.stdout.write('Authoritative MiMMa seed migration generated.\n')
    return
  }

  assertArtifactMatches(migration)
  process.stdout.write('Authoritative MiMMa seed artifact matches source.\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
