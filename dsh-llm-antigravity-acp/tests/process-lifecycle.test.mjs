// The idle sweep and every dispose close an ACP process the same way a crash
// does; only the runtime knows which one it was, so stop() has to say so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AcpProcess } from '../lib/acp-process.js'

const deadSpawn = () => {
  throw new Error('a stopped process must not spawn anything')
}

const make = () => new AcpProcess({
  argv: [],
  cwd: '/',
  spawn: deadSpawn,
  clientName: 'test',
  clientVersion: '0.0.0',
})

test('a running process is not marked as an intentional stop', () => {
  assert.equal(make().intentionalStop, false)
})

test('stop() marks the exit as deliberate and still reports a cause', () => {
  const proc = make()
  const seen = []
  proc.onExit((error) => seen.push(error.message))
  proc.stop()
  assert.equal(proc.intentionalStop, true, 'the runtime needs to tell this apart from a crash')
  assert.deepEqual(seen, ['ACP process stopped'])
})
