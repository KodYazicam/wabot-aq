/**
 * Command loader & registry. Replaces the old plugins/ folder: files in
 * src/commands/ export a `commands` array. File changes are watched and
 * hot-reloaded (optional).
 */
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

export class CommandRegistry extends EventEmitter {
  constructor (dir, { logger, hotReload = true } = {}) {
    super()
    this.dir = dir
    this.logger = logger
    this.hotReload = hotReload
    /** @type {Map<string, object>} name → command definition */
    this.commands = new Map()
    /** @type {Map<string, string[]>} file → command names */
    this.files = new Map()
    this._watcher = null
  }

  async loadAll () {
    const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.js') && !f.startsWith('_'))
    for (const file of files) {
      await this.loadFile(path.join(this.dir, file))
    }
    this.logger?.info(`loaded ${this.commands.size} commands (${files.length} files)`)
    if (this.hotReload) this.watch()
    return this
  }

  async loadFile (file) {
    try {
      // ESM cache busting: fresh URL → fresh module
      const url = `${pathToFileURL(file).href}?t=${Date.now()}`
      const mod = await import(url)
      const defs = mod.commands || (mod.default && mod.default.name ? [mod.default] : null)
      if (!Array.isArray(defs)) {
        this.logger?.warn(`${file}: does not export a 'commands' array, skipped`)
        return
      }
      // Drop previous registrations from this file first
      for (const name of this.files.get(file) || []) this.commands.delete(name)
      const names = []
      for (const def of defs) {
        const err = this.validate(def)
        if (err) {
          this.logger?.warn(`${file}: '(${def?.name})' ${err}, skipped`)
          continue
        }
        for (const n of [def.name, ...(def.aliases || [])]) {
          if (typeof n !== 'string' || !n) continue
          const key = n.toLowerCase()
          if (this.commands.has(key) && !names.includes(key)) {
            this.logger?.warn(`command '${key}' already registered (overridden)`)
          }
          this.commands.set(key, def)
          names.push(key)
        }
      }
      this.files.set(file, names)
    } catch (e) {
      this.logger?.error({ err: e }, `failed to load command file: ${file}`)
    }
  }

  validate (def) {
    if (!def || typeof def.name !== 'string' || !def.name) return 'missing name'
    if (typeof def.run !== 'function') return 'missing run() function'
    if (!/^[a-z0-9-]+$/i.test(def.name)) return 'invalid name (a-z, 0-9, -)'
    return null
  }

  find (name) {
    return this.commands.get(String(name).toLowerCase()) || null
  }

  /** For menus: category → unique command definitions. */
  byCategory () {
    const cats = new Map()
    const seen = new Set()
    for (const def of this.commands.values()) {
      if (seen.has(def) || def.hidden) continue
      seen.add(def)
      const cat = def.category || 'other'
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat).push(def)
    }
    return cats
  }

  watch () {
    if (this._watcher) return
    let timer = null
    try {
      this._watcher = fs.watch(this.dir, { persistent: false }, (event, filename) => {
        if (!filename?.endsWith('.js')) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          this.logger?.info(`change detected: ${filename}, reloading`)
          this.loadFile(path.join(this.dir, filename))
            .then(() => this.emit('reloaded', filename))
            .catch(() => {})
        }, 300)
      })
    } catch { /* watch unsupported — ignore silently */ }
  }
}

export default CommandRegistry
