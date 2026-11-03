/**
 * wabot-aq 3.0 — modern WhatsApp bot (Baileys 7, multi-language)
 * Entry point: config → i18n → database → commands → connection.
 */
import os from 'node:os'
import path from 'node:path'
import { config, args } from './config.js'
import { createLogger } from './lib/logger.js'
import { initI18n } from './i18n/index.js'
import Database from './lib/database.js'
import { CommandRegistry } from './core/commands.js'
import { startConnection } from './core/connection.js'
import { attachHandler } from './core/handler.js'
import { attachEvents } from './core/events.js'
import { checkFfmpeg } from './lib/media.js'
import { hasYtDlp } from './lib/youtube.js'

// ---------------------------------------------------------------------------
// Runtime guard: fail fast with a clear message on old Node versions
// ---------------------------------------------------------------------------
const [nodeMajor] = process.versions.node.split('.').map(Number)
if (nodeMajor < 22) {
  console.error(`❌ Node.js ${process.versions.node} is too old. wabot-aq needs Node ≥ 22.`)
  console.error('   Install a current version: https://nodejs.org/en/download')
  process.exit(1)
}

const logger = createLogger('bot', config.logLevel)

const banner = `
  ██╗    ██╗ █████╗ ██╗     ██╗  ██╗ ██████╗ ███████╗
  ██║    ██║██╔══██╗██║     ██║ ██╔╝██╔═══██╗██╔════╝
  ██║ █╗ ██║███████║██║     █████╔╝ ██║   ██║███████╗
  ██║███╗██║██╔══██║██║     ██╔═██╗ ██║   ██║╚════██║
  ╚███╔███╔╝██║  ██║███████╗██║  ██╗╚██████╔╝███████║
   ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
  ────────────────────────────────────────────────────
   wabot-aq 3.0 · Baileys 7 · Node ${process.version}
   Bot: ${config.botName} · Owner: ${config.owner.join(', ') || '(not set!)'}
   Prefix: ${config.prefix.join(' ')} · Locale: ${config.locale} · Session: ${config.sessionName}
  ────────────────────────────────────────────────────`

// ---------------------------------------------------------------------------
// Self-test: verify setup and external services without connecting
// ---------------------------------------------------------------------------
async function selfTest () {
  console.log('🧪 wabot-aq self-test starting…\n')
  let ok = true

  const ff = await checkFfmpeg()
  console.log(`${ff.ffmpeg ? '✅' : '❌'} ffmpeg ${ff.ffmpeg ? '(installed)' : '(MISSING — sticker/video conversions will not work)'}${ff.ffmpeg && !ff.webp ? ' ⚠️ no libwebp' : ''}`)
  if (!ff.ffmpeg) ok = false

  try {
    const sharp = (await import('sharp')).default
    const buf = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#ff0000' } })
      .webp().toBuffer()
    console.log(`✅ sharp (test image: ${buf.length} bytes)`)
  } catch (e) {
    console.log(`❌ sharp: ${e.message}`)
    ok = false
  }

  try {
    const { addExif } = await import('./lib/media.js')
    const sharp = (await import('sharp')).default
    const webp = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00ff00' } }).webp().toBuffer()
    const sticker = await addExif(webp, 'test', 'selftest')
    console.log(`✅ sticker EXIF (${sticker.length} bytes)`)
  } catch (e) {
    console.log(`❌ sticker EXIF: ${e.message}`)
    ok = false
  }

  const locales = initI18n({ locale: config.locale, logger: console })
  console.log(`✅ i18n (locales: ${locales.join(', ')})`)

  try {
    const db = new Database(path.join(config.dataDir, 'database.json'))
    db.ensureUser('905000000000@s.whatsapp.net', 'Test')
    console.log(`✅ database (created ${Object.keys(db.data.users).length} test user)`)
  } catch (e) {
    console.log(`❌ database: ${e.message}`)
    ok = false
  }

  const registry = new CommandRegistry(path.resolve('src', 'commands'), {
    logger: console,
    hotReload: false,
    extraDirs: [path.resolve('plugins')]
  })
  await registry.loadAll()
  console.log(`✅ commands (${registry.commands.size} entries loaded)`)

  if (args.offline) {
    console.log('ℹ️ offline mode — skipping external API checks')
  } else {
    const { fetchJson } = await import('./lib/utils.js')
    for (const [name, url] of Object.entries({
      'Google Translate': 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=hello',
      'Open-Meteo': 'https://api.open-meteo.com/v1/forecast?latitude=41&longitude=29&current=temperature_2m',
      Wikipedia: 'https://tr.wikipedia.org/api/rest_v1/page/summary/Ankara'
    })) {
      try {
        await fetchJson(url, {}, 10_000)
        console.log(`✅ ${name} API reachable`)
      } catch (e) {
        console.log(`⚠️ ${name} API unreachable: ${e.message}`)
      }
    }
  }

  console.log(config.ai.apiKey
    ? '✅ AI key set — the .ai command is active'
    : 'ℹ️ no AI key — set AI_API_KEY in .env to enable the .ai command')

  console.log(`\n${ok ? '🎉' : '⚠️'} self-test finished ${ok ? 'successfully' : 'with issues'}.`)
  console.log(`   First time here? Run the setup wizard: npm run setup`)
  console.log('   Start the bot with: npm start\n')
  process.exit(ok ? 0 : 1)
}

