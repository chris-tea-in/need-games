import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

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
})
