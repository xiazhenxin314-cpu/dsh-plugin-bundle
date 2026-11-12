// Fork guard: this fork keeps credential handling out of the plugin on purpose.
// If a sync with upstream ever brings it back, this test fails before review can
// miss it. See UPSTREAM.md.
//
// Why these patterns and not "any Bearer header": the loopback MCP bridge mints
// its own per-tenant secret for the child process, and its doc comment mentions
// "Authorization: Bearer" while describing that local handshake. What must never
// come back is transporting the *Antigravity login* credential: reading the
// official CLI's token file, exchanging a refresh token, or calling Google
// directly. Those are the arms of the deleted quota/CloudCode feature.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountEnv } from '../lib/accounts.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const self = fileURLToPath(import.meta.url)

/** Every shipped source file, excluding this guard and any installed package. */
function shipped(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...shipped(path))
    else if (/\.(ts|js|mjs)$/.test(entry)) out.push(path)
  }
  return out
}

const FORBIDDEN = [
  [/\bcloudcode/i, 'the Cloud Code Assist transport'],
  [/refresh_token/i, 'an OAuth refresh token'],
  [/client_secret/i, 'an OAuth client secret'],
  [/\bya29\./, 'a Google access-token literal'],
  [/antigravity-oauth-token/i, "the official CLI's login credential file"],
  [/oauth2\.googleapis\.com|accounts\.google\.com/i, 'the Google OAuth endpoints'],
  [/['"`]curl['"`]/i, 'a curl invocation (argv is world-readable)'],
]

test('the plugin never transports the login credential itself', () => {
  const files = [...shipped(join(root, 'src')), ...shipped(join(root, 'lib'))].filter((path) => path !== self)
  const hits = []
  for (const path of files) {
    const text = readFileSync(path, 'utf8')
    for (const [pattern, why] of FORBIDDEN) {
      if (pattern.test(text)) hits.push(relative(root, path) + ' contains ' + why)
    }
  }
  assert.deepEqual(hits, [], 'credential handling belongs upstream only:\n' + hits.join('\n'))
})

test('the spawned CLI inherits the host environment instead of a credential set', () => {
  assert.deepEqual(accountEnv(), {})
})
