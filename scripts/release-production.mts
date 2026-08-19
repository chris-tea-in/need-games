import { execFile } from 'node:child_process'
import { mkdir, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { assertProductionD1Verification, productionDatabaseName } from './verify-production-d1.mjs'

const execFileAsync = promisify(execFile)
const productionConfigPath = '.wrangler.production.jsonc'
const productionReleaseLockPath = path.resolve('.wrangler', 'production-release.lock')
const releaseIdEnvironmentVariable = 'PRODUCTION_D1_DATABASE_ID'
const steamSignInEnvironmentVariable = 'STEAM_SIGN_IN_ENABLED'
const productionOriginEnvironmentVariable = 'PRODUCTION_ORIGIN'
const knownGamePath = '/api/games/counter-strike-2'
const expectedCatalogVersion = 'catalog-release-v1'
const expectedCatalogSize = 10

interface Command {
  command: string
  args: string[]
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

    await verifyProductionDatabase(databaseId, env)
    await runInherited(
      'Apply production D1 migrations before deployment',
      wranglerCommand([
        'd1',
        'migrations',
        'apply',
        productionDatabaseName,
        '--env',
        'production',
        '--config',
        productionConfigPath,
        '--remote',
      ]),
      env,
    )
    await runInherited(
      'Deploy read-only production Worker with Steam sign-in disabled',
      wranglerCommand(['deploy', '--env', 'production', '--config', productionConfigPath]),
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
