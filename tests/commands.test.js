import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CommandRegistry } from '../src/core/commands.js'

const COMMANDS_DIR = fileURLToPath(new URL('../src/commands', import.meta.url))
const silent = { info () {}, warn () {}, error () {} }

test('validate rejects malformed command definitions', () => {
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  assert.equal(registry.validate({ name: 'ok', run () {} }), null)
  assert.match(registry.validate(null), /missing name/)
  assert.match(registry.validate({ name: 'no-run' }), /missing run/)
  assert.match(registry.validate({ name: 'bad name', run () {} }), /invalid name/)
})

test('loads a command file and resolves aliases', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-commands-'))
  fs.writeFileSync(
    path.join(dir, 'demo.mjs'),
    "export const commands = [{ name: 'demo', aliases: ['d'], category: 'test', run () {} }]\n"
  )
  const registry = new CommandRegistry(dir, { logger: silent, hotReload: false })
  await registry.loadFile(path.join(dir, 'demo.mjs'))

  assert.equal(registry.find('demo')?.name, 'demo')
  assert.equal(registry.find('D')?.name, 'demo')
  assert.equal(registry.byCategory().get('test')?.length, 1)
})

test('every bundled command file loads without duplicate registrations', async () => {
  const warnings = []
  const errors = []
  const registry = new CommandRegistry(COMMANDS_DIR, {
    logger: {
      info () {},
      warn: (message) => warnings.push(String(message)),
      error: (_error, message) => errors.push(String(message))
    },
    hotReload: false
  })
  await registry.loadAll()

  const files = fs.readdirSync(COMMANDS_DIR).filter((file) => file.endsWith('.js') && !file.startsWith('_'))
  assert.equal(errors.length, 0, errors.join('\n'))
  assert.equal(registry.files.size, files.length)
  assert.ok(registry.commands.size >= 50, `only ${registry.commands.size} command entries loaded`)
  assert.deepEqual(
    warnings.filter((warning) => warning.includes('already registered')),
    [],
    'duplicate command names or aliases found'
  )
})
