import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256 } from '../scripts/generate-owner-authoritative-mimma.mts'
import { EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V2_SHA256 } from '../scripts/owner-authority-history.mts'
import {
  authoritativeRecords,
  productionMigrations,
  readReleasedCatalog,
} from '../scripts/release-manifest.mts'
import { catalogSnapshot } from '../src/ui/generated/catalog-snapshot.js'

const migrationsDirectory = new URL('../migrations/', import.meta.url)

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('release manifest', () => {
  test('lists every migration file in order, so none ships unverified', () => {
    const files = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith('.sql'))
      .sort()

    expect(productionMigrations.map(({ name }) => name)).toEqual(files)
  })

  test('pins each migration to its current content', () => {
    for (const { name, sha256: expected } of productionMigrations) {
      const source = readFileSync(new URL(name, migrationsDirectory), 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n')
      expect(sha256(source), name).toBe(expected)
    }
  })

  test('pins each owner-authoritative record the generators also pin, oldest first', () => {
    expect(authoritativeRecords.map(({ sha256: pinned }) => pinned)).toEqual([
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V1_SHA256,
      EXPECTED_OWNER_AUTHORITATIVE_MIMMA_V2_SHA256,
    ])
    for (const record of authoritativeRecords) {
      expect(sha256(readFileSync(record.url, 'utf8'))).toBe(record.sha256)
    }
  })

  test('reads the released catalog the UI snapshot was generated from', () => {
    expect(readReleasedCatalog()).toEqual({
      datasetVersion: catalogSnapshot.datasetVersion,
      gameCount: catalogSnapshot.games.length,
    })
  })
})
