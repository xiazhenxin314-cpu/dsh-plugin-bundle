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
