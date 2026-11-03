import { parseArgs } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '..')

// Load .env if present
if (fs.existsSync(path.join(ROOT_DIR, '.env'))) {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ quiet: true })
}

// CLI flags (legacy flags from the original bot are preserved)
const { values: argv } = parseArgs({
  options: {
    session: { type: 'string' },
    prefix: { type: 'string' },
    server: { type: 'boolean' },
    'big-qr': { type: 'boolean' },
    debug: { type: 'boolean' },
    trace: { type: 'boolean' },
    selftest: { type: 'boolean' },
    offline: { type: 'boolean' }
  },
  allowPositionals: true,
  strict: false
})

export const args = argv

function env (key, fallback) {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function envBool (key, fallback) {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
}

function envInt (key, fallback) {
  const v = parseInt(process.env[key])
  return Number.isNaN(v) ? fallback : v
}

function envList (key, fallback) {
  const v = env(key, '')
  if (!v) return fallback
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

const botName = env('BOT_NAME', 'Aqua Bot')

export const config = {
  botName,
  owner: envList('OWNER', []).map(n => n.replace(/[^0-9]/g, '')).filter(Boolean),
  mods: envList('MODS', []).map(n => n.replace(/[^0-9]/g, '')).filter(Boolean),
  prefix: (argv.prefix || env('PREFIX', '.')).split('').filter(Boolean),
  locale: env('LOCALE', 'en').toLowerCase(),

  sessionName: argv.session || env('SESSION_NAME', 'aqua'),
  sessionDir: null, // filled by the connection module

  mode: env('MODE', 'public'), // public | self
  timezone: env('TZ', 'Europe/Istanbul'),

  webServer: {
    enabled: argv.server || envBool('WEB_SERVER', false),
    port: envInt('WEB_PORT', 3000),
    host: env('WEB_HOST', '0.0.0.0')
  },

  // SAFE_MODE=true disables host-level features (.exec) — recommended
  // when running on shared infrastructure.
  safeMode: envBool('SAFE_MODE', false),

  ai: {
    apiKey: env('AI_API_KEY', ''),
    baseUrl: env('AI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env('AI_MODEL', 'gpt-4o-mini')
  },

  limits: {
    maxFileSize: envInt('MAX_FILE_SIZE', 100 * 1024 * 1024),
    commandCooldown: envInt('COMMAND_COOLDOWN', 3),
    dailyClaim: 20,
    weeklyClaim: 100,
    startLimit: 15,
    maxTransfer: 1000,
    maxSlotsBet: 1000
  },

  sticker: {
    packname: env('STICKER_PACKNAME', botName),
    author: env('STICKER_AUTHOR', 'wabot-aq')
  },

  logLevel: argv.trace ? 'trace' : argv.debug ? 'debug' : env('LOG_LEVEL', 'info'),
  hotReload: envBool('HOT_RELOAD', true),

  dataDir: path.join(ROOT_DIR, 'data'),
  tmpDir: path.join(ROOT_DIR, 'tmp')
}

// Timezone for date formatting (Docker/VPS)
process.env.TZ = config.timezone

for (const dir of [config.dataDir, config.tmpDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

export default config
