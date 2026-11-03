/**
 * Command loader & registry. Files in src/commands/ export a `commands` array.
 * Optional extra directories (plugins/) are loaded after the built-in tree,
 * and every loaded directory is watched for hot reload when enabled.
 */
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

export class CommandRegistry extends EventEmitter {
  constructor (dir, { logger, hotReload = true, extraDirs = [] } = {}) {
    super()
    this.dir = path.resolve(dir)
    this.extraDirs = extraDirs.map(d => path.resolve(d))
    this.dirs = [this.dir, ...this.extraDirs]
    this.logger = logger
    this.hotReload = hotReload
    /** @type {Map<string, object>} name → command definition */
    this.commands = new Map()
    /** @type {Map<string, string[]>} file → command names */
    this.files = new Map()
    this._watchers = []
  }

  async loadAll () {
    let files = 0
    let loadedDirs = 0

    for (const dir of this.dirs) {
      if (!fs.existsSync(dir)) {
        if (dir === this.dir) throw new Error(`command directory not found: ${dir}`)
        this.logger?.info(`plugin directory not found: ${dir} (skipped)`)
        continue
      }

      const entries = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'))
      for (const file of entries) {
        await this.loadFile(path.join(dir, file))
        files++
      }
      loadedDirs++
    }

    this.logger?.info(`loaded ${this.commands.size} commands (${files} files from ${loadedDirs} directories)`)
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
    if (this._watchers.length) return
    let timer = null

    for (const dir of this.dirs) {
      if (!fs.existsSync(dir)) continue
      try {
        const watcher = fs.watch(dir, { persistent: false }, (event, filename) => {
          if (!filename?.endsWith('.js')) return
          clearTimeout(timer)
          timer = setTimeout(() => {
            const file = path.join(dir, filename)
            this.logger?.info(`change detected: ${file}, reloading`)
            this.loadFile(file)
              .then(() => this.emit('reloaded', filename))
              .catch(() => {})
          }, 300)
        })
        watcher.on?.('error', () => { /* watch errors are non-fatal */ })
        this._watchers.push(watcher)
      } catch { /* watch unsupported — ignore silently */ }
    }
  }
}

export default CommandRegistry
