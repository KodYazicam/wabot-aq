import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Database } from '../src/lib/database.js'
import { commands, slotPayout } from '../src/commands/rpg.js'
import { initI18n, t } from '../src/i18n/index.js'

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-rpg-')), 'database.json')
const command = (name) => commands.find(def => def.name === name)
const sender = '905000000001@s.whatsapp.net'
const target = '905000000002@s.whatsapp.net'

initI18n({ locale: 'en' })

function makeCtx (db, overrides = {}) {
  const replies = []
  const user = db.ensureUser(sender, 'Sender')
  const ctx = {
    db,
    user,
    sender,
    usedPrefix: '.',
    locale: 'en',
    args: [],
    text: '',
    config: { limits: { weeklyClaim: 100, maxTransfer: 1000, maxSlotsBet: 1000 } },
    m: { mentionedJid: [], quoted: null },
    sock: { user: { id: '905000000099@s.whatsapp.net' } },
    t: (key, params) => t('en', key, params),
    reply: async (text, opts) => replies.push({ text, opts }),
    ...overrides
  }
  return { ctx, replies, user }
}

test('weekly claims are limited to one per week', async () => {
  const db = new Database(tmpFile())
  const { ctx, replies, user } = makeCtx(db)

  user.lastweekly = Date.now()
  await command('weekly').run(ctx)
  assert.equal(user.limit, 15)
  assert.match(replies.at(-1).text, /already claimed this week/)

  user.lastweekly = 0
  await command('weekly').run(ctx)
  assert.equal(user.limit, 115)
  assert.match(replies.at(-1).text, /Weekly reward claimed/)
})

test('transfers move limits and mention the receiver', async () => {
  const db = new Database(tmpFile())
  const { ctx, replies, user } = makeCtx(db)
  const receiver = db.ensureUser(target)
  user.limit = 100
  ctx.args = ['@user', '40']
  ctx.m.mentionedJid = [target]

  await command('transfer').run(ctx)

  assert.equal(user.limit, 60)
  assert.equal(receiver.limit, 55)
  assert.match(replies.at(-1).text, /Sent \*40\* limit/)
  assert.deepEqual(replies.at(-1).opts.mentions, [target])
})

test('transfers reject missing targets, self-transfers, bad amounts and low balances', async () => {
  const db = new Database(tmpFile())
  const { ctx, replies, user } = makeCtx(db)
  user.limit = 100

  await command('transfer').run(ctx)
  assert.match(replies.at(-1).text, /Usage/)

  ctx.args = ['@user', '10']
  ctx.m.mentionedJid = [sender]
  await command('transfer').run(ctx)
  assert.match(replies.at(-1).text, /can't transfer limits to yourself/)

  ctx.m.mentionedJid = [target]
  ctx.args = ['@user', '5000']
  await command('transfer').run(ctx)
  assert.match(replies.at(-1).text, /between 1 and 1000/)

  ctx.args = ['@user', '200']
  await command('transfer').run(ctx)
  assert.match(replies.at(-1).text, /only have 100 limit/)
  assert.equal(user.limit, 100)
})

test('slot payouts are triple, stake-back, or nothing', () => {
  assert.equal(slotPayout(['🍒', '🍒', '🍒'], 10), 30)
  assert.equal(slotPayout(['🍒', '🍒', '💎'], 10), 10)
  assert.equal(slotPayout(['🍒', '🔔', '💎'], 10), 0)
})

test('slots deducts the bet and pays a triple', async () => {
  const db = new Database(tmpFile())
  const { ctx, replies, user } = makeCtx(db)
  user.limit = 100
  ctx.args = ['10']

  const original = Math.random
  Math.random = () => 0
  try {
    await command('slots').run(ctx)
  } finally {
    Math.random = original
  }

  assert.equal(user.limit, 120)
  assert.match(replies.at(-1).text, /Triple/)
  assert.match(replies.at(-1).text, /30/)
})

test('slots validates the bet and the balance', async () => {
  const db = new Database(tmpFile())
  const { ctx, replies, user } = makeCtx(db)

  ctx.args = ['0']
  await command('slots').run(ctx)
  assert.match(replies.at(-1).text, /between 1 and 1000/)

  user.limit = 5
  ctx.args = ['10']
  await command('slots').run(ctx)
  assert.match(replies.at(-1).text, /at least 10 limit/)
  assert.equal(user.limit, 5)
})
