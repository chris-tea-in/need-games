import { execFile } from 'node:child_process'
import { mkdir, open, readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { assertProductionD1Verification, productionDatabaseName } from './verify-production-d1.mjs'

const execFileAsync = promisify(execFile)
const productionConfigPath = '.wrangler.production.jsonc'
const productionBuildEnvironmentName = 'production'
const productionWorkerName = 'myplayprint'
const productionClientDirectory = path.resolve('dist', 'client')
const productionReleaseLockPath = path.resolve('.wrangler', 'production-release.lock')
const releaseIdEnvironmentVariable = 'PRODUCTION_D1_DATABASE_ID'
const steamSignInEnvironmentVariable = 'STEAM_SIGN_IN_ENABLED'
const productionOriginEnvironmentVariable = 'PRODUCTION_ORIGIN'
const cloudflareEnvironmentVariable = 'CLOUDFLARE_ENV'
const cloudflareViteConfigPathVariable = 'CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH'
const cloudflareLoadDotEnvVariable = 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'
const knownGamePath = '/api/games/counter-strike-2'
const expectedCatalogVersion = 'catalog-release-v1'
const expectedCatalogSize = 10

interface Command {
  command: string
  args: string[]
}

interface ProductionAssetBoundaryCandidate {
  outputConfigPath: string
  clientDirectory: string
}

interface ProductionAssetBoundaryResult {
  assetFiles: string[]
}

interface GeneratedWorkerConfig {
  assets?: {
    directory?: unknown
  }
  d1_databases?: unknown
  main?: unknown
  name?: unknown
  targetEnvironment?: unknown
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath)
  return (
    relativePath.length === 0 || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  )
}

async function walkFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)))
    } else {
      files.push(entryPath)
    }
  }

  return files
}

function isEnvironmentFile(relativePath: string): boolean {
  const fileName = path.basename(relativePath)
  return /^\.dev\.vars(?:\..*)?$|^\.env(?:\..*)?$/i.test(fileName)
}

function hasDatabaseName(value: unknown): value is { database_name?: unknown } {
  return typeof value === 'object' && value !== null && 'database_name' in value
}

export async function assertProductionAssetBoundary({
  outputConfigPath,
  clientDirectory,
}: ProductionAssetBoundaryCandidate): Promise<ProductionAssetBoundaryResult> {
  let outputConfig: GeneratedWorkerConfig
  try {
    outputConfig = JSON.parse(await readFile(outputConfigPath, 'utf8')) as GeneratedWorkerConfig
  } catch (error: unknown) {
    throw new Error('Production release blocked: generated Vite Worker config is invalid.', {
      cause: error,
    })
  }

  if (typeof outputConfig.assets?.directory !== 'string') {
    throw new Error('Production release blocked: generated config has no assets directory.')
  }

  const configuredClientDirectory = path.resolve(
    path.dirname(outputConfigPath),
    outputConfig.assets.directory,
  )
  const expectedClientDirectory = path.resolve(clientDirectory)
  let configuredClientRealPath: string
  let expectedClientRealPath: string
  try {
    ;[configuredClientRealPath, expectedClientRealPath] = await Promise.all([
      realpath(configuredClientDirectory),
      realpath(expectedClientDirectory),
    ])
  } catch (error: unknown) {
    throw new Error(
      'Production release blocked: generated client asset directory is unavailable.',
      {
        cause: error,
      },
    )
  }
  if (configuredClientRealPath !== expectedClientRealPath) {
    throw new Error(
      'Production release blocked: generated assets directory is outside the client asset directory.',
    )
  }

  if (typeof outputConfig.main !== 'string' || outputConfig.main.trim().length === 0) {
    throw new Error('Production release blocked: generated config has no Worker output entrypoint.')
  }

  const workerEntrypoint = path.resolve(path.dirname(outputConfigPath), outputConfig.main)
  let workerEntrypointRealPath: string
  try {
    workerEntrypointRealPath = await realpath(workerEntrypoint)
  } catch (error: unknown) {
    throw new Error(
      'Production release blocked: generated Worker output entrypoint is unavailable.',
      {
        cause: error,
      },
    )
  }
  if (
    isPathInside(workerEntrypoint, expectedClientDirectory) ||
    isPathInside(workerEntrypointRealPath, expectedClientRealPath)
  ) {
    throw new Error(
      'Production release blocked: generated Worker output would be included in client assets.',
    )
  }

  let assetFiles: string[]
  try {
    assetFiles = await walkFiles(expectedClientDirectory)
  } catch (error: unknown) {
    throw new Error(
      'Production release blocked: generated client asset directory is unavailable.',
      {
        cause: error,
      },
    )
  }

  const relativeAssetFiles = await Promise.all(
    assetFiles.map(async (assetPath) => {
      let resolvedAssetPath: string
      try {
        resolvedAssetPath = await realpath(assetPath)
      } catch (error: unknown) {
        throw new Error('Production release blocked: generated asset path cannot be resolved.', {
          cause: error,
        })
      }
      if (!isPathInside(resolvedAssetPath, expectedClientRealPath)) {
        throw new Error(
          'Production release blocked: generated asset manifest contains a path outside the client asset directory.',
        )
      }

      return path.relative(expectedClientRealPath, resolvedAssetPath).split(path.sep).join('/')
    }),
  )

  const unsafeAsset = relativeAssetFiles.find(isEnvironmentFile)
  if (unsafeAsset !== undefined) {
    throw new Error(
      `Production release blocked: generated asset manifest contains an environment file (${unsafeAsset}).`,
    )
  }

  return { assetFiles: relativeAssetFiles.sort() }
}

