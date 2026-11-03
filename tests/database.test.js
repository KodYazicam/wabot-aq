import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Database, getLevel, getNextLevelExp } from '../src/lib/database.js'

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-db-')), 'database.json')

test('level maths stays monotonic', () => {
  assert.equal(getLevel(0), 1)
  assert.equal(getLevel(99), 1)
  assert.equal(getLevel(100), 2)
  assert.equal(getLevel(400), 3)
  assert.equal(getNextLevelExp(2), 400)
  assert.equal(getNextLevelExp(0), 0)
})

test('ensureUser fills defaults and clamps a negative limit', () => {
  const db = new Database(tmpFile())
  const user = db.ensureUser('905000000000@s.whatsapp.net', 'Tester')
  assert.equal(user.name, 'Tester')
  assert.equal(user.limit, 15)
  assert.equal(user.banned, false)
  user.limit = -5
  assert.equal(db.ensureUser('905000000000@s.whatsapp.net').limit, 0)
})

test('ensureChat and settings merge defaults', () => {
  const db = new Database(tmpFile())
  const chat = db.ensureChat('123@g.us')
  assert.equal(chat.antilink, false)
  assert.deepEqual(chat.warnings, {})
  chat.antilink = true
  chat.warnings['905000000000@s.whatsapp.net'] = { count: 2, reasons: ['spam'] }
  assert.equal(db.ensureChat('123@g.us').antilink, true)
  assert.equal(db.ensureChat('123@g.us').warnings['905000000000@s.whatsapp.net'].count, 2)
  assert.equal(db.settings('123@g.us').self, false)
})

test('addExp reports level-ups only', () => {
  const db = new Database(tmpFile())
  assert.equal(db.addExp('missing', 10), null)
  db.ensureUser('u@s.whatsapp.net')
  assert.equal(db.addExp('u@s.whatsapp.net', 100), 2)
  assert.equal(db.addExp('u@s.whatsapp.net', 1), null)
  assert.equal(db.data.users['u@s.whatsapp.net'].level, 2)
})

test('bumpStat tracks totals and successes', () => {
  const db = new Database(tmpFile())
  db.bumpStat('ping', true)
  db.bumpStat('ping', false)
  assert.deepEqual(
    { total: db.data.stats.ping.total, success: db.data.stats.ping.success },
    { total: 2, success: 1 }
  )
})

test('save and load round-trip the JSON store', async () => {
  const file = tmpFile()
  const db = new Database(file)
  db.ensureUser('a@s.whatsapp.net', 'A')
  db.data.stats.ping = { total: 1, success: 1, last: 123 }
  await db.save()

  const reloaded = new Database(file)
  await reloaded.load()
  assert.equal(reloaded.data.users['a@s.whatsapp.net'].name, 'A')
  assert.equal(reloaded.data.stats.ping.last, 123)
})

test('save skips unchanged data, force writes, and reports metrics', async () => {
  const file = tmpFile()
  const db = new Database(file)
  db.ensureUser('a@s.whatsapp.net', 'A')

  assert.equal(await db.save(), true)
  const first = db.info()
  assert.equal(first.users, 1)
  assert.ok(first.size > 0)
  assert.equal(first.saves, 1)
  assert.equal(first.skips, 0)
  assert.ok(first.lastSavedAt > 0)
  assert.ok(first.lastCheckedAt > 0)

  assert.equal(await db.save(), false)
  assert.equal(db.info().saves, 1)
  assert.equal(db.info().skips, 1)

  assert.equal(await db.save({ force: true }), true)
  assert.equal(db.info().saves, 2)

  db.data.users['a@s.whatsapp.net'].name = 'B'
  assert.equal(await db.save(), true)
  assert.equal(db.info().saves, 3)

  const reloaded = new Database(file)
  await reloaded.load()
  assert.equal(await reloaded.save(), false)
  assert.equal(reloaded.info().skips, 1)
})

test('corrupt data is backed up and reported', async () => {
  const file = tmpFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{not json')
  const db = new Database(file)
  await assert.rejects(() => db.load(), /database unreadable/)
  const files = fs.readdirSync(path.dirname(file))
  assert.ok(files.some((name) => name.includes('.corrupt.')))
})
