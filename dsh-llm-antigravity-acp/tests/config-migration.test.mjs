// The single system-account schema has no multi-account migration contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, current } from '../lib/config.js'
import * as entry from '../lib/index.js'

test('the configuration surface has a local remark, not account administration or quota', () => {
  const keys = Object.keys(Config.dict)
  for (const removed of ['accounts', 'configVersion', 'useSystemAccount', 'systemProfile', 'quotaTtlMs']) {
    assert.equal(keys.includes(removed), false, removed + ' must not be a setting')
  }
  for (const retained of ['accountLabel', 'visibleModels', 'contextWindow', 'defaultEffort', 'longDecodeContinuations']) {
    assert.ok(keys.includes(retained), retained + ' remains configurable')
  }
  for (const removed of ['liveAccounts', 'writeMigrationBack', 'migrateConfig', 'normalizeAccounts']) {
    assert.equal(Object.hasOwn(entry, removed), false)
  }
})

test('an empty configuration defaults to a blank remark without generating an account list', () => {
  const config = Config({})
  assert.equal(current(config.accountLabel), '')
  assert.deepEqual(current(config.visibleModels), [])
  assert.equal(current(config.contextWindow), 0)
  assert.equal(current(config.defaultEffort), 'high')
  assert.equal(current(config.longDecodeContinuations), 3)
  assert.equal(Object.hasOwn(config, 'accounts'), false)
  assert.equal(Object.hasOwn(config, 'configVersion'), false)
})

test('the local remark and retained settings parse without account or model synthesis', () => {
  const raw = Object.freeze({ accountLabel: 'Office machine', contextWindow: 256_000,
    defaultEffort: 'low', longDecodeContinuations: 0, visibleModels: ['fake-discovered-id'] })
  const config = Config(raw)
  assert.equal(current(config.accountLabel), 'Office machine')
  assert.deepEqual(current(config.visibleModels), ['fake-discovered-id'])
  assert.equal(current(config.contextWindow), 256_000)
  assert.equal(current(config.defaultEffort), 'low')
  assert.equal(current(config.longDecodeContinuations), 0)
  assert.equal(Object.hasOwn(config, 'accounts'), false)
  assert.equal(Object.hasOwn(raw, 'configVersion'), false)
})

test('the configuration remark shares Unicode normalization and its 64-codepoint limit', () => {
  assert.equal(current(Config({ accountLabel: '😀'.repeat(64) }).accountLabel), '😀'.repeat(64))
  assert.equal(current(Config({ accountLabel: '  work \n laptop  ' }).accountLabel), 'work laptop')
  assert.throws(() => Config({ accountLabel: '😀'.repeat(65) }))
})

test('possibly-volatile settings read their current values without a migration snapshot', () => {
  let remark = 'first'
  let models = []
  const remarkRef = { get: () => remark }
  const modelRef = { get: () => models }
  assert.equal(current(remarkRef), 'first')
  assert.deepEqual(current(modelRef), [])
  remark = 'second'
  models = ['fake-discovered-id']
  assert.equal(current(remarkRef), 'second')
  assert.deepEqual(current(modelRef), ['fake-discovered-id'])
  assert.equal(current('plain'), 'plain')
})
