import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Database, SCHEMA_VERSION } from '../src/lib/database.js'
import { commands as ownerCommands } from '../src/commands/owner.js'
import { initI18n, t } from '../src/i18n/index.js'

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-backups-')), 'database.json')
const command = (name) => ownerCommands.find(def => def.name === name)

initI18n({ locale: 'en' })

test('old databases are normalized to the current schema version', async () => {
  const file = tmpFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({
    users: { 'a@s.whatsapp.net': { name: 'A' } },
    chats: {},
    settings: {},
    stats: {}
  }))

  const db = new Database(file)
  await db.load()
  assert.equal(db.data.schemaVersion, SCHEMA_VERSION)
  assert.deepEqual(db.data.reminders, {})

  await db.save()
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(raw.schemaVersion, SCHEMA_VERSION)
})

test('corrupt data recovers from the boot backup', async () => {
  const file = tmpFile()
  const db = new Database(file)
  db.ensureUser('a@s.whatsapp.net', 'A')
  await db.save()

  // A successful boot refreshes database.json.backup.
  const boot = new Database(file)
  await boot.load()

  fs.writeFileSync(file, '{not json')
  const recovered = new Database(file)
  await recovered.load()
  assert.equal(recovered.data.users['a@s.whatsapp.net'].name, 'A')
  assert.ok(fs.readdirSync(path.dirname(file)).some(name => name.includes('.corrupt.')))

  // Recovery must repair the main file rather than leaving it corrupt.
  await recovered.save()
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(raw.users['a@s.whatsapp.net'].name, 'A')
})

test('backups rotate and info reports schema and backup counts', async () => {
  const db = new Database(tmpFile())
  db.ensureUser('a@s.whatsapp.net', 'A')
  await db.save()

  db.backup({ keep: 2 })
  db.backup({ keep: 2 })
  db.backup({ keep: 2 })

  const files = fs.readdirSync(db.backupDir())
  assert.equal(files.length, 2)
  assert.equal(db.info().schemaVersion, SCHEMA_VERSION)
  assert.equal(db.info().backups, 2)
  assert.equal(db.info().backupDir, db.backupDir())
})

test('automatic backups are rate-limited', () => {
  const db = new Database(tmpFile())
  const first = db.backupIfDue({ intervalMs: 60_000 })
  const second = db.backupIfDue({ intervalMs: 60_000 })

  assert.ok(first)
  assert.equal(second, null)
  assert.equal(db.info().backups, 1)
})

test('dbbackup and dbstats expose the new fields', async () => {
  const db = new Database(tmpFile())
  db.ensureUser('a@s.whatsapp.net', 'A')
  await db.save()

  const replies = []
  const ctx = {
    db,
    locale: 'en',
    t: (key, params) => t('en', key, params),
    reply: async (text) => replies.push(text)
  }

  await command('dbbackup').run(ctx)
  assert.match(replies[0], /backup created/i)
  assert.equal(db.info().backups, 1)

  await command('dbstats').run(ctx)
  assert.match(replies.at(-1), /Schema: v1/)
  assert.match(replies.at(-1), /Backups: 1/)
})
