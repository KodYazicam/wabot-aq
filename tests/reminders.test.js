import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Database } from '../src/lib/database.js'
import { commands } from '../src/commands/reminders.js'
import { runDueReminders, startReminderScheduler } from '../src/core/scheduler.js'
import { initI18n, t } from '../src/i18n/index.js'

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-reminders-')), 'database.json')
const chat = '123@g.us'
const sender = '905000000001@s.whatsapp.net'
const command = (name) => commands.find(def => def.name === name)

initI18n({ locale: 'en' })

test('reminders round-trip through the database', async () => {
  const file = tmpFile()
  const db = new Database(file)
  db.data.reminders.test = {
    id: 'test',
    chat,
    sender,
    text: 'drink water',
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    attempts: 0
  }
  await db.save()

  const reloaded = new Database(file)
  await reloaded.load()
  assert.equal(reloaded.data.reminders.test.text, 'drink water')
})

test('due reminders are sent and removed, future reminders stay', async () => {
  const db = new Database(tmpFile())
  const now = Date.now()
  db.data.reminders.due = {
    id: 'due', chat, sender, text: 'now', dueAt: now - 1, createdAt: now, attempts: 0
  }
  db.data.reminders.later = {
    id: 'later', chat, sender, text: 'later', dueAt: now + 60_000, createdAt: now, attempts: 0
  }
  const sends = []
  const sock = { sendMessage: async (...args) => sends.push(args) }

  const sent = await runDueReminders({ db, sock, config: { locale: 'en' }, now })

  assert.equal(sent, 1)
  assert.equal(db.data.reminders.due, undefined)
  assert.equal(db.data.reminders.later.text, 'later')
  assert.equal(sends.length, 1)
  assert.equal(sends[0][0], chat)
  assert.match(sends[0][1].text, /reminder/i)
  assert.deepEqual(sends[0][1].mentions, [sender])
})

test('failed reminders are dropped after three attempts', async () => {
  const db = new Database(tmpFile())
  const now = Date.now()
  db.data.reminders.broken = {
    id: 'broken', chat, sender, text: 'nope', dueAt: now - 1, createdAt: now, attempts: 0
  }
  const sock = { sendMessage: async () => { throw new Error('offline') } }
  const warnings = []
  const logger = { warn: (...args) => warnings.push(args) }

  for (let i = 0; i < 3; i++) {
    await runDueReminders({ db, sock, config: { locale: 'en' }, logger, now })
  }

  assert.equal(db.data.reminders.broken, undefined)
  assert.ok(warnings.length >= 4, `expected retry warnings, got ${warnings.length}`)
})

test('remind, reminders and delremind work per chat and sender', async () => {
  const db = new Database(tmpFile())
  const replies = []
  const ctx = {
    db,
    m: { chat },
    sender,
    args: ['10m', 'drink', 'water'],
    usedPrefix: '.',
    locale: 'en',
    t: (key, params) => t('en', key, params),
    reply: async (text) => replies.push(text)
  }

  await command('remind').run(ctx)
  const reminder = Object.values(db.data.reminders)[0]
  assert.equal(reminder.text, 'drink water')
  assert.equal(reminder.chat, chat)
  assert.equal(reminder.sender, sender)
  assert.match(replies.at(-1), /Reminder set/)

  await command('reminders').run(ctx)
  assert.match(replies.at(-1), /Your reminders/)
  assert.match(replies.at(-1), /drink water/)

  const other = { ...ctx, sender: '905000000002@s.whatsapp.net', reply: async (text) => replies.push(text) }
  await command('delremind').run({ ...other, args: [reminder.id] })
  assert.match(replies.at(-1), /not found/)
  assert.ok(db.data.reminders[reminder.id])

  await command('delremind').run({ ...ctx, args: [reminder.id] })
  assert.equal(db.data.reminders[reminder.id], undefined)
  assert.match(replies.at(-1), /deleted/)
})

test('invalid reminder input shows usage', async () => {
  const db = new Database(tmpFile())
  const replies = []
  const ctx = {
    db,
    m: { chat },
    sender,
    args: ['nope'],
    usedPrefix: '.',
    locale: 'en',
    t: (key, params) => t('en', key, params),
    reply: async (text) => replies.push(text)
  }

  await command('remind').run(ctx)
  assert.match(replies[0], /Usage/)
  assert.equal(Object.keys(db.data.reminders).length, 0)
})

test('the scheduler sends due reminders on its interval', async () => {
  const db = new Database(tmpFile())
  db.data.reminders.due = {
    id: 'due', chat, sender, text: 'scheduled', dueAt: Date.now() - 1, createdAt: Date.now(), attempts: 0
  }
  let sent = 0
  const sock = { sendMessage: async () => { sent++ } }
  const stop = startReminderScheduler({
    db,
    getSock: () => sock,
    config: { locale: 'en' },
    logger: { warn () {}, error () {} },
    intervalMs: 10
  })

  await new Promise(resolve => setTimeout(resolve, 40))
  stop()
  assert.equal(sent, 1)
  assert.equal(Object.keys(db.data.reminders).length, 0)
})
