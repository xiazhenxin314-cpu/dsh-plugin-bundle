// Fake runtime/settings only: no CLI, profile, login, credential or quota calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { AntigravityRemote, INVOCATIONS, parseConfigureRequest } from '../lib/remote.js'

function mountRemote({ writable = true, rejectWrite = false, failWarmup = false } = {}) {
  const ctx = new Context()
  const writes = []
  ctx.provide('settings', {
    writable,
    async update(ns, values) {
      writes.push({ ns, values })
      if (rejectWrite) throw new Error('profile is read-only')
    },
  })
  const patches = []
  const warmups = []
  let state = { state: 'idle', accountLabel: '', models: [], visibleModels: [] }
  const runtime = {
    status: () => state,
    configure(patch) {
      patches.push(patch)
      state = { ...state, ...patch }
      return state
    },
    async warmup(...args) {
      warmups.push(args)
      state = failWarmup ? { ...state, state: 'error', error: 'fake discovery failed' } : { ...state, state: 'ready' }
      if (failWarmup) throw new Error('fake discovery failed')
    },
  }
  return { remote: new AntigravityRemote(ctx, { runtime, settingsNs: 'test-antigravity' }), writes, patches, warmups }
}

test('only status, catalog warmup and configure are remotely registered', () => {
  assert.deepEqual(INVOCATIONS.map(item => item.method), ['status', 'warmup', 'configure'])
  assert.deepEqual(INVOCATIONS.find(item => item.method === 'warmup').parameters, [])
  assert.equal(Object.hasOwn(INVOCATIONS.find(item => item.method === 'configure').parameters[0], 'acceptsUndefined'), false)
  for (const method of ['quota', 'accounts', 'login', 'loginCode', 'cancelLogin']) {
    assert.equal(typeof AntigravityRemote.prototype[method], 'undefined')
  }
})

test('configure accepts the system remark and retained live settings', () => {
  assert.deepEqual(parseConfigureRequest({
    accountLabel: '  本机工作账号  ', contextWindow: 512_000, defaultEffort: 'medium',
    longDecodeContinuations: 5, visibleModels: [' discovered-model ', 'discovered-model', 'another-model'],
  }), {
    accountLabel: '本机工作账号', contextWindow: 512_000, defaultEffort: 'medium',
    longDecodeContinuations: 5, visibleModels: ['discovered-model', 'another-model'],
  })
  assert.deepEqual(parseConfigureRequest({ accountLabel: ' ', contextWindow: 0, longDecodeContinuations: 0, visibleModels: [] }), {
    accountLabel: '', contextWindow: 0, longDecodeContinuations: 0, visibleModels: [],
  })
})

test('system remarks share the 64-codepoint bound and whitespace normalization', () => {
  assert.deepEqual(parseConfigureRequest({ accountLabel: '😀'.repeat(64) }), { accountLabel: '😀'.repeat(64) })
  assert.deepEqual(parseConfigureRequest({ accountLabel: '  work \n laptop  ' }), { accountLabel: 'work laptop' })
})

test('retired account, routing and quota fields never become live overrides', () => {
  assert.deepEqual(parseConfigureRequest({
    accounts: [{ id: 'other', system: false, env: { HOME: '/fake/other' } }],
    accountId: 'other', useSystemAccount: false, systemProfile: { enabled: false },
    configVersion: 2, quotaTtlMs: 5_000, home: '/fake/other', env: { HOME: '/fake/other' },
    accountLabel: 'Just a remark',
  }), { accountLabel: 'Just a remark' })
})

