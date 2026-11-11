// Fake-fixture checks: startup preparation must not inspect host settings or login stores.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { prepareHome } from '../src/preflight.ts'

test('prepareHome isolates bridge configuration without copying host login or settings', t => {
  const root = mkdtempSync(join(tmpdir(), 'agy-preflight-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const fakeUser = join(root, 'fake-user')
  t.mock.method(os, 'homedir', () => fakeUser)
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })
  const fakeCli = join(fakeUser, '.gemini', 'antigravity-cli')
  mkdirSync(fakeCli, { recursive: true })
  writeFileSync(join(fakeCli, 'antigravity-oauth-token'), 'FAKE-NOT-A-CREDENTIAL')
  writeFileSync(join(fakeCli, 'settings.json'), JSON.stringify({ useG1Credits: true, model: 'host-only-model' }))
  const isolated = join(root, 'isolated')
  // An obsolete extra argument must never cause a read/copy from another home.
  assert.equal(prepareHome(isolated, fakeUser), join(isolated, 'workspace'))
  assert.equal(readdirSync(join(isolated, 'agy')).includes('antigravity-oauth-token'), false)
  const settings = JSON.parse(readFileSync(join(isolated, 'agy', 'settings.json'), 'utf8'))
  assert.equal(settings.model, 'Gemini 4 Argon (High)')
  assert.equal(settings.contextWindow, '512K')
  assert.equal(settings.toolPermission, 'request-review')
  assert.equal(settings.agentMode, '')
  assert.equal(Object.hasOwn(settings, 'useG1Credits'), false)
  const agent = readFileSync(join(isolated, 'config', 'plugins', 'dsh-bridge', 'agents', 'dsh-bridge.md'), 'utf8')
  assert.ok(agent.includes('tools: []'))
  assert.match(agent, /excludeDefaultComponents: true/)
  assert.equal(readFileSync(join(fakeCli, 'antigravity-oauth-token'), 'utf8'), 'FAKE-NOT-A-CREDENTIAL')
})

test('prepareHome retains explicit isolated settings and is idempotent', t => {
  const isolated = mkdtempSync(join(tmpdir(), 'agy-preflight-'))
  t.after(() => rmSync(isolated, { recursive: true, force: true }))
  for (const app of ['agy', 'antigravity-cli']) {
    mkdirSync(join(isolated, app), { recursive: true })
    writeFileSync(join(isolated, app, 'settings.json'), JSON.stringify({
      model: 'explicit-local-model', contextWindow: '1M', useG1Credits: false,
      toolPermission: 'always-allow', agentMode: 'old-mode', localOnly: 'keep',
    }))
  }
  prepareHome(isolated)
  const before = readFileSync(join(isolated, 'agy', 'settings.json'), 'utf8')
  prepareHome(isolated)
  assert.equal(readFileSync(join(isolated, 'agy', 'settings.json'), 'utf8'), before)
  for (const app of ['agy', 'antigravity-cli']) {
    assert.deepEqual(JSON.parse(readFileSync(join(isolated, app, 'settings.json'), 'utf8')), {
      model: 'explicit-local-model', contextWindow: '1M', useG1Credits: false,
      toolPermission: 'request-review', agentMode: '', localOnly: 'keep',
    })
  }
  assert.deepEqual(readdirSync(join(isolated, 'workspace')), [])
})
