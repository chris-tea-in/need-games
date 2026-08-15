import { readFile } from 'node:fs/promises'

const sentinelDatabaseId = '00000000-0000-4000-8000-000000000001'
const config = await readFile('wrangler.jsonc', 'utf8')

if (config.includes(sentinelDatabaseId)) {
  throw new Error(
    'Release blocked: replace the documented local preview D1 sentinel with an owner-approved D1 database ID.',
  )
}
