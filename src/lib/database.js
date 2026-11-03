import fs from 'node:fs'
import path from 'node:path'

/**
 * Dependency-free JSON database: in-memory access + atomic (tmp + rename)
 * disk writes + scheduled autosave + save on exit. Replaces the old
 * lowdb/cloudDB layer of the original bot.
 */
export const SCHEMA_VERSION = 1
const BACKUP_KEEP = 7
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

const objectOrEmpty = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const normalizeData = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    schemaVersion: Number.isInteger(source.schemaVersion) && source.schemaVersion > 0
      ? source.schemaVersion
      : SCHEMA_VERSION,
    users: objectOrEmpty(source.users),
    chats: objectOrEmpty(source.chats),
    settings: objectOrEmpty(source.settings),
    stats: objectOrEmpty(source.stats),
    reminders: objectOrEmpty(source.reminders)
  }
}

const USER_DEFAULTS = () => ({
  name: '',
  exp: 0,
  limit: 15,
  level: 0,
  afk: -1,
  afkReason: '',
  locale: '',
  banned: false,
  lastclaim: 0,
  lastweekly: 0,
  premium: false,
  warnings: 0,
  msgs: 0,
  createdAt: Date.now()
})

const CHAT_DEFAULTS = () => ({
  isBanned: false,
  welcome: false,
  bye: false,
  detect: false,
  sWelcome: '',
  sBye: '',
  sPromote: '',
  sDemote: '',
  locale: '',
  antilink: false,
  antidelete: false,
  useDocument: false,
  warnings: {}
})

const SETTINGS_DEFAULTS = () => ({
  self: false,
  autoread: false,
  anticall: false,
  pconly: false,
  gconly: false
})

export const getLevel = (exp) => Math.floor(Math.sqrt(Math.max(exp, 0)) / 10) + 1

export const getNextLevelExp = (level) => level * level * 100

export class Database {
  constructor (file) {
    this.file = file
    this.data = normalizeData({})
    this._timer = null
    this._saving = false
    this._autosaveMs = 0
    this._lastSaved = null
    this._lastSavedAt = 0
    this._lastCheckedAt = 0
    this._lastSaveMs = 0
    this._lastBackupAt = 0
    this._backupSeq = 0
    this._saves = 0
    this._skips = 0
  }

