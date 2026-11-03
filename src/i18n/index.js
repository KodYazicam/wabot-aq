/**
 * Lightweight i18n engine: nested JSON locale files under src/i18n/locales,
 * dot-path lookup, {param} interpolation, graceful fallback chain
 * (user locale → chat locale → global default → en).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales')
const PLUGIN_LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins', 'locales')

/** level → role tier thresholds (names live in locale files: rpg.roles) */
export const ROLE_THRESHOLDS = [0, 3, 6, 10, 15, 21, 30, 45]

const data = {} // code → { flatKey: value }
let defaultLocale = 'en'

function flatten (obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}

/**
 * Merge plugin-owned locale files into the core catalog.
 *
 * Layout: plugins/locales/<plugin>/<code>.json
 * Keys are exposed as plugin.<plugin>.<key>. Files for locale codes that are
 * not bundled by the core are ignored, so availableLocales() never gains a
 * half-translated language.
 */
function loadPluginLocales (dir, logger) {
  if (!dir || !fs.existsSync(dir)) return 0
  let loaded = 0

  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    logger?.warn(`plugin locales directory failed to load: ${e.message}`)
    return 0
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const plugin = entry.name
    const namespace = plugin.replace(/[^a-zA-Z0-9_-]/g, '_')
    if (namespace !== plugin) {
      logger?.warn(`plugin locale namespace '${plugin}' sanitized to '${namespace}'`)
    }

    const pluginDir = path.join(dir, plugin)
    let files
    try {
      files = fs.readdirSync(pluginDir).filter(file => file.endsWith('.json'))
    } catch {
      continue
    }

    for (const file of files) {
      const code = path.basename(file, '.json').toLowerCase()
      if (!data[code]) {
        logger?.warn(`plugin locale '${plugin}/${file}' skipped: unsupported locale '${code}'`)
        continue
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(pluginDir, file), 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('root must be an object')
        }
        const flat = flatten(parsed)
        for (const [key, value] of Object.entries(flat)) {
          const fullKey = `plugin.${namespace}.${key}`
          if (data[code][fullKey] !== undefined) {
            logger?.warn(`plugin locale key '${fullKey}' already exists for '${code}', skipped`)
            continue
          }
          data[code][fullKey] = value
        }
        loaded++
      } catch (e) {
        logger?.warn(`plugin locale '${plugin}/${file}' failed to load: ${e.message}`)
      }
    }
  }

  return loaded
}

/** Load every *.json in the locales dir. Returns available locale codes. */
export function initI18n ({
  locale = 'en',
  logger,
  pluginLocaleDir = PLUGIN_LOCALES_DIR
} = {}) {
  const files = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'))
  for (const file of files) {
    const code = path.basename(file, '.json')
    try {
      data[code] = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8')))
    } catch (e) {
      logger?.warn(`locale '${code}' failed to load: ${e.message}`)
    }
  }
  if (!data.en) {
    data.en = {}
    logger?.warn("locale 'en' missing — fallbacks will be empty")
  }

  const pluginCount = loadPluginLocales(pluginLocaleDir, logger)
  if (pluginCount) logger?.debug?.(`loaded ${pluginCount} plugin locale file(s)`)

  defaultLocale = data[locale] ? locale : 'en'
  if (defaultLocale !== locale) logger?.warn(`locale '${locale}' not found, using '${defaultLocale}'`)
  return availableLocales()
}

export const availableLocales = () => Object.keys(data).sort()

/** First matching locale from a preference list (e.g. [user, chat, global]). */
export function resolveLocale (prefs = []) {
  for (const p of prefs) {
    if (p && data[p]) return p
  }
  return defaultLocale
}

/**
 * Translate a key. Supports {param} interpolation; array values are
 * returned as-is (use for lists such as jokes).
 */
export function t (locale, key, params = {}) {
  const chain = [locale, defaultLocale, 'en'].filter(Boolean)
  let value
  for (const code of chain) {
    if (data[code] && data[code][key] !== undefined) { value = data[code][key]; break }
  }
  if (value === undefined) return key
  if (typeof value !== 'string') return value
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  )
}

export const tArray = (locale, key) => {
  const v = t(locale, key)
  return Array.isArray(v) ? v : []
}

/** Role name for a given level (localized). */
export function getRoleName (locale, level) {
  const roles = tArray(locale, 'rpg.roles')
  if (!roles.length) return ''
  let tier = 0
  for (let i = 0; i < ROLE_THRESHOLDS.length; i++) {
    if (level >= ROLE_THRESHOLDS[i]) tier = i
  }
  return roles[Math.min(tier, roles.length - 1)]
}

export default { initI18n, availableLocales, resolveLocale, t, tArray, getRoleName }
