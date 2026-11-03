import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CommandRegistry } from '../src/core/commands.js'
import { initI18n, t } from '../src/i18n/index.js'

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

test('loads commands from an extra plugin directory', async () => {
  const builtin = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-builtin-'))
  const plugins = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-plugins-'))
  fs.writeFileSync(
    path.join(builtin, 'base.js'),
    "export const commands = [{ name: 'base', run () {} }]\n"
  )
  fs.writeFileSync(
    path.join(plugins, 'extra.js'),
    "export const commands = [{ name: 'extra', aliases: ['x'], category: 'plugin', run () {} }]\n"
  )

  const registry = new CommandRegistry(builtin, {
    logger: silent,
    hotReload: false,
    extraDirs: [plugins]
  })
  await registry.loadAll()

  assert.equal(registry.find('base')?.name, 'base')
  assert.equal(registry.find('extra')?.name, 'extra')
  assert.equal(registry.find('x')?.name, 'extra')
  assert.equal(registry.files.size, 2)
  assert.equal(registry.byCategory().get('plugin')?.length, 1)
})

test('ignores a missing extra plugin directory', async () => {
  const builtin = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-builtin-'))
  fs.writeFileSync(
    path.join(builtin, 'base.js'),
    "export const commands = [{ name: 'base', run () {} }]\n"
  )

  const registry = new CommandRegistry(builtin, {
    logger: silent,
    hotReload: false,
    extraDirs: [path.join(builtin, 'does-not-exist')]
  })
  await registry.loadAll()

  assert.equal(registry.find('base')?.name, 'base')
  assert.equal(registry.files.size, 1)
})

test('the plugins command lists external command files', async () => {
  const plugins = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-plugins-'))
  fs.writeFileSync(
    path.join(plugins, 'demo.js'),
    "export const commands = [{ name: 'demo', category: 'other', run () {} }]\n"
  )
  const registry = new CommandRegistry(COMMANDS_DIR, {
    logger: silent,
    hotReload: false,
    extraDirs: [plugins]
  })
  await registry.loadAll()

  const replies = []
  await registry.find('plugins').run({
    registry,
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    reply: async (text) => replies.push(text)
  })

  assert.match(replies[0], /core\.pluginsHeader/)
  assert.match(replies[0], /demo\.js/)
  assert.match(replies[0], /demo/)
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

  const groupCommands = [
    'tagall', 'hidetag', 'kick', 'add', 'promote', 'demote',
    'grouplink', 'revoke', 'groupinfo', 'poll', 'welcome', 'setwelcome',
    'setbye', 'antilink', 'antidelete', 'detect', 'opengroup', 'closegroup',
    'setsubject', 'setdesc', 'del'
  ]
  for (const name of groupCommands) {
    assert.ok(registry.find(name), `missing group command: ${name}`)
  }
  assert.ok(registry.byCategory().get('group')?.length >= groupCommands.length)
})

test('menu shows localized category counts and the current locale', async () => {
  initI18n({ locale: 'de' })
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  await registry.loadAll()

  const replies = []
  await registry.find('menu').run({
    registry,
    config: { botName: 'wabot-aq' },
    usedPrefix: '.',
    locale: 'de',
    t: (key, params) => t('de', key, params),
    reply: async (text) => replies.push(text)
  })

  const text = replies[0]
  const commandCount = new Set(registry.commands.values()).size
  const groupCount = registry.byCategory().get('group').length
  assert.match(text, new RegExp(`📋 ${commandCount} Befehle`))
  assert.match(text, /🌍 Sprache: de/)
  assert.match(text, new RegExp(`👥 \\*Gruppe\\* · ${groupCount}`))
})
