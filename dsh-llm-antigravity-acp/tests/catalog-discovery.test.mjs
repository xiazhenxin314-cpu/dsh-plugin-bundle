import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModelCatalog } from '../lib/catalog.js'

const cache = () => join(mkdtempSync(join(tmpdir(), 'agy-discovery-')), 'catalog.json')

test('fresh catalog has no invented models before ACP discovery', () => {
  const catalog = new ModelCatalog(cache())
  assert.deepEqual(catalog.list(), [])
  assert.equal(catalog.observed, false)
})

test('legacy cache cannot masquerade as an ACP discovered catalog', () => {
  const path = cache()
  writeFileSync(path, JSON.stringify({ models: [{ id: 'invented', name: 'Invented' }] }))
  const catalog = new ModelCatalog(path)
  assert.deepEqual(catalog.list(), [])
  assert.equal(catalog.observed, false)
})

test('models-only session response is real discovery, not a hardcoded family list', () => {
  const catalog = new ModelCatalog(cache())
  catalog.observe(undefined, [{ modelId: 'official-new-model', name: 'Official New Model' }])
  assert.deepEqual(catalog.list(), [{ id: 'official-new-model', name: 'Official New Model' }])
  assert.equal(catalog.observed, true)
})

test('an empty inventory never wipes an already discovered catalog', () => {
  const path = cache()
  const catalog = new ModelCatalog(path)
  assert.equal(catalog.observe(undefined, [{ modelId: 'official-new-model', name: 'Official New Model' }]), true)
  // A later session that reports no inventory (or an empty model option list)
  // must keep the last observation instead of blanking the picker.
  assert.equal(catalog.observe(undefined, []), false)
  assert.deepEqual(catalog.list(), [{ id: 'official-new-model', name: 'Official New Model' }])
  assert.equal(catalog.observe([{ id: 'model', options: [] }]), false)
  assert.deepEqual(catalog.list(), [{ id: 'official-new-model', name: 'Official New Model' }])
  // The persisted cache still holds the real discovery.
  assert.deepEqual(new ModelCatalog(path).list(), [{ id: 'official-new-model', name: 'Official New Model' }])
})
