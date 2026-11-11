// Boot uses temp plugin data and a subprocess double that rejects every spawn.
// No profiles, real CLI, credentials or login files are accessed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config } from '../lib/config.js'
import { apply } from '../lib/index.js'

function boot(extra = {}) {
  const home = mkdtempSync(join(tmpdir(), 'agy-fixed-boot-'))
  const config = { ...Config({ home, warmup: false, autoPatch: false }), ...extra }
  const writes = []
  const settingsCards = []
  const providers = []
  const registrations = []
  const descriptors = []
  const cleanups = []
  let runtime
  const settings = {
    writable: true,
    async update(...args) { writes.push(args) },
    configure(options, fiber) {
      settingsCards.push({ options, fiber })
      return () => undefined
    },
  }
  const services = {
    subprocess: { spawn: () => assert.fail('a warmup:false boot must not invoke any CLI') },
    settings,
    typert: { register: contribution => { descriptors.push(contribution); return () => undefined } },
  }
  const ctx = {
    fiber: { entry: { options: { id: 'boot-test-provider' } } },
    get: key => services[key],
    logger: { info: () => undefined, warn: message => assert.fail(message) },
    emit: () => undefined,
    llm: {
      registerConfigurableProviders: rows => providers.push(...rows),
      registerAdapter: (routes, adapter) => registrations.push({ routes, adapter }),
    },
    effect: callback => { cleanups.push(callback()); return () => undefined },
    inject: (_keys, callback) => callback(ctx),
    plugin: (_remote, options) => { runtime = options.runtime },
  }
  apply(ctx, config)
  return { config, runtime, writes, settingsCards, providers, registrations, descriptors,
    async dispose() {
      await runtime.dispose()
      for (const cleanup of cleanups.reverse()) await cleanup?.()
      // home is a fresh mkdtemp result under the OS temp directory, never a profile.
      rmSync(home, { recursive: true, force: true })
    },
  }
}

test('boot registers the fixed system provider without a migration writeback', async () => {
  const mounted = boot({ accounts: [], useSystemAccount: false, configVersion: 0 })
  try {
    assert.equal(mounted.runtime.status().state, 'idle')
    assert.equal(mounted.runtime.status().accountLabel, '')
    assert.equal(Object.hasOwn(mounted.runtime.status(), 'accounts'), false)
    assert.deepEqual(mounted.writes, [])
    assert.equal(mounted.settingsCards.length, 1)
    assert.deepEqual(mounted.settingsCards[0].options, { auto: false })
    assert.deepEqual(mounted.providers.map(row => [row.provider, row.settingsNs]), [['antigravity', 'boot-test-provider']])
    assert.deepEqual(mounted.registrations[0].routes, ['antigravity'])
    assert.deepEqual(mounted.descriptors[0].invocations.map(item => item.method), ['status', 'warmup', 'configure'])
    assert.deepEqual(mounted.config.accounts, [], 'boot never rewrites a legacy stored account declaration')
    assert.equal(mounted.config.configVersion, 0, 'boot never stamps a migration version')
  } finally { await mounted.dispose() }
})

test('registration offers no hardcoded or allowlist-synthesized models before discovery', async () => {
  const mounted = boot({ visibleModels: ['never-discovered-model'] })
  try {
    assert.deepEqual(await mounted.registrations[0].adapter.listModels('antigravity'), [])
    assert.deepEqual(mounted.runtime.status().models, [])
    assert.deepEqual(mounted.writes, [])
  } finally { await mounted.dispose() }
})

test('boot keeps the live system remark and retained settings instead of snapshotting them', async () => {
  let accountLabel = 'first remark'
  let contextWindow = 128_000
  let defaultEffort = 'low'
  let longDecodeContinuations = 1
  const mounted = boot({
    accountLabel: { get: () => accountLabel }, contextWindow: { get: () => contextWindow },
    defaultEffort: { get: () => defaultEffort }, longDecodeContinuations: { get: () => longDecodeContinuations },
  })
  try {
    assert.equal(mounted.runtime.status().accountLabel, 'first remark')
    accountLabel = 'second remark'
    contextWindow = 512_000
    defaultEffort = 'medium'
    longDecodeContinuations = 5
    const status = mounted.runtime.status()
    assert.equal(status.accountLabel, 'second remark')
    assert.equal(status.configuredContextWindow, 512_000)
    assert.equal(status.defaultEffort, 'medium')
    assert.equal(status.longDecodeContinuations, 5)
    assert.deepEqual(mounted.writes, [])
  } finally { await mounted.dispose() }
})
