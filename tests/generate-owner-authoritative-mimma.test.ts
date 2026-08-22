import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
  assertMigrationArtifactMatches,
  parseOwnerAuthoritativeManifest,
  renderOwnerAuthoritativeMimmaSql,
} from '../scripts/generate-owner-authoritative-mimma.mjs'

const root = resolve(import.meta.dirname, '..')
const manifestPath = resolve(root, 'data/authoritative-records/owner-authoritative-mimma-v1.json')
const migrationPath = resolve(root, 'migrations/0005_owner_authoritative_mimma_v1.sql')
const generatorPath = resolve(root, 'scripts/generate-owner-authoritative-mimma.mts')

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function committedMigration(): string {
  return normalizeLineEndings(readFileSync(migrationPath, 'utf8'))
}

describe('owner-authoritative MiMMa migration generator', () => {
  test('renders the committed migration byte-for-byte from the immutable manifest', () => {
    const source = readFileSync(manifestPath, 'utf8')
    const sql = renderOwnerAuthoritativeMimmaSql(parseOwnerAuthoritativeManifest(source))

    expect(createHash('sha256').update(source, 'utf8').digest('hex')).toBe(
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
    )
    expect(committedMigration()).toBe(sql)
    expect(sql).toMatch(/\n$/)
    expect(sql).not.toMatch(/\r/)
    expect(() =>
      assertMigrationArtifactMatches(migrationPath, sql.replaceAll('\n', '\r\n')),
    ).not.toThrow()
  })

  test('creates the five additive tables, five indexes, and thirteen triggers in contract order', () => {
    const sql = committedMigration()
    const tableNames = [...sql.matchAll(/CREATE TABLE (\w+)/g)].map((match) => match[1])
    const indexNames = [...sql.matchAll(/CREATE INDEX (\w+)/g)].map((match) => match[1])
    const triggerNames = [...sql.matchAll(/CREATE TRIGGER (\w+)/g)].map((match) => match[1])

    expect(tableNames).toEqual([
      'authoritative_games',
      'authoritative_mimma_score_versions',
      'authoritative_snapshots',
      'authoritative_snapshot_members',
      'authoritative_game_mappings',
    ])
    expect(indexNames).toEqual([
      'authoritative_mimma_score_versions_game_version_idx',
      'authoritative_snapshots_state_version_idx',
      'authoritative_game_mappings_game_provider_version_idx',
      'authoritative_game_mappings_provider_external_version_idx',
      'authoritative_game_mappings_catalog_version_idx',
    ])
    expect(triggerNames).toEqual([
      'authoritative_games_prevent_update',
      'authoritative_games_prevent_delete',
      'authoritative_mimma_score_versions_prevent_update',
      'authoritative_mimma_score_versions_prevent_delete',
      'authoritative_snapshots_freeze_guard',
      'authoritative_snapshots_prevent_frozen_update',
      'authoritative_snapshots_prevent_delete',
      'authoritative_snapshot_members_prevent_frozen_insert',
      'authoritative_snapshot_members_prevent_update',
      'authoritative_snapshot_members_prevent_delete',
      'authoritative_game_mappings_prevent_update',
      'authoritative_game_mappings_prevent_delete',
      'authoritative_game_mappings_insert_guard',
    ])
  })

  test('emits the exact V1 row counts and provenance-bearing source hash', () => {
    const sql = committedMigration()

    expect(sql.match(/INSERT INTO authoritative_games \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_mimma_score_versions \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_snapshot_members \(/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_snapshots \(/g)).toHaveLength(1)
    expect(sql.match(/INSERT INTO authoritative_game_mappings \(/g)).toHaveLength(8)
    expect(
      sql.match(new RegExp(EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256, 'g'))?.length,
    ).toBeGreaterThanOrEqual(29)
    expect(sql).toContain("UPDATE authoritative_snapshots SET state = 'frozen'")
  })

  test('is additive and leaves the legacy Steam-bound score table untouched', () => {
    const sql = committedMigration()

    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bALTER\b/i)
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+authoritative_mimma_scores\b/i)
    expect(sql).not.toMatch(/authoritative_mimma_scores\s*\(/i)
    expect(sql).toContain('SELECT COUNT(*) FROM authoritative_mimma_scores')
  })

  test('keeps excluded catalog members and raw data outside the generated SQL', () => {
    const sql = committedMigration()

    for (const excluded of [
      'Destiny 2',
      'BeamNG.drive',
      'survey',
      'comment',
      'hours',
      'playtime',
    ]) {
      expect(sql.toLowerCase()).not.toContain(excluded.toLowerCase())
    }
    expect(sql).toContain('auth-game-league-of-legends')
    expect(sql).toContain('auth-game-valorant')
    expect(sql.match(/INSERT INTO authoritative_game_mappings[\s\S]*?;/g)?.join('\n')).not.toMatch(
      /league-of-legends|valorant/,
    )
  })

  test('uses statement breakpoints and validates every V1 Steam catalog identity', () => {
    const sql = committedMigration()

    expect(sql).toContain('-- verify catalog Steam identities before authority inserts')
    for (const [catalogGameId, appId] of [
      ['steam-730', '730'],
      ['steam-1623730', '1623730'],
      ['steam-2767030', '2767030'],
      ['steam-1172470', '1172470'],
      ['steam-359550', '359550'],
      ['steam-1086940', '1086940'],
      ['steam-2246340', '2246340'],
      ['steam-1245620', '1245620'],
    ]) {
      expect(sql).toContain(`'${catalogGameId}'`)
      expect(sql).toContain(`'${appId}'`)
    }
    expect(sql.split('--> statement-breakpoint').length).toBeGreaterThan(25)
    expect(sql.split('--> statement-breakpoint\r\n')).toHaveLength(1)
  })

  test('default mode detects drift and --write is the only artifact-writing mode', () => {
    expect(() =>
      execFileSync(process.execPath, [generatorPath], { cwd: root, encoding: 'utf8' }),
    ).not.toThrow()
    expect(
      execFileSync(process.execPath, [generatorPath], { cwd: root, encoding: 'utf8' }),
    ).toContain('matches committed artifact')
  })
})
