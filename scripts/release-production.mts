import { execFile } from 'node:child_process'
import { mkdir, open, readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  isObjectLiteralExpression,
  isPropertyAssignment,
  isStringLiteralLike,
  parseConfigFileTextToJson,
  parseJsonText,
  type ObjectLiteralExpression,
  type PropertyAssignment,
} from 'typescript'

import { requiredProductionSecretNames } from './create-production-wrangler-config.mjs'
import {
  assertProductionD1Verification,
  expectedProductionSchemaObjectNames,
  productionDatabaseName,
} from './verify-production-d1.mjs'

const execFileAsync = promisify(execFile)
const productionConfigPath = '.wrangler.production.jsonc'
const trackedConfigPath = 'wrangler.jsonc'
const productionBuildEnvironmentName = 'production'
const productionWorkerName = 'myplayprint'
const productionWorkerOrigin = 'https://myplayprint.e9k.workers.dev'
const productionClientDirectory = path.resolve('dist', 'client')
const productionReleaseLockPath = path.resolve('.wrangler', 'production-release.lock')
const productionRollbackDirectory = path.resolve('.wrangler', 'production-release')
const releaseIdEnvironmentVariable = 'PRODUCTION_D1_DATABASE_ID'
const steamSignInEnvironmentVariable = 'STEAM_SIGN_IN_ENABLED'
const productionOriginEnvironmentVariable = 'PRODUCTION_ORIGIN'
const cloudflareEnvironmentVariable = 'CLOUDFLARE_ENV'
const cloudflareViteConfigPathVariable = 'CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH'
const cloudflareLoadDotEnvVariable = 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV'
const knownGamePath = '/api/games/counter-strike-2'
const expectedCatalogVersion = 'catalog-release-v1'
const expectedCatalogSize = 10
const wranglerTrafficPercentageEpsilon = 1e-3

interface Command {
  command: string
  args: string[]
}

interface ProductionAssetBoundaryCandidate {
  outputConfigPath: string
  clientDirectory: string
  expectedDatabaseId: string
  expectedSteamSignInMode: SteamSignInMode
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
  vars?: unknown
}

interface ProductionRollbackBaseline {
  capturedAt: string
  deploymentCreatedOn: string
  reviewedCommit: string
  versions: Array<{
    percentage: number
    versionId: string
  }>
}

type ProductionFetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
type SteamSignInMode = 'true' | 'false'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireUniqueJsonObjectProperty(
  objectExpression: ObjectLiteralExpression,
  propertyName: string,
): PropertyAssignment {
  const matches = objectExpression.properties.filter(
    (property): property is PropertyAssignment =>
      isPropertyAssignment(property) &&
      isStringLiteralLike(property.name) &&
      property.name.text === propertyName,
  )
  if (matches.length !== 1) {
    throw new Error(
      'Production release blocked: Steam sign-in mode configuration is missing or ambiguous.',
    )
  }
  return matches[0]
}

function readSteamSignInModeFromJsonText(
  fileName: string,
  sourceText: string,
  objectPath: readonly string[],
): SteamSignInMode {
  const parsedConfig = parseConfigFileTextToJson(fileName, sourceText)
  const sourceFile = parseJsonText(fileName, sourceText)
  const rootExpression = sourceFile.statements[0]?.expression
  if (
    parsedConfig.error !== undefined ||
    sourceFile.statements.length !== 1 ||
    !isObjectLiteralExpression(rootExpression)
  ) {
    throw new Error('Production release blocked: Steam sign-in mode configuration is invalid.')
  }

  let currentObject = rootExpression
  for (const propertyName of objectPath) {
    const property = requireUniqueJsonObjectProperty(currentObject, propertyName)
    if (!isObjectLiteralExpression(property.initializer)) {
      throw new Error('Production release blocked: Steam sign-in mode configuration is invalid.')
    }
    currentObject = property.initializer
  }

  const modeProperty = requireUniqueJsonObjectProperty(
    currentObject,
    steamSignInEnvironmentVariable,
  )
  if (
    !isStringLiteralLike(modeProperty.initializer) ||
    (modeProperty.initializer.text !== 'true' && modeProperty.initializer.text !== 'false')
  ) {
    throw new Error(
      'Production release blocked: tracked Steam sign-in mode must be exactly true or false.',
    )
  }
  return modeProperty.initializer.text
}

