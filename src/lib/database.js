import fs from 'node:fs'
import path from 'node:path'

/**
 * Dependency-free JSON database: in-memory access + atomic (tmp + rename)
 * disk writes + scheduled autosave + save on exit. Replaces the old
 * lowdb/cloudDB layer of the original bot.
 */
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
  useDocument: false
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
    this.data = { users: {}, chats: {}, settings: {}, stats: {} }
    this._timer = null
    this._saving = false
  }

  async load () {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        this.data = {
          users: raw.users || {},
          chats: raw.chats || {},
          settings: raw.settings || {},
          stats: raw.stats || {}
        }
      }
    } catch (e) {
      // Back up the broken file and start fresh
      try { fs.copyFileSync(this.file, `${this.file}.corrupt.${Date.now()}`) } catch { /* ignore */ }
      this.data = { users: {}, chats: {}, settings: {}, stats: {} }
      throw new Error(`database unreadable: ${e.message}`)
    }
    return this.data
  }

  async save () {
    if (this._saving) return
    this._saving = true
    try {
      const tmp = `${this.file}.tmp`
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
      fs.renameSync(tmp, this.file)
    } finally {
      this._saving = false
    }
  }

  startAutosave (intervalMs = 60_000) {
    if (this._timer) clearInterval(this._timer)
    this._timer = setInterval(() => this.save().catch(() => {}), intervalMs)
    this._timer.unref?.()
  }

  stop () {
    if (this._timer) clearInterval(this._timer)
    return this.save()
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
