import { spawnSync } from 'node:child_process'
import path from 'node:path'

/* global process */

const wranglerPath = path.resolve('node_modules', 'wrangler', 'bin', 'wrangler.js')
const result = spawnSync(process.execPath, [wranglerPath, 'types', '--check'], {
  env: {
    ...process.env,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  },
  shell: false,
  stdio: 'inherit',
})

if (result.error !== undefined) {
  throw result.error
}

process.exitCode = result.status ?? 1
