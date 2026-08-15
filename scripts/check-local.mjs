import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* global AbortSignal, clearTimeout, console, fetch, process, setTimeout */

const testCommandsEnvironmentVariable = 'NEED_GAMES_CHECK_LOCAL_TEST_COMMANDS'
const workerPort = 8798
const workerStartupTimeoutMilliseconds = 20_000
const requestTimeoutMilliseconds = 2_000

function localEnvironment() {
  return {
    ...process.env,
    CI: 'true',
    XDG_CONFIG_HOME: path.resolve('.wrangler', 'check-local-config'),
  }
}

function pnpmProcess() {
  if (process.platform === 'win32') {
    return {
      argsPrefix: [
        path.resolve(
          path.dirname(process.execPath),
          'node_modules',
          'corepack',
          'dist',
          'corepack.js',
        ),
        'pnpm',
      ],
      command: process.execPath,
    }
  }

  return { argsPrefix: ['pnpm'], command: 'corepack' }
}

function pnpmCommand(label, args) {
  const pnpm = pnpmProcess()
  return { args: [...pnpm.argsPrefix, ...args], command: pnpm.command, label }
}

function wranglerCommand(label, args) {
  return {
    args: [path.resolve('node_modules', 'wrangler', 'bin', 'wrangler.js'), ...args],
    command: process.execPath,
    label,
  }
}

function viteCommand(label, args) {
  return {
    args: [path.resolve('node_modules', 'vite', 'bin', 'vite.js'), ...args],
    command: process.execPath,
    label,
  }
}

const defaultCommands = [
  pnpmCommand('Format check', ['format:check']),
  pnpmCommand('Lint', ['lint']),
  pnpmCommand('Type check', ['typecheck']),
  pnpmCommand('Generated catalog artifacts', ['catalog:check']),
  pnpmCommand('Coverage tests', ['test:coverage']),
  pnpmCommand('Production build', ['build']),
  pnpmCommand('Worker type check', ['typecheck:worker']),
  pnpmCommand('Worker-runtime tests', ['test:worker']),
  wranglerCommand('Local D1 migrations', ['d1', 'migrations', 'apply', 'NEED_GAMES_DB', '--local']),
]

function parseTestCommands() {
  const value = process.env[testCommandsEnvironmentVariable]
  if (value === undefined) {
    return undefined
  }

  const commands = JSON.parse(value)
  if (
    !Array.isArray(commands) ||
    !commands.every(
      (command) =>
        typeof command === 'object' &&
        command !== null &&
        typeof command.command === 'string' &&
        typeof command.label === 'string' &&
        Array.isArray(command.args) &&
        command.args.every((argument) => typeof argument === 'string'),
    )
  ) {
    throw new Error(`${testCommandsEnvironmentVariable} must contain an array of process commands.`)
  }

  return commands
}

function runCommand({ args, command, label }) {
  console.log(`\n[check:local] ${label}`)

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: localEnvironment(),
      shell: false,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const error = new Error(
        `${label} failed${signal === null ? ` with exit code ${code}` : ` from ${signal}`}.`,
      )
      error.exitCode = code ?? 1
      reject(error)
    })
  })
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeoutMilliseconds) })
}

async function waitForWorker(baseUrl) {
  const deadline = Date.now() + workerStartupTimeoutMilliseconds
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/catalog`)
      if (response.status === 200) {
        return
      }
    } catch {
      // The local runtime may still be starting.
    }

    await wait(250)
  }

  throw new Error('The local Worker did not start before the timeout.')
}

async function assertJsonResponse(url, expectedStatus, expectedErrorCode) {
  const response = await fetchWithTimeout(url)
  if (response.status !== expectedStatus) {
    throw new Error(`${url} returned ${response.status}; expected ${expectedStatus}.`)
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`${url} did not return JSON.`)
  }

  const body = await response.json()
  if (expectedErrorCode !== undefined && body.error?.code !== expectedErrorCode) {
    throw new Error(`${url} did not return ${expectedErrorCode}.`)
  }
}

/** @param {import('node:child_process').ChildProcess} child @param {number} timeoutMilliseconds */
function waitForClose(child, timeoutMilliseconds) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMilliseconds)
    child.once('close', () => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ forceTimeoutMilliseconds?: number, gracefulTimeoutMilliseconds?: number }} options
 */
export async function stopWorker(
  child,
  { forceTimeoutMilliseconds = 5_000, gracefulTimeoutMilliseconds = 5_000 } = {},
) {
  if (child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')
  const closedGracefully = await waitForClose(child, gracefulTimeoutMilliseconds)
  if (!closedGracefully && child.exitCode === null) {
    child.kill('SIGKILL')
    await waitForClose(child, forceTimeoutMilliseconds)
  }
}

async function runWorkerSmokeTest() {
  const baseUrl = `http://127.0.0.1:${workerPort}`
  console.log('\n[check:local] Local Worker startup and smoke test')
  const workerCommand = viteCommand('Local Worker startup and smoke test', [
    '--host',
    '127.0.0.1',
    '--port',
    String(workerPort),
  ])
  const worker = spawn(workerCommand.command, workerCommand.args, {
    env: localEnvironment(),
    shell: false,
    stdio: 'inherit',
  })

  try {
    await waitForWorker(baseUrl)
    await assertJsonResponse(`${baseUrl}/api/catalog`, 200)
    await assertJsonResponse(`${baseUrl}/api/games/counter-strike-2`, 200)
    await assertJsonResponse(`${baseUrl}/api/games/counter-strike-2/similar`, 404, 'unscored_game')
    await assertJsonResponse(`${baseUrl}/api/games/not-a-game`, 404, 'game_not_found')

    const apiNavigationResponse = await fetchWithTimeout(`${baseUrl}/api/not-a-route`, {
      headers: { accept: 'text/html' },
    })
    const apiNavigationBody = await apiNavigationResponse.text()
    if (
      apiNavigationResponse.status !== 404 ||
      !apiNavigationResponse.headers.get('content-type')?.includes('application/json') ||
      apiNavigationBody.includes('<html')
    ) {
      throw new Error('API navigation did not preserve the JSON routing boundary.')
    }
  } finally {
    await stopWorker(worker)
  }
}

async function main() {
  const testCommands = parseTestCommands()
  for (const command of testCommands ?? defaultCommands) {
    await runCommand(command)
  }

  if (testCommands === undefined) {
    await runWorkerSmokeTest()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = typeof error?.exitCode === 'number' ? error.exitCode : 1
  })
}
