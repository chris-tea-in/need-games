import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { assertProductionAssetBoundary } from '../scripts/release-production.mjs'

interface CandidateOptions {
  additionalDatabases?: ReadonlyArray<Record<string, string>>
  assetsDirectory?: string
  main?: string
  assetFiles?: readonly string[]
  databaseId?: string
  expectedSteamSignInMode?: 'true' | 'false'
  steamSignInEnabled?: string
}

const productionDatabaseId = '11111111-1111-4111-8111-111111111111'

async function createCandidate(options: CandidateOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'need-games-release-'))
  const workerDirectory = path.join(root, 'myplayprint_preview')
  const clientDirectory = path.join(root, 'client')
  await mkdir(workerDirectory, { recursive: true })
  await mkdir(clientDirectory, { recursive: true })
  await writeFile(path.join(workerDirectory, 'index.js'), 'worker output')

  for (const assetFile of options.assetFiles ?? ['index.html']) {
    const assetPath = path.join(clientDirectory, assetFile)
    await mkdir(path.dirname(assetPath), { recursive: true })
    await writeFile(assetPath, 'candidate asset')
  }

  const outputConfigPath = path.join(workerDirectory, 'wrangler.json')
  await writeFile(
    outputConfigPath,
    JSON.stringify({
      name: 'myplayprint',
      main: options.main ?? 'index.js',
      targetEnvironment: 'production',
      assets: {
        directory: options.assetsDirectory ?? '../client',
      },
      d1_databases: [
        {
          binding: 'NEED_GAMES_DB',
          database_name: 'need-games-production',
          database_id: options.databaseId ?? productionDatabaseId,
        },
        ...(options.additionalDatabases ?? []),
      ],
      vars: {
        STEAM_SIGN_IN_ENABLED: options.steamSignInEnabled ?? 'false',
      },
    }),
  )

  return {
    clientDirectory,
    expectedDatabaseId: productionDatabaseId,
    expectedSteamSignInMode: options.expectedSteamSignInMode ?? 'false',
    outputConfigPath,
  }
}

describe('production Vite output asset boundary', () => {
  test('accepts a generated Worker config whose assets are only the client build', async () => {
    const candidate = await createCandidate({ assetFiles: ['index.html', 'assets/app.js'] })

    const result = await assertProductionAssetBoundary(candidate)

    expect(result.assetFiles).toEqual(['assets/app.js', 'index.html'])
  })

  test('accepts an enabled generated Worker config only when enabled mode was reviewed', async () => {
    const candidate = await createCandidate({
      expectedSteamSignInMode: 'true',
      steamSignInEnabled: 'true',
    })

    await expect(assertProductionAssetBoundary(candidate)).resolves.toMatchObject({
      assetFiles: ['index.html'],
    })
  })

  test('rejects a Worker config that points assets outside the client directory', async () => {
    const candidate = await createCandidate({ assetsDirectory: '..' })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(
      /client asset directory/i,
    )
  })

  test.each(['.dev.vars', '.env'])('rejects secret file %s in the client assets', async (name) => {
    const candidate = await createCandidate({ assetFiles: ['index.html', name] })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(
      /environment|secret|asset/i,
    )
  })

  test('rejects a Worker entrypoint that is inside the client assets', async () => {
    const candidate = await createCandidate({ main: '../client/worker.js' })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(/Worker output/i)
  })

  test('rejects a Worker entrypoint that resolves to the client directory itself', async () => {
    const candidate = await createCandidate({ main: '../client' })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(/Worker output/i)
  })

  test('rejects a generated config bound to a different production D1 ID', async () => {
    const candidate = await createCandidate({
      databaseId: '22222222-2222-4222-8222-222222222222',
    })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(/database ID/i)
  })

  test('rejects a duplicate NEED_GAMES_DB binding', async () => {
    const candidate = await createCandidate({
      additionalDatabases: [
        {
          binding: 'NEED_GAMES_DB',
          database_id: '22222222-2222-4222-8222-222222222222',
          database_name: 'another-database',
        },
      ],
    })

    await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(/database ID/i)
  })

  test.each([
    { configured: 'true', reviewed: 'false' as const },
    { configured: 'false', reviewed: 'true' as const },
  ])(
    'rejects generated mode $configured when reviewed mode is $reviewed',
    async ({ configured, reviewed }) => {
      const candidate = await createCandidate({
        expectedSteamSignInMode: reviewed,
        steamSignInEnabled: configured,
      })

      await expect(assertProductionAssetBoundary(candidate)).rejects.toThrow(/Steam sign-in/i)
    },
  )
})
