/** Core commands: menu, ping, uptime, bot info, plugins, usage stats. */
import os from 'node:os'
import path from 'node:path'
import { getBotState } from '../core/connection.js'
import { getLevel, getNextLevelExp } from '../lib/database.js'
import { msToTime, fmtBytes } from '../lib/utils.js'

const CATEGORY_ORDER = ['core', 'settings', 'sticker', 'media', 'downloader', 'ai', 'tools', 'group', 'fun', 'rpg', 'owner', 'other']

const CATEGORY_ICONS = {
  core: '🏠',
  settings: '⚙️',
  sticker: '🧩',
  media: '🎞️',
  downloader: '⬇️',
  ai: '🤖',
  tools: '🛠️',
  group: '👥',
  fun: '🎮',
  rpg: '🏅',
  owner: '👑',
  other: '📦'
}

export const commands = [
  {
    name: 'menu',
    aliases: ['?', 'commands', 'list'],
    category: 'core',
    description: 'Show the command menu',
    async run (ctx) {
      const { registry, config } = ctx
      const cats = registry.byCategory()
      const commandCount = new Set(registry.commands.values()).size
      const lines = []
      lines.push(ctx.t('menu.header', {
        bot: config.botName,
        prefix: ctx.usedPrefix,
        count: commandCount
      }))
      lines.push(ctx.t('menu.uptime', { uptime: msToTime(process.uptime() * 1000) }))
      lines.push(ctx.t('menu.locale', { locale: ctx.locale }))
      lines.push(ctx.t('menu.tip', { prefix: ctx.usedPrefix, cmd: 'help' }))
      lines.push('')

      const catRank = (cat) => {
        const i = CATEGORY_ORDER.indexOf(cat)
        return i < 0 ? CATEGORY_ORDER.length : i
      }
      for (const [cat, defs] of [...cats.entries()].sort((a, b) => catRank(a[0]) - catRank(b[0]))) {
        const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other
        lines.push(`┌─ ${icon} *${ctx.t(`menu.cat.${cat}`)}* · ${defs.length}`)
        for (const def of defs) {
          const usage = def.usage ? ' ' + def.usage : ''
          lines.push(`│ • *${ctx.usedPrefix}${def.name}*${usage}`)
        }
        lines.push('└───────────')
      }
      lines.push('')
      lines.push(ctx.t('menu.footer', { bot: config.botName }))
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'help',
    aliases: ['cmd', 'command'],
    category: 'core',
    description: 'Show help for one command',
    usage: '<command>',
    async run (ctx) {
      const name = (ctx.args[0] || '').replace(ctx.usedPrefix, '').toLowerCase()
      if (!name) return ctx.reply(ctx.t('menu.helpUsage', { prefix: ctx.usedPrefix }))
      const def = ctx.registry.find(name)
      if (!def) return ctx.reply(ctx.t('menu.helpNotFound', { prefix: ctx.usedPrefix, cmd: name }))
      const perms = [].concat(def.permission || []).map(p => ctx.t(`menu.perm.${p}`)).join(', ') || ctx.t('menu.perm.everyone')
      const lines = [
        ctx.t('menu.helpHeader', { cmd: def.name }),
        `📜 ${def.description || '—'}`,
        def.usage ? `⌨️ ${ctx.t('menu.usage')}: ${def.usage}` : '',
        `🏷️ ${ctx.t('menu.category')}: ${ctx.t(`menu.cat.${def.category || 'other'}`)}`,
        `⚡ ${ctx.t('menu.cooldown')}: ${def.cooldown ?? ctx.config.limits.commandCooldown}s`,
        `🔑 ${ctx.t('menu.permission')}: ${perms}`,
        def.aliases?.length ? `🔁 ${ctx.t('menu.aliases')}: ${def.aliases.map(a => ctx.usedPrefix + a).join(', ')}` : ''
      ].filter(Boolean)
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'ping',
    aliases: ['speed', 'p'],
    category: 'core',
    description: 'Check the bot latency',
    async run (ctx) {
      const start = Date.now()
      await ctx.sock.sendPresenceUpdate('composing', ctx.m.chat)
      const ping = Date.now() - start
      await ctx.reply(ctx.t('core.ping', {
        ping,
        uptime: msToTime(process.uptime() * 1000),
        ram: fmtBytes(process.memoryUsage().rss)
      }))
    }
  },
  {
    name: 'uptime',
    aliases: ['runtime'],
    category: 'core',
    description: 'Show how long the bot has been running',
    async run (ctx) {
      const s = getBotState()
      await ctx.reply(ctx.t('core.uptime', {
        uptime: msToTime(process.uptime() * 1000),
        total: msToTime(s.uptime),
        reconnects: s.reconnects,
        node: process.version
      }))
    }
  },
  {
    name: 'botinfo',
    aliases: ['info'],
    category: 'core',
    description: 'Show bot statistics',
    async run (ctx) {
      const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}))
      const uniqueCmds = new Set(ctx.registry.commands.values()).size
      const msgTotal = Object.values(ctx.db.data.stats).reduce((a, s) => a + s.total, 0)
      await ctx.reply(ctx.t('core.botinfo', {
        bot: ctx.config.botName,
        version: '3.0.0',
        node: process.version,
        platform: `${os.type()} ${os.arch()}`,
        users: Object.keys(ctx.db.data.users).length,
        chats: Object.keys(ctx.db.data.chats).length,
        groups: Object.keys(groups).length,
        commands: uniqueCmds,
        used: msgTotal,
        prefix: ctx.config.prefix.join(' '),
        locale: ctx.locale,
        locales: (await import('../i18n/index.js')).availableLocales().join(', ')
      }))
    }
  },
  {
    name: 'plugins',
    aliases: ['plugin'],
    category: 'core',
    description: 'List commands loaded from the plugins/ directory',
    async run (ctx) {
      const external = [...ctx.registry.files.entries()]
        .filter(([file]) => !file.startsWith(ctx.registry.dir + path.sep))
        .sort(([a], [b]) => a.localeCompare(b))

      if (!external.length) return ctx.reply(ctx.t('core.pluginsEmpty'))

      const lines = [ctx.t('core.pluginsHeader', { count: external.length })]
      for (const [file, names] of external) {
        const defs = [...new Set(names.map(name => ctx.registry.find(name)).filter(Boolean))]
        lines.push(ctx.t('core.pluginsLine', {
          file: path.basename(file),
          commands: defs.map(def => def.name).join(', ') || '—'
        }))
      }
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'stats',
    category: 'core',
    description: 'Show the most used commands',
    async run (ctx) {
      const stats = Object.entries(ctx.db.data.stats)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
      if (!stats.length) return ctx.reply(ctx.t('core.statsEmpty'))
      const lines = [ctx.t('core.statsHeader'), '']
      stats.forEach(([name, s], i) => {
        lines.push(ctx.t('core.statsLine', {
          rank: i + 1,
          cmd: name,
          total: s.total,
          success: s.success
        }))
      })
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'profile',
    aliases: ['me'],
    category: 'rpg',
    description: 'Show your profile card (level, XP, limits)',
    async run (ctx) {
      const { getRoleName } = await import('../i18n/index.js')
      const user = ctx.user
      const level = getLevel(user.exp)
      const next = getNextLevelExp(level)
      const prev = getNextLevelExp(level - 1)
      const progress = Math.min(100, Math.round(((user.exp - prev) / (next - prev)) * 100))
      await ctx.reply(ctx.t('rpg.profile', {
        name: user.name || ctx.pushName || '—',
        level,
        role: getRoleName(ctx.locale, level),
        exp: user.exp,
        next: next - user.exp,
        limit: user.limit,
        premium: user.premium ? ctx.t('rpg.premiumYes') : ctx.t('rpg.premiumNo'),
        bar: '█'.repeat(Math.round(progress / 10)) + '░'.repeat(10 - Math.round(progress / 10)),
        progress,
        msgs: user.msgs,
        warnings: user.warnings
      }))
    }
  }
]