export function assertProductionSteamSignInMode(
  trackedConfig: string,
  requestedMode: string | undefined,
): SteamSignInMode {
  const trackedMode = readSteamSignInModeFromJsonText(trackedConfigPath, trackedConfig, [
    'env',
    'production',
    'vars',
  ])
  if (requestedMode !== 'true' && requestedMode !== 'false') {
    throw new Error(
      'Production release blocked: explicitly confirm the tracked Steam sign-in mode as true or false.',
    )
  }
  if (requestedMode !== trackedMode) {
    throw new Error(
      'Production release blocked: requested Steam sign-in mode does not match tracked production configuration.',
    )
  }

  return trackedMode
}

async function requireProductionSteamSignInMode(): Promise<SteamSignInMode> {
  const trackedConfig = await readFile(trackedConfigPath, 'utf8')
  return assertProductionSteamSignInMode(trackedConfig, process.env[steamSignInEnvironmentVariable])
}

function describeSteamSignInMode(mode: SteamSignInMode): 'enabled' | 'disabled' {
  return mode === 'true' ? 'enabled' : 'disabled'
}

export function assertProductionSecretList(secretList: unknown): void {
  if (!Array.isArray(secretList)) {
    throw new Error('Production release blocked: required production secrets could not be read.')
  }

  for (const secret of secretList) {
    if (!isRecord(secret)) {
      throw new Error('Production release blocked: required production secrets are invalid.')
    }
    if ('value' in secret) {
      throw new Error('Production release blocked: secret value appeared in secret-list output.')
    }
  }

  const availableSecretNames = new Set(
    secretList
      .filter(
        (secret): secret is Record<string, unknown> =>
          isRecord(secret) && typeof secret.name === 'string' && secret.type === 'secret_text',
      )
      .map((secret) => secret.name as string),
  )
  const missingSecretNames = requiredProductionSecretNames.filter(
    (name) => !availableSecretNames.has(name),
  )
  if (missingSecretNames.length > 0) {
    throw new Error(
      `Production release blocked: required production secrets are missing: ${missingSecretNames.join(', ')}.`,
    )
  }
}

export function createProductionRollbackBaseline(
  deploymentStatus: unknown,
  capturedAt: string,
  reviewedCommit: string,
): ProductionRollbackBaseline {
  if (
    !isRecord(deploymentStatus) ||
    typeof deploymentStatus.created_on !== 'string' ||
    !Array.isArray(deploymentStatus.versions) ||
    deploymentStatus.versions.length === 0 ||
    !/^[0-9a-f]{40}$/i.test(reviewedCommit)
  ) {
    throw new Error('Production release blocked: rollback baseline is incomplete.')
  }

  const versions = deploymentStatus.versions.map((version) => {
    if (
      !isRecord(version) ||
      typeof version.version_id !== 'string' ||
      version.version_id.trim().length === 0 ||
      typeof version.percentage !== 'number' ||
      !Number.isFinite(version.percentage) ||
      version.percentage <= 0 ||
      version.percentage > 100
    ) {
      throw new Error('Production release blocked: rollback baseline has an invalid version.')
    }

    return {
      percentage: version.percentage,
      versionId: version.version_id,
    }
  })

  const totalPercentage = versions.reduce((total, version) => total + version.percentage, 0)
  if (Math.abs(totalPercentage - 100) > wranglerTrafficPercentageEpsilon) {
    throw new Error('Production release blocked: rollback baseline traffic must total 100%.')
  }

  return {
    capturedAt,
    deploymentCreatedOn: deploymentStatus.created_on,
    reviewedCommit,
    versions,
  }
}

