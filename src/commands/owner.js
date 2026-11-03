/** Owner-only commands: bans, premium, broadcast, shell, group join/leave. */
import { exec } from 'node:child_process'
import { mention, isUrl, redactSecrets, fmtBytes, msToTime } from '../lib/utils.js'

function run (cmd, timeout = 30_000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err: err?.message, stdout: stdout?.toString(), stderr: stderr?.toString() })
    })
  })
}

function resolveTargets (ctx) {
  if (ctx.m.mentionedJid?.length) return ctx.m.mentionedJid
  if (ctx.m.quoted) return [ctx.m.quoted.sender]
  const num = (ctx.args[0] || '').replace(/\D/g, '')
  if (num.length >= 7) return [`${num}@s.whatsapp.net`]
  return []
}

async function broadcast (ctx, groupsOnly) {
  const text = ctx.text
  if (!text) return ctx.reply(ctx.t('owner.bcUsage', { prefix: ctx.usedPrefix }))
  let jids = []
  const groups = await ctx.sock.groupFetchAllParticipating().catch(() => ({}))
  jids = Object.keys(groups)
  if (!groupsOnly) {
    // private chats seen before
    jids = jids.concat(
      Object.keys(ctx.db.data.chats).filter(j => j.endsWith('@s.whatsapp.net'))
    )
  }
  jids = [...new Set(jids)].filter(j => j !== ctx.sock.user.id)
  await ctx.reply(ctx.t('owner.bcStart', { count: jids.length }))
  let sent = 0
  for (const jid of jids) {
    await ctx.sock.sendMessage(jid, { text }).catch(() => {})
    sent++
    await new Promise(r => setTimeout(r, 800)) // anti-spam pacing
  }
  await ctx.reply(ctx.t('owner.bcDone', { sent, total: jids.length }))
}

