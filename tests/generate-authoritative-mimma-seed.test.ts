import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { assertArtifactMatches } from '../scripts/generate-authoritative-mimma-seed.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('authoritative MiMMa seed artifact verification', () => {
  test('accepts a CRLF checkout when the generated content uses LF', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'need-games-mimma-'))
    temporaryDirectories.push(directory)
    const artifactPath = join(directory, 'artifact.sql')
    await writeFile(artifactPath, 'first line\r\nsecond line\r\n', 'utf8')

    expect(await readFile(artifactPath, 'utf8')).toContain('\r\n')
    expect(() => assertArtifactMatches(artifactPath, 'first line\nsecond line\n')).not.toThrow()
  })
})
