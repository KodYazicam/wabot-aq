/** Persistent per-chat reminders, delivered by the scheduler in src/core/scheduler.js. */
import { randomUUID } from 'node:crypto'
import { msToTime, parseDuration } from '../lib/utils.js'

const MAX_DURATION = 365 * 24 * 60 * 60 * 1000

function save (ctx) {
  return ctx.db.save().catch(() => {})
}

function reminderId (db) {
  let id = randomUUID().slice(0, 8)
  while (db.data.reminders[id]) id = randomUUID().slice(0, 8)
  return id
}

function ownReminders (ctx) {
  return Object.values(ctx.db.data.reminders || {})
    .filter(reminder => reminder.chat === ctx.m.chat && reminder.sender === ctx.sender)
    .sort((a, b) => a.dueAt - b.dueAt)
}

export const commands = [
  {
    name: 'remind',
    aliases: ['reminder', 'hatirlat'],
    category: 'tools',
    description: 'Set a reminder for this chat',
    usage: '<10m|2h|1d> <text>',
    cooldown: 3,
    async run (ctx) {
      const durationText = ctx.args?.[0] || ''
      const duration = parseDuration(durationText)
      const text = (ctx.args || []).slice(1).join(' ').trim()

      if (!duration || duration <= 0 || !text) {
        return ctx.reply(ctx.t('remind.usage', { prefix: ctx.usedPrefix }))
      }
      if (duration > MAX_DURATION) {
        return ctx.reply(ctx.t('remind.tooLong'))
      }

      ctx.db.data.reminders ||= {}
      const id = reminderId(ctx.db)
      const dueAt = Date.now() + duration
      ctx.db.data.reminders[id] = {
        id,
        chat: ctx.m.chat,
        sender: ctx.sender,
        text,
        dueAt,
        createdAt: Date.now(),
        attempts: 0
      }
      await save(ctx)

      await ctx.reply(ctx.t('remind.created', {
        id,
        when: msToTime(duration),
        at: new Date(dueAt).toLocaleString(ctx.locale),
        text,
        prefix: ctx.usedPrefix
      }))
    }
  },
  {
    name: 'reminders',
    aliases: ['remindlist'],
    category: 'tools',
    description: 'List your active reminders in this chat',
    cooldown: 3,
    async run (ctx) {
      const list = ownReminders(ctx)
      if (!list.length) return ctx.reply(ctx.t('remind.empty'))

      const lines = [ctx.t('remind.header')]
      for (const reminder of list) {
        lines.push(ctx.t('remind.line', {
          id: reminder.id,
          when: msToTime(Math.max(0, reminder.dueAt - Date.now())),
          text: reminder.text
        }))
      }
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'delremind',
    aliases: ['delreminder', 'reminddel'],
    category: 'tools',
    description: 'Cancel one of your reminders',
    usage: '<id>',
    cooldown: 3,
    async run (ctx) {
      const id = (ctx.args?.[0] || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (!id) return ctx.reply(ctx.t('remind.delUsage', { prefix: ctx.usedPrefix }))

      const reminder = ctx.db.data.reminders?.[id]
      if (!reminder || reminder.chat !== ctx.m.chat || reminder.sender !== ctx.sender) {
        return ctx.reply(ctx.t('remind.notFound', { id }))
      }

      delete ctx.db.data.reminders[id]
      await save(ctx)
      await ctx.reply(ctx.t('remind.deleted', { id }))
    }
  }
]
