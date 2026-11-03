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
    'setbye', 'bye', 'gwarn', 'warnings', 'resetwarn', 'antilink', 'antidelete',
    'detect', 'opengroup', 'closegroup', 'setsubject', 'setdesc', 'del'
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

test('menu filters by category and unknown categories list valid options', async () => {
  initI18n({ locale: 'en' })
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  await registry.loadAll()

  const run = async (args) => {
    const replies = []
    await registry.find('menu').run({
      registry,
      config: { botName: 'wabot-aq' },
      usedPrefix: '.',
      locale: 'en',
      args,
      t: (key, params) => t('en', key, params),
      reply: async (text) => replies.push(text)
    })
    return replies[0]
  }

  const groupOnly = await run(['group'])
  assert.match(groupOnly, /👥 \*Group\*/)
  assert.doesNotMatch(groupOnly, /Downloaders/)
  assert.match(groupOnly, new RegExp(`📋 ${registry.byCategory().get('group').length} commands`))

  const unknown = await run(['nope'])
  assert.match(unknown, /Unknown category \*nope\*/)
  assert.match(unknown, /\.menu group/)

  const all = await run(['all'])
  assert.match(all, /Downloaders/)
  assert.match(all, /👥 \*Group\*/)
})

test('help searches names, aliases and descriptions', async () => {
  initI18n({ locale: 'en' })
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  await registry.loadAll()

  const run = async (args) => {
    const replies = []
    await registry.find('help').run({
      registry,
      config: { limits: { commandCooldown: 3 } },
      usedPrefix: '.',
      locale: 'en',
      args,
      t: (key, params) => t('en', key, params),
      reply: async (text) => replies.push(text)
    })
    return replies[0]
  }

  const search = await run(['download'])
  assert.match(search, /matches for/)
  assert.match(search, /yta|ytv|tiktok/)

  const exact = await run(['kick'])
  assert.match(exact, /\*kick\* — help/)
  assert.doesNotMatch(exact, /matches for/)

  const empty = await run(['zzzz'])
  assert.match(empty, /No commands match/)
})

test('group warnings are per chat and kick at three when the bot is admin', async () => {
  initI18n({ locale: 'en' })
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  await registry.loadAll()

  const target = '905000000001@s.whatsapp.net'
  const sender = '905000000002@s.whatsapp.net'
  const chat = { warnings: {} }
  const kicks = []
  const replies = []
  let botAdmin = false
  const ctx = {
    m: { chat: '123@g.us', mentionedJid: [target], quoted: null },
    args: ['spam'],
    text: 'spam',
    sender,
    chat,
    sock: {
      user: { id: '905000000003@s.whatsapp.net' },
      groupParticipantsUpdate: async (...args) => kicks.push(args)
    },
    t: (key, params) => t('en', key, params),
    reply: async (text, opts) => replies.push({ text, opts }),
    getAdminStatus: async () => ({ botAdmin, isAdmin: true })
  }

  const gwarn = registry.find('gwarn')
  await gwarn.run(ctx)
  assert.equal(chat.warnings[target].count, 1)
  assert.match(replies.at(-1).text, /1\/3 warnings/)
  assert.deepEqual(chat.warnings[target].reasons, ['spam'])

  await gwarn.run(ctx)
  await gwarn.run(ctx)
  assert.equal(chat.warnings[target].count, 3)
  assert.equal(kicks.length, 0)
  assert.match(replies.at(-1).text, /need to be a group admin/)

  botAdmin = true
  await gwarn.run(ctx)
  assert.equal(kicks.length, 1)
  assert.equal(kicks[0][2], 'remove')
  assert.equal(chat.warnings[target], undefined)
  assert.match(replies.at(-1).text, /reached 3 warnings and was removed/)

  await registry.find('warnings').run(ctx)
  assert.match(replies.at(-1).text, /has no warnings/)

  chat.warnings[target] = { count: 2, reasons: ['spam', 'links'] }
  await registry.find('warnings').run(ctx)
  assert.match(replies.at(-1).text, /2\/3 warnings/)
  assert.match(replies.at(-1).text, /spam; links/)

  await registry.find('resetwarn').run(ctx)
  assert.equal(chat.warnings[target], undefined)
  assert.match(replies.at(-1).text, /Warnings cleared/)
})

test('bye toggles goodbye messages', async () => {
  initI18n({ locale: 'en' })
  const registry = new CommandRegistry(COMMANDS_DIR, { logger: silent, hotReload: false })
  await registry.loadAll()
  const chat = { bye: false }
  const replies = []
  const ctx = {
    chat,
    t: (key, params) => t('en', key, params),
    reply: async (text) => replies.push(text)
  }

  await registry.find('bye').run(ctx)
  assert.equal(chat.bye, true)
  assert.match(replies[0], /Goodbye messages ON/)

  await registry.find('bye').run(ctx)
  assert.equal(chat.bye, false)
  assert.match(replies[1], /Goodbye messages OFF/)
})
