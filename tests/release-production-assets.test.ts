import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { assertProductionAssetBoundary } from '../scripts/release-production.mjs'

interface CandidateOptions {
  assetsDirectory?: string
  main?: string
  assetFiles?: readonly string[]
}

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
      assets: {
        directory: options.assetsDirectory ?? '../client',
      },
    }),
  )

  return { clientDirectory, outputConfigPath }
}

describe('production Vite output asset boundary', () => {
  test('accepts a generated Worker config whose assets are only the client build', async () => {
    const candidate = await createCandidate({ assetFiles: ['index.html', 'assets/app.js'] })

    const result = await assertProductionAssetBoundary(candidate)

    expect(result.assetFiles).toEqual(['assets/app.js', 'index.html'])
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
})