async function findGeneratedProductionWorkerConfig(): Promise<string> {
  const candidatePaths = (await walkFiles(path.resolve('dist'))).filter(
    (filePath) => path.basename(filePath) === 'wrangler.json',
  )
  const matchingPaths: string[] = []

  for (const candidatePath of candidatePaths) {
    let candidate: GeneratedWorkerConfig
    try {
      candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as GeneratedWorkerConfig
    } catch (error: unknown) {
      throw new Error('Production release blocked: a generated Worker config is invalid.', {
        cause: error,
      })
    }

    const databases = Array.isArray(candidate.d1_databases) ? candidate.d1_databases : []
    const targetsProductionDatabase = databases.some(
      (database) => hasDatabaseName(database) && database.database_name === productionDatabaseName,
    )
    if (
      candidate.name === productionWorkerName &&
      candidate.targetEnvironment === productionBuildEnvironmentName &&
      targetsProductionDatabase
    ) {
      matchingPaths.push(candidatePath)
    }
  }

  if (matchingPaths.length !== 1) {
    throw new Error(
      `Production release blocked: expected exactly one generated ${productionWorkerName} Worker config, found ${matchingPaths.length}.`,
    )
  }

  return matchingPaths[0]
}

function pnpmCommand(args: readonly string[]): Command {
  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      args: [
        path.resolve(
          path.dirname(process.execPath),
          'node_modules',
          'corepack',
          'dist',
          'corepack.js',
        ),
        'pnpm',
        ...args,
      ],
    }
  }

  return { command: 'corepack', args: ['pnpm', ...args] }
}

function nodeScriptCommand(script: string, args: readonly string[] = []): Command {
  return {
    command: process.execPath,
    args: [script, ...args],
  }
}

function wranglerCommand(args: readonly string[]): Command {
  return nodeScriptCommand(path.resolve('node_modules', 'wrangler', 'bin', 'wrangler.js'), args)
}

function requireProductionDatabaseId(): string {
  const databaseId = process.env[releaseIdEnvironmentVariable]?.trim()
  if (databaseId === undefined || databaseId.length === 0) {
    throw new Error(
      `Production release blocked: set ${releaseIdEnvironmentVariable} in transient process state.`,
    )
  }

  return databaseId
}

