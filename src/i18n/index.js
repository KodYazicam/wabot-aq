/**
 * Lightweight i18n engine: nested JSON locale files under src/i18n/locales,
 * dot-path lookup, {param} interpolation, graceful fallback chain
 * (user locale → chat locale → global default → en).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales')

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

/** Load every *.json in the locales dir. Returns available locale codes. */
export function initI18n ({ locale = 'en', logger } = {}) {
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
