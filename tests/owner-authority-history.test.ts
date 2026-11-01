import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  assertMappingsMatchCatalog,
  renderOwnerAuthoritativeMimmaV2Sql,
  v2MigrationPath,
} from '../scripts/generate-owner-authoritative-mimma-v2.mts'
import {
  type OwnerAuthoritativeManifestNext,
  appendOwnerRecord,
  latestSnapshotScores,
  parseOwnerRecordNext,
  readOwnerAuthorityHistory,
} from '../scripts/owner-authority-history.mts'

const root = resolve(import.meta.dirname, '..')
const history = readOwnerAuthorityHistory(root)
const v2Source = readFileSync(
  resolve(root, 'data/authoritative-records/owner-authoritative-mimma-v2.json'),
  'utf8',
)
const v1Rows = {
  games: history.rows.games.filter((row) => row.manifestVersion === 'owner-authoritative-mimma-v1'),
  scores: history.rows.scores.filter(
    (row) => row.manifestVersion === 'owner-authoritative-mimma-v1',
  ),
  snapshots: history.rows.snapshots.filter((row) => row.version === 1),
  members: history.rows.members.filter((row) => row.snapshotId.endsWith('-v1')),
  mappings: history.rows.mappings.filter(
    (row) => row.manifestVersion === 'owner-authoritative-mimma-v1',
  ),
}

/** A fresh copy of the v2 record to break in one way per test. */
function v2(): OwnerAuthoritativeManifestNext {
  return parseOwnerRecordNext(v2Source)
}

function gameIn(record: OwnerAuthoritativeManifestNext, id: string) {
  const game = record.games.find((candidate) => candidate.id === id)
  if (game === undefined) throw new Error(`missing ${id}`)
  return game
}

describe('owner authority history', () => {
  test('appends v2 without rewriting v1', () => {
    const added = history.v2Rows

    expect(added.games.map((row) => row.id)).toEqual([
      'auth-game-destiny-2',
      'auth-game-beamng-drive',
    ])
    expect(added.scores).toHaveLength(10)
    expect(added.scores.filter((row) => row.approvalReason === 'owner-correction')).toHaveLength(8)
    expect(added.members).toHaveLength(12)
    expect(added.mappings.map((row) => row.id)).toEqual([
      'auth-map-steam-destiny-2-v1',
      'auth-map-steam-beamng-drive-v1',
    ])
    expect(history.rows.games).toHaveLength(12)
    expect(history.rows.scores).toHaveLength(20)
    expect(new Set(history.rows.scores.map((row) => row.id)).size).toBe(20)
  })

  test('serves the latest snapshot, reusing unchanged v1 scores', () => {
    const latest = latestSnapshotScores(history.rows)

    expect(latest.size).toBe(12)
    expect(latest.get('auth-game-valorant')?.id).toBe('auth-score-valorant-v1')
    expect(latest.get('auth-game-elden-ring')).toMatchObject({
      id: 'auth-score-elden-ring-v2',
      micro: 75,
      meso: 55,
      macro: 60,
      microOriginal: '75.0',
    })
  })

  test.each([
    [
      'a changed v1 score under its old id',
      (record: OwnerAuthoritativeManifestNext) => {
        gameIn(record, 'auth-game-valorant').score.micro = 99
      },
      'reuses auth-score-valorant-v1 but changes it',
    ],
    [
      'a skipped score version',
      (record: OwnerAuthoritativeManifestNext) => {
        const score = gameIn(record, 'auth-game-palworld').score
        score.version = 3
        score.id = 'auth-score-palworld-v3'
      },
      'needs score auth-score-palworld-v2',
    ],
    [
      'a rounding mismatch',
      (record: OwnerAuthoritativeManifestNext) => {
        gameIn(record, 'auth-game-palworld').score.micro = 46
      },
      'rounding mismatch',
    ],
    [
      'a dropped game',
      (record: OwnerAuthoritativeManifestNext) => {
        record.games = record.games.filter((game) => game.id !== 'auth-game-league-of-legends')
      },
      'auth-game-league-of-legends is missing',
    ],
    [
      'a renamed game',
      (record: OwnerAuthoritativeManifestNext) => {
        gameIn(record, 'auth-game-palworld').canonicalTitle = 'Palworld 2'
      },
      'must keep its identity key and title',
    ],
    [
      'a skipped snapshot version',
      (record: OwnerAuthoritativeManifestNext) => {
        record.snapshot.version = 3
      },
      'snapshot version must be 2',
    ],
    [
      'the wrong base record',
      (record: OwnerAuthoritativeManifestNext) => {
        record.basedOn = 'owner-authoritative-mimma-v0'
      },
      'must be based on owner-authoritative-mimma-v1',
    ],
    [
      'a remapped game',
      (record: OwnerAuthoritativeManifestNext) => {
        record.mappings.push({
          ...record.mappings[0],
          authoritativeGameId: 'auth-game-palworld',
          id: 'auth-map-steam-palworld-v1',
        })
      },
      'needs supersession',
    ],
  ])('rejects %s', (_label, breakRecord, message) => {
    const record = v2()
    breakRecord(record)

    expect(() => appendOwnerRecord(v1Rows, record, 'a'.repeat(64))).toThrow(message)
  })

  test('rejects a mapping that does not match the catalog', () => {
    expect(() =>
      assertMappingsMatchCatalog(history.v2Rows, [
        { id: 'steam-1085660', steamAppId: 1085660 },
        { id: 'steam-284160', steamAppId: 999 },
      ]),
    ).toThrow('auth-map-steam-beamng-drive-v1')
  })

  test('renders the committed 0007 migration from the record', () => {
    const sql = renderOwnerAuthoritativeMimmaV2Sql(history)

    expect(readFileSync(v2MigrationPath, 'utf8').replace(/\r\n?/g, '\n')).toBe(sql)
    expect(sql).toContain('AS owner_authoritative_v2_preflight;')
    expect(sql.match(/INSERT INTO authoritative_mimma_score_versions/g)).toHaveLength(10)
    expect(sql.match(/INSERT INTO authoritative_snapshot_members/g)).toHaveLength(12)
    expect(sql).not.toMatch(/\bUPDATE authoritative_(games|mimma_score_versions|game_mappings)\b/)
    expect(
      sql
        .trimEnd()
        .endsWith("WHERE id = 'snapshot-owner-authoritative-mimma-v2' AND state = 'draft';"),
    ).toBe(true)
  })
})
