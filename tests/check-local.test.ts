import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test, vi } from 'vitest'

const repositoryUrl = new URL('../', import.meta.url)
const scriptUrl = new URL('../scripts/check-local.mjs', import.meta.url)
const scriptPath = fileURLToPath(scriptUrl)

interface TestCommand {
  args: string[]
  command: string
  label: string
}

function runCheckLocal(commands: readonly TestCommand[]) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: fileURLToPath(repositoryUrl),
    encoding: 'utf8',
    env: {
      ...process.env,
      NEED_GAMES_CHECK_LOCAL_TEST_COMMANDS: JSON.stringify(commands),
    },
  })
}

function successfulCommand(label: string, marker: string): TestCommand {
  return {
    args: ['-e', `console.log(${JSON.stringify(marker)})`],
    command: process.execPath,
    label,
  }
}

describe('check:local wrapper', () => {
  test('runs injected commands in order through Node process APIs', () => {
    const result = runCheckLocal([
      successfulCommand('first check', 'first'),
      successfulCommand('second check', 'second'),
    ])

    expect(result.status).toBe(0)
    expect(result.stdout.indexOf('first check')).toBeLessThan(result.stdout.indexOf('second check'))
    expect(result.stdout.indexOf('first')).toBeLessThan(result.stdout.indexOf('second'))
  })

  test('stops at the first failing command and returns its exit status', () => {
    const result = runCheckLocal([
      successfulCommand('before failure', 'before'),
      {
        args: ['-e', 'process.exit(23)'],
        command: process.execPath,
        label: 'failing check',
      },
      successfulCommand('after failure', 'after'),
    ])

    expect(result.status).toBe(23)
    expect(result.stdout).toContain('before failure')
    expect(result.stdout).toContain('failing check')
    expect(result.stdout).not.toContain('after failure')
  })

  test('contains no remote migration, deployment, database-create, or upload command', () => {
    const source = readFileSync(scriptUrl, 'utf8')

    expect(source).not.toMatch(/--remote|\bdeploy\b|d1\s+create|worker\s+upload/i)
  })

  test('includes the Worker-runtime suite before local migrations', () => {
    const source = readFileSync(scriptUrl, 'utf8')

    expect(source.indexOf("'Worker-runtime tests'")).toBeGreaterThan(-1)
    expect(source.indexOf("'Worker-runtime tests'")).toBeLessThan(
      source.indexOf("'Local D1 migrations'"),
    )
  })

  test('checks generated catalog artifacts before coverage tests', () => {
    const source = readFileSync(scriptUrl, 'utf8')

    expect(source.indexOf("'Generated catalog artifacts'")).toBeGreaterThan(-1)
    expect(source.indexOf("'Generated catalog artifacts'")).toBeLessThan(
      source.indexOf("'Coverage tests'"),
    )
  })

  test('checks generated MiMMa seed artifacts after catalog artifacts', () => {
    const source = readFileSync(scriptUrl, 'utf8')

    expect(source.indexOf("'Generated MiMMa seed artifact'")).toBeGreaterThan(-1)
    expect(source.indexOf("'Generated catalog artifacts'")).toBeLessThan(
      source.indexOf("'Generated MiMMa seed artifact'"),
    )
    expect(source.indexOf("'Generated MiMMa seed artifact'")).toBeLessThan(
      source.indexOf("'Coverage tests'"),
    )
  })

  test('checks the generated owner-authoritative record after the seed and before coverage', () => {
    const source = readFileSync(scriptUrl, 'utf8')
    const seed = source.indexOf("'Generated MiMMa seed artifact'")
    const ownerRecord = source.indexOf("'Generated owner-authoritative record'")
    const coverage = source.indexOf("'Coverage tests'")

    expect(seed).toBeGreaterThan(-1)
    expect(ownerRecord).toBeGreaterThan(seed)
    expect(ownerRecord).toBeLessThan(coverage)
  })

  test('force-kills an unresponsive Worker after graceful shutdown times out', async () => {
    const checkLocalUrl = new URL('../scripts/check-local.mjs?stop-worker-test', import.meta.url)
    const checkLocal = (await import(checkLocalUrl.href)) as {
      stopWorker?: (
        child: { exitCode: number | null; kill: (signal: NodeJS.Signals) => boolean },
        timeouts?: { forceTimeoutMilliseconds: number; gracefulTimeoutMilliseconds: number },
      ) => Promise<void>
    }
    expect(checkLocal.stopWorker).toBeTypeOf('function')

    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      kill: vi.fn(() => true),
    })
    await checkLocal.stopWorker?.(child, {
      forceTimeoutMilliseconds: 1,
      gracefulTimeoutMilliseconds: 1,
    })

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
  })
})