test('invalid supported configure values fail before a runtime or profile change', async () => {
  const { remote, patches, writes } = mountRemote()
  for (const payload of [null, [], 'bad', { accountLabel: 1 }, { accountLabel: 'x'.repeat(65) }, { accountLabel: '😀'.repeat(65) },
    { contextWindow: -1 }, { contextWindow: 1.5 }, { contextWindow: 1_048_577 }, { contextWindow: NaN },
    { defaultEffort: 'max' }, { longDecodeContinuations: 17 }, { longDecodeContinuations: -1 },
    { longDecodeContinuations: 1.5 }, { visibleModels: 'model' }, { visibleModels: [''] },
    { visibleModels: ['x'.repeat(201)] }, { visibleModels: Array(501).fill('model') },
  ]) await assert.rejects(remote.configure(payload), TypeError)
  assert.deepEqual(patches, [])
  assert.deepEqual(writes, [])
})

test('an explicit save applies and persists only supported normalized settings', async () => {
  const { remote, patches, writes } = mountRemote()
  const result = await remote.configure({ accountLabel: '  Laptop  ', defaultEffort: 'low', accounts: [] })
  assert.equal(result.accountLabel, 'Laptop')
  assert.deepEqual(patches, [{ accountLabel: 'Laptop', defaultEffort: 'low' }])
  assert.deepEqual(writes, [{ ns: 'test-antigravity', values: { accountLabel: 'Laptop', defaultEffort: 'low' } }])
  await remote.configure({ accountLabel: '' })
  assert.equal(remote.status().accountLabel, '')
  assert.deepEqual(writes.at(-1).values, { accountLabel: '' })
})

test('an empty or retired-only request does not write profiles or reconfigure runtime', async () => {
  const { remote, patches, writes } = mountRemote()
  await remote.configure({})
  await remote.configure({ accounts: [], useSystemAccount: false, configVersion: 0 })
  assert.deepEqual(patches, [])
  assert.deepEqual(writes, [])
})

test('unwritable or rejected profile saves retain the live setting', async () => {
  for (const options of [{ writable: false }, { rejectWrite: true }]) {
    const { remote, writes } = mountRemote(options)
    assert.equal((await remote.configure({ accountLabel: 'Local remark' })).accountLabel, 'Local remark')
    assert.equal(writes.length, options.writable === false ? 0 : 1)
  }
})

test('warmup has no account selection and returns runtime failures through status', async () => {
  for (const failWarmup of [false, true]) {
    const { remote, warmups, writes } = mountRemote({ failWarmup })
    const status = await remote.warmup()
    assert.deepEqual(warmups, [[]])
    assert.equal(status.state, failWarmup ? 'error' : 'ready')
    assert.deepEqual(writes, [])
  }
})

test('configure accepts display names and per-model renames, normalizing both', () => {
  assert.deepEqual(parseConfigureRequest({
    displayName: '  小臻   Antigravity ',
    modelNames: { 'gemini-4-argon': '  Argon   高速 ', 'gemini-3.8-flash': '   ' },
  }), {
    displayName: '小臻 Antigravity',
    // A blank name clears that override instead of storing an empty label.
    modelNames: { 'gemini-4-argon': 'Argon 高速' },
  })
})

test('configure rejects a blank provider name and malformed model name maps', () => {
  assert.throws(() => parseConfigureRequest({ displayName: '   ' }), /displayName/)
  assert.throws(() => parseConfigureRequest({ displayName: 7 }), /displayName/)
  assert.throws(() => parseConfigureRequest({ modelNames: { 'gemini-4-argon': 'x'.repeat(65) } }), /modelNames/)
  assert.throws(() => parseConfigureRequest({ modelNames: [] }), /modelNames/)
  assert.throws(() => parseConfigureRequest({ modelNames: { '  ': 'Fast' } }), /modelNames/)
})

test('configure persists both renames through the settings writer', async () => {
  const { remote, writes, patches } = mountRemote()
  await remote.configure({ displayName: '小臻 Antigravity', modelNames: { 'gemini-4-argon': '高速' } })
  assert.deepEqual(patches.at(-1), { displayName: '小臻 Antigravity', modelNames: { 'gemini-4-argon': '高速' } })
  assert.deepEqual(writes.at(-1), {
    ns: 'test-antigravity',
    values: { displayName: '小臻 Antigravity', modelNames: { 'gemini-4-argon': '高速' } },
  })
})
