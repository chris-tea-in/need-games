import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  assertArtifactMatches,
  scoresFromAuthoritativeRecord,
} from '../scripts/generate-catalog-artifacts.mts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('generated artifact verification', () => {
  test('accepts a CRLF checkout when the generated content uses LF', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'need-games-catalog-'))
    temporaryDirectories.push(directory)
    const artifactPath = join(directory, 'artifact.sql')
    await writeFile(artifactPath, 'first line\r\nsecond line\r\n', 'utf8')

    expect(await readFile(artifactPath, 'utf8')).toContain('\r\n')
    expect(() => assertArtifactMatches(artifactPath, 'first line\nsecond line\n')).not.toThrow()
  })
})

describe('snapshot scores from the owner-authoritative record', () => {
  const score = { macro: 30, meso: 20, micro: 10 }

  function mapping(overrides: Record<string, unknown>) {
    return {
      authoritativeGameId: 'auth-game-a',
      catalogGameId: 'steam-1',
      decision: 'verified',
      externalId: '1',
      provider: 'steam',
      version: 1,
      ...overrides,
    }
  }

  test('maps verified Steam mappings to catalog IDs with the snapshot version', () => {
    const scores = scoresFromAuthoritativeRecord({
      games: [{ id: 'auth-game-a', score }],
      mappings: [mapping({})],
      snapshot: { version: 3 },
    })

    expect([...scores]).toEqual([['steam-1', { ...score, snapshotVersion: 3 }]])
  })

  test('uses the latest mapping version and drops revoked or rejected mappings', () => {
    const scores = scoresFromAuthoritativeRecord({
      games: [
        { id: 'auth-game-a', score },
        { id: 'auth-game-b', score },
      ],
      mappings: [
        mapping({}),
        mapping({ decision: 'revoked', version: 2 }),
        mapping({
          authoritativeGameId: 'auth-game-b',
          catalogGameId: 'steam-2',
          decision: 'rejected',
          externalId: '2',
        }),
      ],
      snapshot: { version: 1 },
    })

    expect(scores.size).toBe(0)
  })

  test('drops games whose verified mappings conflict, like the Worker query', () => {
    const scores = scoresFromAuthoritativeRecord({
      games: [
        { id: 'auth-game-a', score },
        { id: 'auth-game-b', score },
        { id: 'auth-game-c', score },
      ],
      mappings: [
        mapping({}),
        mapping({ authoritativeGameId: 'auth-game-b', externalId: '2' }),
        mapping({
          authoritativeGameId: 'auth-game-c',
          catalogGameId: 'steam-3',
          externalId: '3',
          provider: 'epic',
        }),
      ],
      snapshot: { version: 1 },
    })

    expect(scores.size).toBe(0)
  })
})
