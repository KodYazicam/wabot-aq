/** RPG / economy commands: daily/weekly claims, transfers, slots, leaderboard, AFK. */
import { getLevel, getNextLevelExp } from '../lib/database.js'
import { getRoleName } from '../i18n/index.js'
import { mention, msToTime, randomPick } from '../lib/utils.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎']

function resolveTarget (ctx) {
  if (ctx.m?.mentionedJid?.length) return ctx.m.mentionedJid[0]
  if (ctx.m?.quoted?.sender) return ctx.m.quoted.sender
  const number = (ctx.args?.[0] || '').replace(/\D/g, '')
  if (number.length >= 7) return `${number}@s.whatsapp.net`
  return null
}

function parseAmount (ctx) {
  const amounts = (ctx.args || [])
    .map(arg => String(arg).replace(/\D/g, ''))
    .filter(value => value && value.length <= 6)
  return amounts.length ? parseInt(amounts.at(-1), 10) : NaN
}

/** Payout for a three-reel spin: 3× for a triple, stake back for a pair. */
export function slotPayout (reels, bet) {
  const [a, b, c] = reels
  if (a === b && b === c) return bet * 3
  if (a === b || a === c || b === c) return bet
  return 0
}

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
    name: 'weekly',
    category: 'rpg',
    description: 'Claim your weekly usage limit',
    cooldown: 5,
    async run (ctx) {
      const user = ctx.user
      const now = Date.now()
      const passed = now - (user.lastweekly || 0)
      if (passed < WEEK_MS) {
        return ctx.reply(ctx.t('rpg.weeklyWait', { when: msToTime(WEEK_MS - passed) }))
      }
      user.lastweekly = now
      user.limit = (user.limit || 0) + ctx.config.limits.weeklyClaim
      await ctx.reply(ctx.t('rpg.weeklyClaimed', {
        amount: ctx.config.limits.weeklyClaim,
        limit: user.limit
      }))
    }
  },
  {
    name: 'transfer',
    category: 'rpg',
    description: 'Transfer usage limits to another user',
    usage: '@user <amount>',
    cooldown: 5,
    async run (ctx) {
      const target = resolveTarget(ctx)
      if (!target) return ctx.reply(ctx.t('rpg.transferUsage', { prefix: ctx.usedPrefix }))

      const max = ctx.config.limits.maxTransfer || 1000
      const amount = parseAmount(ctx)
      if (!Number.isInteger(amount) || amount < 1 || amount > max) {
        return ctx.reply(ctx.t('rpg.transferInvalid', { max }))
      }

      const sender = ctx.sender || ctx.user
      const botId = ctx.sock?.user?.id
      const bareJid = (jid) => String(jid || '').split('@')[0].split(':')[0]
      if ((bareJid(target) && bareJid(target) === bareJid(sender)) ||
          (bareJid(target) && bareJid(target) === bareJid(botId))) {
        return ctx.reply(ctx.t('rpg.transferSelf'))
      }

      if ((ctx.user.limit || 0) < amount) {
        return ctx.reply(ctx.t('rpg.transferInsufficient', { limit: ctx.user.limit || 0 }))
      }

      const receiver = ctx.db.ensureUser(target)
      ctx.user.limit = (ctx.user.limit || 0) - amount
      receiver.limit = (receiver.limit || 0) + amount
      await ctx.reply(ctx.t('rpg.transferred', {
        amount,
        user: mention(target),
        limit: ctx.user.limit
      }), { mentions: [target] })
    }
  },
  {
    name: 'slots',
    aliases: ['slot'],
    category: 'rpg',
    description: 'Bet usage limits on a three-reel spin',
    usage: '<bet>',
    cooldown: 5,
    async run (ctx) {
      const max = ctx.config.limits.maxSlotsBet || 1000
      const bet = parseInt(ctx.args?.[0], 10)
      if (!Number.isInteger(bet) || bet < 1 || bet > max) {
        return ctx.reply(ctx.t('rpg.slotsInvalid', { max }))
      }
      if ((ctx.user.limit || 0) < bet) {
        return ctx.reply(ctx.t('rpg.slotsNoLimit', { bet, limit: ctx.user.limit || 0 }))
      }

      const reels = Array.from({ length: 3 }, () => randomPick(SLOT_SYMBOLS))
      const payout = slotPayout(reels, bet)
      ctx.user.limit = (ctx.user.limit || 0) - bet + payout
      const line = reels.join(' | ')

      if (payout === bet * 3) {
        return ctx.reply(ctx.t('rpg.slotsWin', {
          reels: line,
          payout,
          net: payout - bet,
          limit: ctx.user.limit
        }))
      }
      if (payout === bet) {
        return ctx.reply(ctx.t('rpg.slotsPush', { reels: line, limit: ctx.user.limit }))
      }
      return ctx.reply(ctx.t('rpg.slotsLose', {
        reels: line,
        bet,
        limit: ctx.user.limit
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
