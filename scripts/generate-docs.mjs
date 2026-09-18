#!/usr/bin/env node
/**
 * Generates docs/COMMANDS.md from the live command registry.
 *
 *   npm run docs
 *
 * Keeps documentation in sync automatically — run it after adding commands.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommandRegistry } from '../src/core/commands.js'
import { initI18n, availableLocales, t } from '../src/i18n/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs', 'COMMANDS.md')
const LOCALE = process.env.DOCS_LOCALE || 'en'

initI18n({ locale: LOCALE })

const quietLogger = { info () {}, warn () {}, error () {} }
const registry = new CommandRegistry(path.join(ROOT, 'src', 'commands'), { logger: quietLogger, hotReload: false })
await registry.loadAll()

const PERMISSION_LABELS = {
  rowner: 'real owner', owner: 'owner', mod: 'moderator', premium: 'premium',
  group: 'group only', private: 'private chat only', admin: 'group admin', botAdmin: 'bot is admin'
}

const cats = [...registry.byCategory().entries()]

const lines = []
lines.push(`# Command reference`)
lines.push('')
lines.push(`> Auto-generated from the command registry (\`npm run docs\`) — ${[...new Set(registry.commands.values())].length} commands, generated locale: \`${LOCALE}\` (${availableLocales().join(', ')}).`)
lines.push('')
lines.push(`The prefix is configurable (\`PREFIX\` in .env, default \`.\`).`)
lines.push('')

for (const [cat, defs] of cats) {
  lines.push(`## ${t(LOCALE, `menu.cat.${cat}`)} (\`${cat}\`)`)
  lines.push('')
  lines.push('| Command | Aliases | Usage | Description | Access | Cooldown |')
  lines.push('|---|---|---|---|---|---|')
  for (const def of defs) {
    const aliases = (def.aliases || []).map(a => `\`.${a}\``).join(', ') || '—'
    const usage = def.usage ? `\`${def.usage}\`` : '—'
    const perms = [].concat(def.permission || []).map(p => PERMISSION_LABELS[p] || p).join(' + ') || 'everyone'
    lines.push(`| \`.${def.name}\` | ${aliases} | ${usage} | ${def.description || '—'} | ${perms} | ${def.cooldown ?? 3}s |`)
  }
  lines.push('')
}

lines.push('---')
lines.push('')
lines.push('**Access levels** (checked in this order):')
lines.push('')
lines.push('- **real owner** — the number configured as `OWNER` (or the bot\'s own account)')
lines.push('- **owner** — real owner, or messages sent from the bot account itself')
lines.push('- **moderator** — owner or numbers in `MODS`')
lines.push('- **premium** — users granted `.addprem` (bypass limits and cooldowns)')
lines.push('- **group admin / bot is admin** — checked against the WhatsApp group participant list')
lines.push('')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, lines.join('\n') + '\n')

console.log(`✅ docs/COMMANDS.md generated (${[...new Set(registry.commands.values())].length} commands, locale: ${LOCALE})`)