if (args.selftest) await selfTest()

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------
console.log(banner)

const locales = initI18n({ locale: config.locale, logger })
if (!config.owner.length) {
  logger.warn('OWNER is not set! Run `npm run setup` or set OWNER=<number> in .env — otherwise owner commands won\'t work.')
}

// Environment diagnostics with per-OS fix hints
const ffmpeg = await checkFfmpeg()
if (!ffmpeg.ffmpeg) {
  logger.warn('ffmpeg is NOT installed — sticker/video commands will not work. Install it:')
  logger.warn('  Ubuntu/Debian: sudo apt install ffmpeg | Arch: sudo pacman -S ffmpeg')
  logger.warn('  macOS: brew install ffmpeg     | Termux: pkg install ffmpeg')
  logger.warn('  Windows: winget install Gyan.FFmpeg (then restart the terminal)')
} else if (!ffmpeg.webp) {
  logger.warn('ffmpeg lacks libwebp — animated stickers may fail. Use your distro\'s full ffmpeg package.')
} else {
  logger.info('✅ ffmpeg ready (stickers, media conversions)')
}

if (await hasYtDlp()) {
  logger.info('✅ yt-dlp detected — extra YouTube download engine available')
}

if (config.safeMode) {
  logger.info('🔒 SAFE_MODE is on — host commands (.exec) are disabled')
}

const db = new Database(path.join(config.dataDir, 'database.json'))
try {
  await db.load()
} catch (e) {
  logger.error(`${e.message} — starting with a fresh database (a .corrupt.* backup was kept)`)
}
db.startAutosave(60_000)

const registry = new CommandRegistry(path.resolve('src', 'commands'), {
  logger,
  hotReload: config.hotReload,
  extraDirs: [path.resolve('plugins')]
})
await registry.loadAll()

let lastSock = null

startConnection({
  config,
  logger,
  onOpen: async (sock, { isNew }) => {
    // Handlers re-attach on every fresh socket
    if (sock !== lastSock) {
      lastSock = sock
      attachHandler({ sock, db, registry, config, logger })
      attachEvents({ sock, db, config, logger })
    }

    const settings = db.settings(sock.user.id)
    if (config.mode === 'self') settings.self = true
    try {
      await sock.updateProfileName(config.botName)
    } catch { /* cosmetic — ignore */ }

    if (isNew) logger.info('🆕 new session registered. Bot is ready!')
  }
})

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    logger.info(`${signal} received — saving data and exiting`)
    await db.stop().catch(() => {})
    process.exit(0)
  })
}
process.on('unhandledRejection', e => logger.error({ err: e }, 'unhandled rejection'))
process.on('uncaughtException', e => logger.error({ err: e }, 'uncaught exception'))

// Periodic status summary (every 30 min)
setInterval(() => {
  logger.info({
    ram: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`,
    users: Object.keys(db.data.users).length,
    chats: Object.keys(db.data.chats).length
  }, `running · ${os.hostname()}`)
}, 30 * 60_000).unref()
