/** RPG / economy commands: daily claim, leaderboard, AFK. */
import { getLevel, getNextLevelExp } from '../lib/database.js'
import { getRoleName } from '../i18n/index.js'
import { mention } from '../lib/utils.js'

export const commands = [
  {
    name: 'daily',
    aliases: ['claim'],
    category: 'rpg',
    description: 'Claim your daily usage limit',
    cooldown: 5,
    async run (ctx) {
      const user = ctx.user
      const now = Date.now()
      const cooldown = 24 * 60 * 60 * 1000
      const passed = now - (user.lastclaim || 0)
      if (passed < cooldown) {
        const wait = cooldown - passed
        const h = Math.floor(wait / 3_600_000)
        const m = Math.floor((wait % 3_600_000) / 60_000)
        const s = Math.floor((wait % 60_000) / 1000)
        return ctx.reply(ctx.t('rpg.dailyWait', { h, m, s }))
      }
      user.lastclaim = now
      user.limit = (user.limit || 0) + ctx.config.limits.dailyClaim
      await ctx.reply(ctx.t('rpg.dailyClaimed', {
        amount: ctx.config.limits.dailyClaim,
        limit: user.limit
      }))
    }
  },
  {
    name: 'leaderboard',
    aliases: ['rank', 'lb', 'top'],
    category: 'rpg',
    description: 'Top 10 most active users',
    cooldown: 10,
    async run (ctx) {
      const entries = Object.entries(ctx.db.data.users)
        .sort((a, b) => (b[1].exp || 0) - (a[1].exp || 0))
        .slice(0, 10)
      if (!entries.length) return ctx.reply(ctx.t('rpg.lbEmpty'))
      const lines = [ctx.t('rpg.lbHeader'), '']
      entries.forEach(([jid, u], i) => {
        lines.push(ctx.t('rpg.lbLine', {
          rank: i + 1,
          name: mention(jid),
          level: getLevel(u.exp || 0),
          exp: u.exp || 0
        }))
      })
      lines.push('')
      lines.push(ctx.t('rpg.lbFooter'))
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'afk',
    category: 'rpg',
    description: 'Mark yourself as away (reason optional)',
    usage: '[reason]',
    cooldown: 3,
    async run (ctx) {
      const user = ctx.user
      user.afk = Date.now()
      user.afkReason = ctx.text || ''
      await ctx.reply(ctx.t('rpg.afkSet', { reason: ctx.text || ctx.t('rpg.afkNoReason') }))
    }
  },
  {
    name: 'level',
    aliases: ['seviye'],
    category: 'rpg',
    description: 'Show your level and XP progress',
    async run (ctx) {
      const user = ctx.user
      const level = getLevel(user.exp)
      const next = getNextLevelExp(level)
      const prev = getNextLevelExp(level - 1)
      const progress = Math.min(100, Math.round(((user.exp - prev) / Math.max(next - prev, 1)) * 100))
      const filled = Math.round(progress / 10)
      await ctx.reply(ctx.t('rpg.level', {
        name: user.name || ctx.pushName || '—',
        level,
        role: getRoleName(ctx.locale, level),
        exp: user.exp,
        next: next - user.exp,
        bar: '█'.repeat(filled) + '░'.repeat(10 - filled),
        progress
      }))
    }
  }
]
