// Fixed SYSTEM account layout; all filesystem mutations stay inside fake fixtures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountEnv, accountRemark, buildSystemLayout, ensureLayout, pluginHome } from '../src/accounts.ts'

test('buildSystemLayout always creates the SYSTEM account and only uses a local remark', t => {
  const root = mkdtempSync(join(tmpdir(), 'agy-account-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const layout = buildSystemLayout({ home: root, remark: '  Local   machine  ' })
  assert.equal(layout.id, 'default')
  assert.equal(layout.system, true)
  assert.equal(layout.label, 'Local machine')
  assert.equal(layout.root, undefined)
  assert.equal(layout.geminiDir, root)
  assert.equal(layout.appDir, join(root, 'agy'))
  assert.equal(layout.workspace, join(root, 'workspace'))
  assert.equal(layout.logFile, join(root, 'acp.log'))
  assert.equal(buildSystemLayout({ home: root }).label, 'SYSTEM')
  assert.equal(buildSystemLayout({ home: root, remark: '   ' }).label, 'SYSTEM')
  assert.deepEqual(readdirSync(root), [], 'building layout facts has no filesystem side effects')
})

test('accountRemark enforces the local Unicode character limit', () => {
  assert.equal(accountRemark('  my\n machine\tremark '), 'my machine remark')
  assert.equal(accountRemark('😀'.repeat(64)), '😀'.repeat(64))
  assert.throws(() => accountRemark('😀'.repeat(65)), /remark must be at most 64 characters/)
})

test('ensureLayout creates only isolated config and accountEnv leaves host authentication alone', t => {
  const root = mkdtempSync(join(tmpdir(), 'agy-account-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const isolated = join(root, 'isolated')
  const layout = buildSystemLayout({ home: isolated, remark: 'Local' })
  assert.deepEqual(accountEnv(), {})
  assert.equal(ensureLayout(layout), join(isolated, 'workspace'))
  assert.ok(existsSync(join(isolated, 'config', 'plugins', 'dsh-bridge', 'agents', 'dsh-bridge.md')))
  assert.deepEqual(readdirSync(root), ['isolated'])
  assert.deepEqual(readdirSync(layout.appDir).sort(), ['conversations', 'settings.json'])
  assert.equal(readFileSync(join(layout.appDir, 'settings.json'), 'utf8').includes('oauth'), false)
})

test('pluginHome uses only configured DSH cache location without reading a profile', t => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), 'fake-dsh-home')
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
  assert.equal(pluginHome(''), join(tmpdir(), 'fake-dsh-home', 'cache', 'antigravity-acp'))
  assert.equal(pluginHome('/configured-isolated-root'), '/configured-isolated-root')
})