export const commands = [
  {
    name: 'banuser',
    category: 'owner',
    description: 'Ban a user from using the bot',
    permission: 'owner',
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('owner.noTarget'))
      for (const jid of targets) {
        const user = ctx.db.ensureUser(jid)
        user.banned = true
      }
      await ctx.reply(ctx.t('owner.banUser', { users: targets.map(mention).join(', ') }), { mentions: targets })
    }
  },
  {
    name: 'unbanuser',
    category: 'owner',
    description: 'Lift a user ban',
    permission: 'owner',
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('owner.noTarget'))
      for (const jid of targets) {
        const user = ctx.db.ensureUser(jid)
        user.banned = false
      }
      await ctx.reply(ctx.t('owner.unbanUser', { users: targets.map(mention).join(', ') }), { mentions: targets })
    }
  },
  {
    name: 'banchat',
    category: 'owner',
    description: 'Disable the bot in this chat',
    permission: 'owner',
    async run (ctx) {
      ctx.chat.isBanned = true
      await ctx.reply(ctx.t('owner.banChat'))
    }
  },
  {
    name: 'unbanchat',
    category: 'owner',
    description: 'Re-enable the bot in this chat',
    permission: 'rowner',
    async run (ctx) {
      ctx.chat.isBanned = false
      await ctx.reply(ctx.t('owner.unbanChat'))
    }
  },
  {
    name: 'addprem',
    aliases: ['addpremium'],
    category: 'owner',
    description: 'Grant premium to a user',
    permission: 'owner',
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('owner.noTarget'))
      for (const jid of targets) {
        const user = ctx.db.ensureUser(jid)
        user.premium = true
        user.limit = Math.max(user.limit || 0, 999)
      }
      await ctx.reply(ctx.t('owner.addPrem', { users: targets.map(mention).join(', ') }), { mentions: targets })
    }
  },
  {
    name: 'delprem',
    aliases: ['delpremium'],
    category: 'owner',
    description: 'Revoke premium from a user',
    permission: 'owner',
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('owner.noTarget'))
      for (const jid of targets) {
        const user = ctx.db.ensureUser(jid)
        user.premium = false
        user.limit = Math.min(user.limit || 0, ctx.config.limits.startLimit)
      }
      await ctx.reply(ctx.t('owner.delPrem', { users: targets.map(mention).join(', ') }), { mentions: targets })
    }
  },
  {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast a message to all chats',
    usage: '<text>',
    permission: 'rowner',
    cooldown: 30,
    async run (ctx) {
      await broadcast(ctx, false)
    }
  },
  {
    name: 'bcgroup',
    aliases: ['bcg'],
    category: 'owner',
    description: 'Broadcast to groups only',
    usage: '<text>',
    permission: 'rowner',
    cooldown: 30,
    async run (ctx) {
      await broadcast(ctx, true)
    }
  },
  {
    name: 'exec',
    category: 'owner',
    description: 'Run a shell command on the host',
    usage: '<command>',
    permission: 'rowner',
    cooldown: 5,
    async run (ctx) {
      if (ctx.config.safeMode) return ctx.reply(ctx.t('owner.execDisabled'))
      if (!ctx.text) return ctx.reply(ctx.t('owner.execUsage', { prefix: ctx.usedPrefix }))
      await ctx.m.react('⏳')
      const { err, stdout, stderr } = await run(ctx.text)
      const output = redactSecrets([stdout, stderr, err].filter(Boolean).join('\n').trim())
      const header = err ? '⚠️' : '✅'
      const body = (output || ctx.t('owner.execNoOutput')).slice(0, 3000)
      await ctx.reply(`${header}\n\`\`\`\n${body}\n\`\`\``)
      await ctx.m.react(err ? '❌' : '✅')
    }
  },
  {
    name: 'join',
    category: 'owner',
    description: 'Join a group via invite link',
    usage: '<link>',
    permission: 'rowner',
    async run (ctx) {
      const url = ctx.args[0]
      if (!url || !isUrl(url) || !url.includes('chat.whatsapp.com')) {
        return ctx.reply(ctx.t('owner.joinUsage', { prefix: ctx.usedPrefix }))
      }
      const code = url.split('/').pop().split('?')[0]
      const res = await ctx.sock.groupAcceptInvite(code).catch(e => {
        throw new Error(e?.message?.includes('gone') ? ctx.t('owner.joinGone') : ctx.t('owner.joinFail'))
      })
      await ctx.reply(ctx.t('owner.joined', { group: res?.subject || code }))
    }
  },
  {
    name: 'leave',
    aliases: ['ayrıl', 'ayril'],
    category: 'owner',
    description: 'Leave the current group',
    permission: 'owner',
    async run (ctx) {
      if (!ctx.isGroup) return ctx.reply(ctx.t('perms.group'))
      await ctx.reply(ctx.t('owner.leaving'))
      await ctx.sock.groupParticipantsUpdate(ctx.m.chat, [ctx.sock.user.id], 'remove')
        .catch(() => ctx.sock.groupLeave?.(ctx.m.chat))
    }
  },
  {
    name: 'warn',
    category: 'owner',
    description: 'Warn a user (3 warnings → ban)',
    permission: 'mod',
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('owner.noTarget'))
      const banned = []
      for (const jid of targets) {
        const user = ctx.db.ensureUser(jid)
        user.warnings = (user.warnings || 0) + 1
        if (user.warnings >= 3) {
          user.banned = true
          banned.push(jid)
        }
      }
      if (banned.length) {
        return ctx.reply(ctx.t('owner.warnBanned', { users: banned.map(mention).join(', ') }), { mentions: banned })
      }
      await ctx.reply(ctx.t('owner.warned', { users: targets.map(mention).join(', ') }), { mentions: targets })
    }
  },
  {
    name: 'dbbackup',
    aliases: ['dbb'],
    category: 'owner',
    description: 'Create a rotating database backup',
    permission: 'owner',
    cooldown: 10,
    async run (ctx) {
      const result = ctx.db.backup()
      await ctx.reply(ctx.t('owner.dbBackup', {
        file: result.file,
        backups: result.count,
        pruned: result.pruned
      }))
    }
  },
  {
    name: 'dbstats',
    aliases: ['dbinfo'],
    category: 'owner',
    description: 'Show database size, schema and backup metrics',
    permission: 'owner',
    async run (ctx) {
      const info = ctx.db.info()
      const formatTime = (timestamp) =>
        timestamp ? new Date(timestamp).toLocaleString(ctx.locale) : '—'
      await ctx.reply(ctx.t('owner.dbStats', {
        file: info.file,
        size: fmtBytes(info.size),
        schema: info.schemaVersion,
        users: info.users,
        chats: info.chats,
        settings: info.settings,
        stats: info.stats,
        backups: info.backups,
        backupDir: info.backupDir,
        autosave: msToTime(info.autosaveMs),
        saves: info.saves,
        skips: info.skips,
        lastSaveMs: info.lastSaveMs,
        lastSaved: formatTime(info.lastSavedAt),
        lastChecked: formatTime(info.lastCheckedAt),
        uptime: msToTime(process.uptime() * 1000)
      }))
    }
  }
]