function releaseEnvironment(databaseId: string): NodeJS.ProcessEnv {
  const requestedSteamSignIn = process.env[steamSignInEnvironmentVariable]?.trim().toLowerCase()
  if (requestedSteamSignIn !== undefined && requestedSteamSignIn !== 'false') {
    throw new Error('Production release blocked: Steam sign-in must remain disabled.')
  }

  return {
    ...process.env,
    [releaseIdEnvironmentVariable]: databaseId,
    [steamSignInEnvironmentVariable]: 'false',
  }
}

async function assertReviewedReleaseCommit(): Promise<void> {
  const { stdout: commit } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
  })
  const normalizedCommit = commit.trim()
  if (!/^[0-9a-f]{40}$/i.test(normalizedCommit)) {
    throw new Error('Production release blocked: the reviewed release commit could not be read.')
  }

  const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
  })
  if (status.trim().length > 0) {
    throw new Error(
      'Production release blocked: the working tree is not clean; release only the reviewed commit.',
    )
  }

  console.log(`[release:production] Reviewed release commit: ${normalizedCommit}`)
}

async function acquireReleaseLock(): Promise<() => Promise<void>> {
  await mkdir(path.dirname(productionReleaseLockPath), { recursive: true })

  let lockHandle
  try {
    lockHandle = await open(productionReleaseLockPath, 'wx')
    await lockHandle.writeFile(`pid=${process.pid}\n`)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        'Production release blocked: another owner-run release is already in progress.',
        { cause: error },
      )
    }
    throw error
  } finally {
    await lockHandle?.close()
  }

  return async () => {
    await unlink(productionReleaseLockPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    })
  }
}

async function runInherited(
  label: string,
  command: Command,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  console.log(`[release:production] ${label}`)
  await execFileAsync(command.command, command.args, {
    cwd: process.cwd(),
    env,
    shell: false,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  })
}