  async load () {
    this._lastSaved = null
    let needsWrite = false
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        // Only refresh the boot backup after the file parsed successfully.
        // Copying first would overwrite a good backup with a corrupt payload.
        try { fs.copyFileSync(this.file, `${this.file}.backup`) } catch { /* ignore */ }
        const wasCurrent = raw?.schemaVersion === SCHEMA_VERSION
        this.data = normalizeData(raw)
        this.migrate()
        needsWrite = !wasCurrent
      }
    } catch (e) {
      // Back up the broken file and try the boot backup, else start fresh
      try { fs.copyFileSync(this.file, `${this.file}.corrupt.${Date.now()}`) } catch { /* ignore */ }
      try {
        if (fs.existsSync(`${this.file}.backup`)) {
          const raw = JSON.parse(fs.readFileSync(`${this.file}.backup`, 'utf8'))
          this.data = normalizeData(raw)
          this.migrate()
          // The main file is corrupt; force the next save to repair it.
          this._lastSaved = null
          return this.data
        }
      } catch { /* fall through to fresh state */ }
      this.data = normalizeData({})
      throw new Error(`database unreadable: ${e.message}`)
    }
    this._lastSaved = needsWrite ? null : JSON.stringify(this.data, null, 2)
    return this.data
  }

  /**
   * Apply schema migrations. Version 1 is the first explicit schema; future
   * migrations should be added here without touching the load path.
   */
  migrate () {
    if (!Number.isInteger(this.data.schemaVersion) || this.data.schemaVersion < SCHEMA_VERSION) {
      this.data.schemaVersion = SCHEMA_VERSION
    }
    return this.data.schemaVersion
  }

  /**
   * Persist the in-memory store. The payload is serialized once and compared
   * with the last successful write; an unchanged database skips disk I/O
   * unless `force` is requested.
   * @returns {Promise<boolean>} true when the file was written
   */
  async save ({ force = false } = {}) {
    if (this._saving) return false
    this._saving = true
    const started = Date.now()
    this._lastCheckedAt = started
    try {
      const json = JSON.stringify(this.data, null, 2)
      if (!force && json === this._lastSaved) {
        this._skips++
        this._lastSaveMs = Date.now() - started
        return false
      }

      const tmp = `${this.file}.tmp`
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(tmp, json)
      fs.renameSync(tmp, this.file)
      this._lastSaved = json
      this._lastSavedAt = Date.now()
      this._lastSaveMs = this._lastSavedAt - started
      this._saves++
      return true
    } finally {
      this._saving = false
    }
  }

  startAutosave (intervalMs = 60_000) {
    if (this._timer) clearInterval(this._timer)
    this._autosaveMs = intervalMs
    this._timer = setInterval(() => {
      this.save().catch(() => {})
      this.backupIfDue()
    }, intervalMs)
    this._timer.unref?.()
  }

  stop () {
    if (this._timer) clearInterval(this._timer)
    return this.save()
  }

  backupDir () {
    return path.join(path.dirname(this.file), 'backups')
  }

  backupFiles () {
    try {
      return fs.readdirSync(this.backupDir())
        .filter(name => /^database-.*\.json$/.test(name))
        .sort()
    } catch {
      return []
    }
  }

  /**
   * Write a timestamped snapshot and keep only the newest `keep` files.
   * Returns the created path and retention details.
   */
  backup ({ keep = BACKUP_KEEP } = {}) {
    const retain = Math.max(1, Number(keep) || BACKUP_KEEP)
    const dir = this.backupDir()
    fs.mkdirSync(dir, { recursive: true })

    this._backupSeq++
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(dir, `database-${stamp}-${this._backupSeq}.json`)
    fs.writeFileSync(file, JSON.stringify(this.data, null, 2))

    const files = this.backupFiles()
    const remove = files.slice(0, Math.max(0, files.length - retain))
    for (const name of remove) {
      try { fs.unlinkSync(path.join(dir, name)) } catch { /* ignore pruned file */ }
    }

    this._lastBackupAt = Date.now()
    return {
      file,
      dir,
      count: this.backupFiles().length,
      pruned: remove.length
    }
  }

  /** Automatic daily backup guard; returns null when not due. */
  backupIfDue ({ keep = BACKUP_KEEP, intervalMs = BACKUP_INTERVAL_MS } = {}) {
    if (this._lastBackupAt && Date.now() - this._lastBackupAt < intervalMs) return null
    try {
      return this.backup({ keep })
    } catch {
      return null
    }
  }

  /** Snapshot for diagnostics (`.dbstats`) without exposing the data itself. */
  info () {
    let size = 0
    try { size = fs.statSync(this.file).size } catch { /* not written yet */ }
    return {
      file: this.file,
      size,
      schemaVersion: this.data.schemaVersion,
      users: Object.keys(this.data.users).length,
      chats: Object.keys(this.data.chats).length,
      settings: Object.keys(this.data.settings).length,
      stats: Object.keys(this.data.stats).length,
      reminders: Object.keys(this.data.reminders).length,
      backups: this.backupFiles().length,
      backupDir: this.backupDir(),
      lastBackupAt: this._lastBackupAt,
      autosaveMs: this._autosaveMs,
      lastSavedAt: this._lastSavedAt,
      lastCheckedAt: this._lastCheckedAt,
      lastSaveMs: this._lastSaveMs,
      saves: this._saves,
      skips: this._skips
    }
  }

  // ---- Record creation / normalization (same spirit as the old handler) ----
  ensureUser (jid, name = '') {
    const users = this.data.users
    if (!users[jid] || typeof users[jid] !== 'object') users[jid] = USER_DEFAULTS()
    const user = users[jid]
    for (const [k, v] of Object.entries(USER_DEFAULTS())) {
      if (user[k] === undefined) user[k] = v
    }
    if (!user.name && name) user.name = name
    if (user.limit < 0) user.limit = 0
    return user
  }

  ensureChat (jid) {
    const chats = this.data.chats
    if (!chats[jid] || typeof chats[jid] !== 'object') chats[jid] = CHAT_DEFAULTS()
    const chat = chats[jid]
    for (const [k, v] of Object.entries(CHAT_DEFAULTS())) {
      if (chat[k] === undefined) chat[k] = v
    }
    if (!chat.warnings || typeof chat.warnings !== 'object' || Array.isArray(chat.warnings)) {
      chat.warnings = {}
    }
    return chat
  }

  settings (jid) {
    const s = this.data.settings
    if (!s[jid] || typeof s[jid] !== 'object') s[jid] = SETTINGS_DEFAULTS()
    const settings = s[jid]
    for (const [k, v] of Object.entries(SETTINGS_DEFAULTS())) {
      if (settings[k] === undefined) settings[k] = v
    }
    return settings
  }

  /** Track command usage stats. */
  bumpStat (command, ok) {
    const stat = this.data.stats[command] || { total: 0, success: 0, last: 0 }
    stat.total++
    if (ok) stat.success++
    stat.last = Date.now()
    this.data.stats[command] = stat
  }

  /** Award XP; returns the new level if leveled up, else null. */
  addExp (jid, amount) {
    const user = this.data.users[jid]
    if (!user) return null
    const before = getLevel(user.exp)
    user.exp += amount
    const after = getLevel(user.exp)
    if (after > before) {
      user.level = after
      return after
    }
    return null
  }
}

export default Database