async function persistProductionRollbackBaseline(
  baseline: ProductionRollbackBaseline,
): Promise<string> {
  await mkdir(productionRollbackDirectory, { recursive: true })
  const timestamp = baseline.capturedAt.replace(/[^0-9A-Za-z]/g, '-')
  const baselinePath = path.join(
    productionRollbackDirectory,
    `rollback-${timestamp}-${baseline.reviewedCommit.slice(0, 12)}.json`,
  )
  const baselineHandle = await open(baselinePath, 'wx', 0o600)
  try {
    await baselineHandle.writeFile(`${JSON.stringify(baseline, null, 2)}\n`)
  } finally {
    await baselineHandle.close()
  }
  return baselinePath
}

export async function assertProductionAssetBoundary({
  outputConfigPath,
  clientDirectory,
  expectedDatabaseId,
  expectedSteamSignInMode,
}: ProductionAssetBoundaryCandidate): Promise<ProductionAssetBoundaryResult> {
  let outputConfigSource: string
  let outputConfig: GeneratedWorkerConfig
  try {
    outputConfigSource = await readFile(outputConfigPath, 'utf8')
    outputConfig = JSON.parse(outputConfigSource) as GeneratedWorkerConfig
  } catch (error: unknown) {
    throw new Error('Production release blocked: generated Vite Worker config is invalid.', {
      cause: error,
    })
  }

  if (
    outputConfig.name !== productionWorkerName ||
    outputConfig.targetEnvironment !== productionBuildEnvironmentName
  ) {
    throw new Error('Production release blocked: generated config targets the wrong Worker.')
  }

  const databases: unknown[] = Array.isArray(outputConfig.d1_databases)
    ? outputConfig.d1_databases
    : []
  const productionBindings = databases.filter(
    (database): database is Record<string, unknown> =>
      isRecord(database) && database.binding === 'NEED_GAMES_DB',
  )
  if (
    productionBindings.length !== 1 ||
    productionBindings[0].database_name !== productionDatabaseName ||
    productionBindings[0].database_id !== expectedDatabaseId
  ) {
    throw new Error('Production release blocked: generated config has the wrong database ID.')
  }

  const generatedSteamSignInMode = readSteamSignInModeFromJsonText(
    outputConfigPath,
    outputConfigSource,
    ['vars'],
  )
  if (generatedSteamSignInMode !== expectedSteamSignInMode) {
    throw new Error(
      'Production release blocked: generated config Steam sign-in mode does not match the reviewed mode.',
    )
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
      (database) => isRecord(database) && database.database_name === productionDatabaseName,
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

function releaseEnvironment(
  databaseId: string,
  steamSignInMode: SteamSignInMode,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [releaseIdEnvironmentVariable]: databaseId,
    [steamSignInEnvironmentVariable]: steamSignInMode,
  }
}

async function assertReviewedReleaseCommit(): Promise<string> {
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
  return normalizedCommit
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
  const expectedSchemaObjectNames = expectedProductionSchemaObjectNames
    .map((name) => `'${name}'`)
    .join(', ')
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
      `SELECT dataset_version, schema_version FROM catalog_release_metadata;
SELECT id, name FROM d1_migrations ORDER BY id;
SELECT type, name, sql FROM sqlite_master WHERE name IN (${expectedSchemaObjectNames}) ORDER BY name;
SELECT
  (SELECT COUNT(*) FROM authoritative_mimma_seeds) AS authoritative_seed_count,
  (SELECT COUNT(*) FROM authoritative_mimma_scores) AS legacy_score_count,
  (SELECT COUNT(*) FROM authoritative_games) AS authoritative_game_count,
  (SELECT COUNT(*) FROM authoritative_mimma_score_versions) AS authoritative_score_version_count,
  (SELECT COUNT(*) FROM authoritative_snapshots) AS authoritative_snapshot_count,
  (SELECT COUNT(*) FROM authoritative_snapshot_members) AS authoritative_snapshot_member_count,
  (SELECT COUNT(*) FROM authoritative_game_mappings) AS authoritative_mapping_count,
  (SELECT COUNT(*) FROM authoritative_snapshots WHERE state = 'frozen') AS frozen_snapshot_count,
  (SELECT COUNT(*) FROM authoritative_games AS ag WHERE NOT EXISTS (
    SELECT 1 FROM authoritative_game_mappings AS agm WHERE agm.game_id = ag.id
  )) AS unmapped_authority_game_count;
SELECT
  id,
  version,
  state,
  expected_member_count,
  (SELECT COUNT(*) FROM authoritative_snapshot_members AS asm WHERE asm.snapshot_id = s.id) AS member_count,
  (SELECT COUNT(DISTINCT game_id) FROM authoritative_snapshot_members AS asm WHERE asm.snapshot_id = s.id) AS distinct_game_count,
  (SELECT COUNT(DISTINCT score_id) FROM authoritative_snapshot_members AS asm WHERE asm.snapshot_id = s.id) AS distinct_score_count,
  source_hash
FROM authoritative_snapshots AS s
WHERE id = 'snapshot-owner-authoritative-mimma-v1' AND version = 1;
SELECT game_id, provider, external_id, catalog_game_id, mapping_version, decision, source_hash
FROM authoritative_game_mappings
ORDER BY game_id, provider, mapping_version;
SELECT ag.id AS game_id
FROM authoritative_games AS ag
LEFT JOIN authoritative_game_mappings AS agm ON agm.game_id = ag.id
WHERE agm.id IS NULL
ORDER BY ag.id;
SELECT 'authoritative_games' AS source_table, COUNT(*) AS row_count,
  COUNT(DISTINCT introduced_source_hash) AS source_hash_count,
  MIN(introduced_source_hash) AS source_hash,
  MAX(introduced_source_hash) AS source_hash_max
FROM authoritative_games
UNION ALL
SELECT 'authoritative_mimma_score_versions', COUNT(*), COUNT(DISTINCT source_hash), MIN(source_hash), MAX(source_hash)
FROM authoritative_mimma_score_versions
UNION ALL
SELECT 'authoritative_snapshots', COUNT(*), COUNT(DISTINCT source_hash), MIN(source_hash), MAX(source_hash)
FROM authoritative_snapshots
UNION ALL
SELECT 'authoritative_game_mappings', COUNT(*), COUNT(DISTINCT source_hash), MIN(source_hash), MAX(source_hash)
FROM authoritative_game_mappings;`,
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

export function assertProductionSmokeOrigin(origin: string): URL {
  const normalizedOrigin = new URL(origin)
  if (normalizedOrigin.href !== `${productionWorkerOrigin}/`) {
    throw new Error(
      `Production release blocked: PRODUCTION_ORIGIN must be the stable production Worker origin (${productionWorkerOrigin}).`,
    )
  }
  return normalizedOrigin
}

function requireProductionOrigin(): string {
  const origin = process.env[productionOriginEnvironmentVariable]?.trim()
  if (origin === undefined || origin.length === 0) {
    throw new Error(
      `Production smoke test blocked: set ${productionOriginEnvironmentVariable} in transient process state.`,
    )
  }
  assertProductionSmokeOrigin(origin)
  return origin
}

export async function requestProductionJson(
  pathname: string,
  normalizedOrigin: URL,
  requester: ProductionFetcher = fetch,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await requester(new URL(pathname, normalizedOrigin), {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  })
  if (new URL(response.url).origin !== normalizedOrigin.origin) {
    throw new Error('Production smoke test failed: received a cross-origin response.')
  }
  const body = await response.json().catch(() => undefined)
  return { status: response.status, body }
}

export function assertAnonymousSessionResponse(
  status: number,
  body: unknown,
  steamSignInMode: SteamSignInMode,
): void {
  if (
    status !== 200 ||
    !isRecord(body) ||
    Object.keys(body).length !== 2 ||
    body.authenticated !== false ||
    body.steamSignInEnabled !== (steamSignInMode === 'true')
  ) {
    throw new Error('Production smoke test failed: anonymous session status is invalid.')
  }
}

function isExactAuthError(body: unknown, code: string, message: string): boolean {
  if (!isRecord(body) || Object.keys(body).length !== 1 || !isRecord(body.error)) {
    return false
  }
  return (
    Object.keys(body.error).length === 2 &&
    body.error.code === code &&
    body.error.message === message
  )
}

export function assertDisabledAuthStartResponse(status: number, body: unknown): void {
  if (
    status !== 503 ||
    !isExactAuthError(body, 'sign_in_disabled', 'Steam sign-in is currently unavailable.')
  ) {
    throw new Error('Production smoke test failed: disabled auth start is invalid.')
  }
}

export function assertMissingCsrfLogoutResponse(status: number, body: unknown): void {
  if (status !== 403 || !isExactAuthError(body, 'invalid_csrf', 'The logout request is invalid.')) {
    throw new Error('Production smoke test failed: missing-CSRF logout was not rejected.')
  }
}

export async function readOnlySmokeTest(
  origin: string,
  steamSignInMode: SteamSignInMode,
  requester: ProductionFetcher = fetch,
): Promise<void> {
  const normalizedOrigin = assertProductionSmokeOrigin(origin)
  const request = (pathname: string, init: RequestInit = {}) =>
    requestProductionJson(pathname, normalizedOrigin, requester, init)

  console.log(
    `[release:production] Read-only production smoke test (Steam sign-in ${describeSteamSignInMode(steamSignInMode)})`,
  )
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
  assertAnonymousSessionResponse(session.status, session.body, steamSignInMode)

  if (steamSignInMode === 'false') {
    const authStart = await request('/api/auth/steam/start?return=%2F')
    assertDisabledAuthStartResponse(authStart.status, authStart.body)
  }

  const logout = await request('/api/auth/logout', {
    method: 'POST',
  })
  assertMissingCsrfLogoutResponse(logout.status, logout.body)
}

async function main(): Promise<void> {
  if (process.argv.includes('--smoke-only')) {
    const origin = requireProductionOrigin()
    const steamSignInMode = await requireProductionSteamSignInMode()

    const releaseLockCleanup = await acquireReleaseLock()
    try {
      await readOnlySmokeTest(origin, steamSignInMode)
    } finally {
      await releaseLockCleanup()
    }
    return
  }

  const databaseId = requireProductionDatabaseId()
  const origin = requireProductionOrigin()
  const steamSignInMode = await requireProductionSteamSignInMode()
  const env = releaseEnvironment(databaseId, steamSignInMode)
  const releaseLockCleanup = await acquireReleaseLock()

  try {
    const reviewedCommit = await assertReviewedReleaseCommit()
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
    const productionSecrets = await captureJson(
      'Verify production Worker auth secret names',
      wranglerCommand([
        'secret',
        'list',
        '--env',
        'production',
        '--config',
        productionConfigPath,
        '--format',
        'json',
      ]),
      env,
    )
    assertProductionSecretList(productionSecrets)
    console.log('[release:production] Required production Worker auth secret names verified.')

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
      expectedDatabaseId: databaseId,
      expectedSteamSignInMode: steamSignInMode,
    })
    console.log(
      `[release:production] Vite Worker output and client asset boundary verified (${assetBoundary.assetFiles.length} assets; Steam sign-in ${describeSteamSignInMode(steamSignInMode)}).`,
    )

    await verifyProductionDatabase(databaseId, env)
    const deploymentStatus = await captureJson(
      'Capture current production Worker rollback baseline',
      wranglerCommand(['deployments', 'status', '--config', generatedWorkerConfigPath, '--json']),
      env,
    )
    const rollbackBaseline = createProductionRollbackBaseline(
      deploymentStatus,
      new Date().toISOString(),
      reviewedCommit,
    )
    const rollbackBaselinePath = await persistProductionRollbackBaseline(rollbackBaseline)
    console.log(
      `[release:production] Rollback baseline saved in ignored operator state: ${path.relative(process.cwd(), rollbackBaselinePath)}`,
    )
    await runInherited(
      `Deploy production Worker with Steam sign-in ${describeSteamSignInMode(steamSignInMode)}`,
      wranglerCommand(['deploy', '--config', generatedWorkerConfigPath]),
      env,
    )

    await readOnlySmokeTest(origin, steamSignInMode)
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