async function captureJson(
  label: string,
  command: Command,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  console.log(`[release:production] ${label}`)

  try {
    const { stdout } = await execFileAsync(command.command, command.args, {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return JSON.parse(stdout)
  } catch (error: unknown) {
    throw new Error(`${label} failed; release stopped before migration or deployment.`, {
      cause: error,
    })
  }
}

async function verifyProductionDatabase(databaseId: string, env: NodeJS.ProcessEnv): Promise<void> {
  const configArguments = ['--env', 'production', '--config', productionConfigPath]
  const info = await captureJson(
    'Read production D1 identity',
    wranglerCommand(['d1', 'info', productionDatabaseName, ...configArguments, '--json']),
    env,
  )
  const queryResults = await captureJson(
    'Read production D1 release state',
    wranglerCommand([
      'd1',
      'execute',
      productionDatabaseName,
      ...configArguments,
      '--remote',
      '--json',
      '--command',
      'SELECT dataset_version, schema_version FROM catalog_release_metadata; SELECT id, name FROM d1_migrations ORDER BY id;',
    ]),
    env,
  )

  assertProductionD1Verification({
    expectedDatabaseId: databaseId,
    expectedDatabaseName: productionDatabaseName,
    info,
    queryResults,
  })
  console.log('[release:production] Production D1 identity and release state verified.')
}

async function readOnlySmokeTest(origin: string): Promise<void> {
  const normalizedOrigin = new URL(origin)
  if (normalizedOrigin.protocol !== 'https:') {
    throw new Error('Production release blocked: PRODUCTION_ORIGIN must use HTTPS.')
  }

  async function request(pathname: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(new URL(pathname, normalizedOrigin), {
      signal: AbortSignal.timeout(5_000),
    })
    const body = await response.json().catch(() => undefined)
    return { status: response.status, body }
  }

  console.log('[release:production] Read-only production smoke test')
  const catalog = await request('/api/catalog')
  if (
    catalog.status !== 200 ||
    typeof catalog.body !== 'object' ||
    catalog.body === null ||
    !('datasetVersion' in catalog.body) ||
    catalog.body.datasetVersion !== expectedCatalogVersion ||
    !('games' in catalog.body) ||
    !Array.isArray(catalog.body.games) ||
    catalog.body.games.length !== expectedCatalogSize
  ) {
    throw new Error('Production smoke test failed: catalog release is not the read-only beta.')
  }

  const knownGame = await request(knownGamePath)
  if (knownGame.status !== 200) {
    throw new Error('Production smoke test failed: known game detail is unavailable.')
  }

  const unknownGame = await request('/api/games/not-a-game')
  if (unknownGame.status !== 404) {
    throw new Error('Production smoke test failed: unknown game route did not return 404.')
  }

  const unscoredSimilarGames = await request(`${knownGamePath}/similar`)
  if (unscoredSimilarGames.status !== 404) {
    throw new Error('Production smoke test failed: unscored similarity did not return 404.')
  }

  const unknownApiRoute = await request('/api/not-a-route')
  if (unknownApiRoute.status !== 404) {
    throw new Error('Production smoke test failed: unknown API route did not return 404.')
  }

  const session = await request('/api/session')
  if (session.status !== 404 && session.status !== 200) {
    throw new Error('Production smoke test failed: anonymous session status is unavailable.')
  }
  if (
    session.status === 200 &&
    typeof session.body === 'object' &&
    session.body !== null &&
    'authenticated' in session.body &&
    session.body.authenticated !== false
  ) {
    throw new Error('Production smoke test failed: the first release must remain anonymous.')
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--smoke-only')) {
    const origin = process.env[productionOriginEnvironmentVariable]?.trim()
    if (origin === undefined || origin.length === 0) {
      throw new Error(
        `Production smoke test blocked: set ${productionOriginEnvironmentVariable} in transient process state.`,
      )
    }

    const releaseLockCleanup = await acquireReleaseLock()
    try {
      await readOnlySmokeTest(origin)
    } finally {
      await releaseLockCleanup()
    }
    return
  }

  const databaseId = requireProductionDatabaseId()
  const env = releaseEnvironment(databaseId)
  const releaseLockCleanup = await acquireReleaseLock()

  try {
    await assertReviewedReleaseCommit()
    await runInherited('Full local verification', pnpmCommand(['check:local']), env)
    await runInherited('Tracked release guard', pnpmCommand(['release:check']), env)
    await runInherited(
      'Verify the authenticated owner Wrangler session',
      wranglerCommand(['whoami']),
      env,
    )
    await runInherited(
      'Create ignored production Wrangler configuration',
      nodeScriptCommand('scripts/create-production-wrangler-config.mts'),
      env,
    )

    const productionBuildEnvironment = {
      ...env,
      [cloudflareEnvironmentVariable]: productionBuildEnvironmentName,
      [cloudflareViteConfigPathVariable]: productionConfigPath,
      [cloudflareLoadDotEnvVariable]: 'false',
    }
    await runInherited(
      'Build production Vite Worker output with local dotenv loading disabled',
      pnpmCommand(['run', 'build']),
      productionBuildEnvironment,
    )

    const generatedWorkerConfigPath = await findGeneratedProductionWorkerConfig()
    const assetBoundary = await assertProductionAssetBoundary({
      outputConfigPath: generatedWorkerConfigPath,
      clientDirectory: productionClientDirectory,
    })
    console.log(
      `[release:production] Vite Worker output and client asset boundary verified (${assetBoundary.assetFiles.length} assets).`,
    )

    await verifyProductionDatabase(databaseId, env)
    await runInherited(
      'Deploy read-only production Worker with Steam sign-in disabled',
      wranglerCommand(['deploy', '--config', generatedWorkerConfigPath]),
      env,
    )

    const origin = process.env[productionOriginEnvironmentVariable]?.trim()
    if (origin === undefined || origin.length === 0) {
      console.log(
        `[release:production] Smoke test skipped; set ${productionOriginEnvironmentVariable} after the stable HTTPS origin is confirmed.`,
      )
      return
    }

    await readOnlySmokeTest(origin)
  } finally {
    await releaseLockCleanup()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Production release failed.')
    process.exitCode = 1
  })
}
