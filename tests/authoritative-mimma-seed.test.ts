import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  assertSourceIdentity,
  buildAuthoritativeMimmaSeeds,
  parseSurnexCsv,
  renderAuthoritativeMimmaSeedMigration,
} from '../scripts/generate-authoritative-mimma-seed.mjs'

const source = readFileSync(new URL('../data/surnex-dataset.csv', import.meta.url), 'utf8')

describe('authoritative MiMMa seed generator', () => {
  test('locks the normalized source identity for dataset version v1', () => {
    expect(() => assertSourceIdentity(source)).not.toThrow()
    expect(() => assertSourceIdentity(`${source}\nchanged`)).toThrow('source identity')
  })

  test('selects the exact approved single-axis sample', () => {
    const seeds = buildAuthoritativeMimmaSeeds(parseSurnexCsv(source))
    expect(seeds).toHaveLength(62)
    expect(seeds.filter((seed) => seed.micro === 100)).toHaveLength(24)
    expect(seeds.filter((seed) => seed.meso === 100)).toHaveLength(17)
    expect(seeds.filter((seed) => seed.macro === 100)).toHaveLength(21)
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(62)
    expect(new Set(seeds.map((seed) => seed.conceptualName)).size).toBe(62)
  })

  test('rejects the wrong header and malformed row widths', () => {
    expect(() => parseSurnexCsv('name,zone\nExample,micro')).toThrow('header')
    expect(() =>
      parseSurnexCsv('game,zone,micro,meso,macro,provenance,source_url\nExample,micro,high'),
    ).toThrow('line 2')
  })

  test('maps zone membership instead of qualitative axis text', () => {
    const [seed] = buildAuthoritativeMimmaSeeds(
      [
        {
          game: 'Example',
          macro: 'high',
          meso: 'high',
          micro: 'low',
          provenance: 'surnex',
          sourceUrl: 'https://example.test/game',
          zone: 'micro',
        },
      ],
      { expectedCounts: { macro: 0, meso: 0, micro: 1 } },
    )
    expect(seed).toMatchObject({ macro: 0, meso: 0, micro: 100 })
  })

  test('rejects duplicate generated identifiers', () => {
    const sharedFields = {
      macro: 'low',
      meso: 'low',
      micro: 'high',
      provenance: 'surnex',
      sourceUrl: 'https://example.test/game',
      zone: 'micro',
    }
    expect(() =>
      buildAuthoritativeMimmaSeeds(
        [
          { ...sharedFields, game: 'Same Game' },
          { ...sharedFields, game: 'Same-Game' },
        ],
        { expectedCounts: { macro: 0, meso: 0, micro: 2 } },
      ),
    ).toThrow('duplicate seed id')
  })

  test('renders the immutable table, triggers, and one insert per seed', () => {
    const seeds = buildAuthoritativeMimmaSeeds(parseSurnexCsv(source))
    const sql = renderAuthoritativeMimmaSeedMigration(seeds)
    expect(sql).toContain('CREATE TABLE authoritative_mimma_seeds')
    expect(sql).toContain('authoritative_mimma_seeds_prevent_update')
    expect(sql).toContain('authoritative_mimma_seeds_prevent_delete')
    expect(sql).toContain('authoritative_mimma_seeds_prevent_insert')
    expect(sql.match(/INSERT INTO authoritative_mimma_seeds/g)).toHaveLength(62)
    expect(sql.indexOf('CREATE TRIGGER authoritative_mimma_seeds_prevent_insert')).toBeGreaterThan(
      sql.lastIndexOf('INSERT INTO authoritative_mimma_seeds'),
    )
    expect(sql).not.toContain('steam_app_id')
    expect(sql).not.toContain('zone TEXT')
    expect(sql).not.toContain('label TEXT')
  })
})
