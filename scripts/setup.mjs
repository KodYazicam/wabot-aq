#!/usr/bin/env node
/**
 * wabot-aq interactive setup wizard.
 *
 *   npm run setup
 *
 * Asks friendly questions, validates the answers and writes a ready-to-use
 * .env file. Safe to re-run: an existing .env is never overwritten without
 * confirmation.
 */
import readline from 'node:readline/promises'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, '.env')
const LOCALES = fs.readdirSync(path.join(ROOT, 'src', 'i18n', 'locales'))
  .filter(f => f.endsWith('.json'))
  .map(f => path.basename(f, '.json'))
  .sort()

const isTTY = Boolean(process.stdin.isTTY)
const rl = isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null

// Non-interactive mode (piped input): read all of stdin up front and serve
// answers line by line — enables automated/scripted installs and testing.
let pipedAnswers = []
if (!isTTY) {
  const input = await new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
    process.stdin.resume()
  })
  pipedAnswers = input.split('\n').map(l => l.trim())
}

const ask = async (question, fallback = '') => {
  const hint = fallback ? ` (${fallback})` : ''
  let answer
  if (isTTY) {
    answer = (await rl.question(`${question}${hint}: `)).trim()
  } else {
    answer = String(pipedAnswers.shift() ?? '').trim()
  }
  if (!answer) answer = fallback
  return answer
}

const askYesNo = async (question, fallback = false) => {
  const answer = (await ask(`${question} (${fallback ? 'Y/n' : 'y/N'})`, fallback ? 'y' : 'n')).toLowerCase()
  return answer.startsWith('y')
}

const print = (line = '') => console.log(line)

// ---------------------------------------------------------------------------
print(`
  ██╗    ██╗ █████╗ ██╗     ██╗  ██╗ ██████╗ ███████╗
  ██║    ██║██╔══██╗██║     ██║ ██╔╝██╔═══██╗██╔════╝
  ██║ █╗ ██║███████║██║     █████╔╝ ██║   ██║███████╗
  ██║███╗██║██╔══██║██║     ██╔═██╗ ██║   ██║╚════██║
  ╚███╔███╔╝██║  ██║███████╗██║  ██╗╚██████╔╝███████║
   ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝

  🛠  Setup wizard — a few questions and you're ready to run the bot.
`)
// ---------------------------------------------------------------------------

// 0) environment checks -----------------------------------------------------
const nodeOk = Number(process.versions.node.split('.')[0]) >= 22
print(`✔ Node.js ${process.versions.node} ${nodeOk ? 'is supported' : '❌ TOO OLD — install Node ≥ 22 from https://nodejs.org'}`)
if (!nodeOk) process.exit(1)

let ffmpegOk = false
try {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  await promisify(execFile)('ffmpeg', ['-version'])
  ffmpegOk = true
  print('✔ ffmpeg found (stickers and media conversions will work)')
} catch {
  print('⚠ ffmpeg NOT found — sticker commands will not work until you install it:')
  print('    Ubuntu/Debian: sudo apt install ffmpeg   Arch: sudo pacman -S ffmpeg')
  print('    macOS: brew install ffmpeg               Termux: pkg install ffmpeg')
  print('    Windows: winget install Gyan.FFmpeg (restart the terminal afterwards)')
}
print()

// 1) existing .env ----------------------------------------------------------
if (fs.existsSync(ENV_FILE)) {
  const overwrite = await askYesNo('A .env file already exists. Overwrite it with new answers?', false)
  if (!overwrite) {
    print('\n✅ Kept your existing .env. Start the bot with: npm start')
    rl?.close()
    process.exit(0)
  }
}

// 2) questions --------------------------------------------------------------
const botName = (await ask('1/5 Bot display name', 'Aqua Bot')).slice(0, 60)

let owner = ''
for (let attempt = 1; attempt <= 3 && !owner; attempt++) {
  const answer = (await ask('2/5 Your WhatsApp number (country code, digits only — e.g. 905321234567)')).replace(/\D/g, '')
  if (answer.length >= 8 && answer.length <= 15) {
    owner = answer
  } else if (answer) {
    print(`  ❌ "${answer}" doesn't look like a valid number (8–15 digits, no + or spaces). Try again.`)
  }
}
if (!owner) {
  print('\n❌ No valid owner number — cancelled. The bot needs it for owner commands.')
  rl?.close()
  process.exit(1)
}

const locale = (await ask(`3/5 Bot language (${LOCALES.join(', ')})`, 'en')).toLowerCase()
const lang = LOCALES.includes(locale) ? locale : 'en'

let prefix = await ask('4/5 Command prefix (one character)', '.')
prefix = prefix.slice(0, 1) || '.'

const wantsAi = await askYesNo('5/5 Connect an AI? (any OpenAI-compatible API: OpenAI, Groq, OpenRouter, Ollama…)', false)
let aiKey = ''
let aiBase = 'https://api.openai.com/v1'
let aiModel = 'gpt-4o-mini'
if (wantsAi) {
  aiKey = (await ask('  AI API key (sk-… / gsk_… — leave empty to skip)')).trim()
  if (aiKey) {
    aiBase = (await ask('  API base URL', aiBase)).replace(/\/+$/, '')
    aiModel = await ask('  Model name', aiModel)
  } else {
    print('  ℹ Skipped — you can add AI_API_KEY to .env later.')
  }
}
print()

// 3) write .env -------------------------------------------------------------
const lines = [
  '# wabot-aq configuration — generated by the setup wizard',
  '# Every option is explained in .env.example',
  `BOT_NAME=${botName}`,
  `OWNER=${owner}`,
  `LOCALE=${lang}`,
  `PREFIX=${prefix}`,
  'SESSION_NAME=aqua',
  'MODE=public',
  `TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul'}`,
  'WEB_SERVER=false',
  'WEB_PORT=3000',
  `AI_API_KEY=${aiKey}`,
  `AI_BASE_URL=${aiBase}`,
  `AI_MODEL=${aiModel}`,
  'MAX_FILE_SIZE=104857600',
  'COMMAND_COOLDOWN=3',
  `STICKER_PACKNAME=${botName}`,
  'STICKER_AUTHOR=wabot-aq'
]
fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 })

// 4) summary ----------------------------------------------------------------
print('✅ .env created (kept private — never commit or share it!).')
print()
print('  Summary')
  print(`   • Bot name:   ${botName}`)
  print(`   • Owner:      ${owner}`)
  print(`   • Language:   ${lang}`)
  print(`   • Prefix:     ${prefix}`)
  print(`   • AI:         ${aiKey ? `enabled (${aiModel})` : 'disabled'}`)
  print(`   • ffmpeg:     ${ffmpegOk ? 'ok' : 'missing (see hint above)'}`)
print()
print('  Next steps')
  print('   1. Start the bot:        npm start')
  print('   2. Scan the QR code with WhatsApp (Linked devices → Link a device)')
  print('   3. Send your bot a message: .menu')
print()
print('  Tips')
  print(`   • Send .help <command> for details, .menu for everything (${prefix}menu)`)
  print('   • Keep the bot online 24/7 with Docker: docker compose up -d')
  print('   • Run checks any time:  npm run selftest')
print()

rl?.close()
