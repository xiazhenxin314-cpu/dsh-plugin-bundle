#!/usr/bin/env node
// Compile against explicitly selected, existing host peers. Never discover
// profiles, install dependencies, create links, or modify the host installation.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const peers = resolve(process.env.DSH_NODE_MODULES ?? join(root, 'node_modules'))
let tsc = process.env.DSH_TSC
if (!tsc) {
  try { tsc = require.resolve('typescript/bin/tsc') } catch { /* diagnosed below */ }
}
if (!tsc || !existsSync(tsc)) {
  console.error('Set DSH_TSC to an existing TypeScript compiler and DSH_NODE_MODULES to the installed DSH peers.')
  process.exit(1)
}
const config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'))
config.compilerOptions.rootDir = join(root, 'src')
config.compilerOptions.outDir = join(root, 'lib')
config.compilerOptions.typeRoots = [join(peers, '@types')]
for (const name of Object.keys(config.compilerOptions.paths)) {
  config.compilerOptions.paths[name] = [join(peers, name, 'lib/types/index.d.ts')]
}
config.include = [join(root, 'src/**/*.ts')]
const temporary = mkdtempSync(join(tmpdir(), 'agy-build-'))
try {
  const configPath = join(temporary, 'tsconfig.json')
  writeFileSync(configPath, JSON.stringify(config))
  const check = process.argv.includes('--check')
  const result = spawnSync(process.execPath, [tsc, '-p', configPath, ...check ? ['--noEmit'] : []], { stdio: 'inherit' })
  if (result.status !== 0) process.exitCode = result.status ?? 1
  else if (!check) {
    const selection = readFileSync(join(root, 'src/model-selection.js'), 'utf8')
    const client = readFileSync(join(root, 'src/client.js'), 'utf8')
    writeFileSync(join(root, 'lib/client.js'), ';(() => {\n' + selection + '\n' + client + '\n})();\n')
    console.log('dsh-llm-antigravity-acp: built lib/')
  }
} finally {
  // Only this invocation's freshly-created temporary directory is removed.
  rmSync(temporary, { recursive: true, force: true })
}
