/**
 * Group commands: participation, invite links, group info, polls, and the
 * per-group settings that events.js already consumes.
 *
 * All user-facing strings live under `group.*` in the locale files. The
 * handler already resolves group metadata and admin status for commands whose
 * permission list includes `admin`/`botAdmin`.
 */
import { mention } from '../lib/utils.js'

const sameUser = (a, b) =>
  Boolean(a && b) &&
  a.split('@')[0].split(':')[0] === b.split('@')[0].split(':')[0]

const participantIds = (meta) =>
  (meta?.participants || [])
    .map(p => p.id || p.jid)
    .filter(Boolean)

function resolveTargets (ctx) {
  if (ctx.m.mentionedJid?.length) return ctx.m.mentionedJid
  if (ctx.m.quoted?.sender) return [ctx.m.quoted.sender]
  const number = (ctx.args[0] || '').replace(/\D/g, '')
  if (number.length >= 7) return [`${number}@s.whatsapp.net`]
  return []
}

function renderTargets (targets) {
  return targets.map(mention).join(', ')
}

function warningEntry (chat, jid) {
  if (!chat.warnings || typeof chat.warnings !== 'object' || Array.isArray(chat.warnings)) {
    chat.warnings = {}
  }
  const entry = chat.warnings[jid]
  if (!entry || typeof entry !== 'object') {
    chat.warnings[jid] = { count: 0, reasons: [] }
  }
  if (!Array.isArray(chat.warnings[jid].reasons)) chat.warnings[jid].reasons = []
  return chat.warnings[jid]
}

function warningReason (ctx) {
  const first = ctx.args?.[0] || ''
  const numericTarget = !ctx.m.mentionedJid?.length && !ctx.m.quoted &&
    first.replace(/\D/g, '').length >= 7
  const parts = numericTarget ? ctx.args.slice(1) : ctx.args || []
  return parts.join(' ').replace(/@\d+/g, '').replace(/\s+/g, ' ').trim()
}

function groupInviteUrl (code) {
  return `https://chat.whatsapp.com/${code}`
}

export const commands = [
  {
    name: 'tagall',
    aliases: ['everyone', 'all'],
    category: 'group',
    description: 'Mention every member of the group',
    usage: '[message]',
    permission: ['group', 'admin'],
    cooldown: 10,
    async run (ctx) {
      const meta = await ctx.getGroupMetadata()
      if (!meta) return ctx.reply(ctx.t('group.notInGroup'))
      const targets = participantIds(meta)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      const lines = [ctx.t('group.tagallHeader', {
        subject: meta.subject || ctx.m.chat,
        count: targets.length
      })]
      if (ctx.text) lines.push('', ctx.text)
      lines.push('', renderTargets(targets))
      await ctx.reply(lines.join('\n'), { mentions: targets })
    }
  },
  {
    name: 'hidetag',
    category: 'group',
    description: 'Notify everyone without showing their names',
    usage: '[message]',
    permission: ['group', 'admin'],
    cooldown: 10,
    async run (ctx) {
      const meta = await ctx.getGroupMetadata()
      if (!meta) return ctx.reply(ctx.t('group.notInGroup'))
      const targets = participantIds(meta)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      const text = ctx.text || ctx.t('group.hidetagDefault').trim()
      await ctx.reply(text, { mentions: targets })
    }
  },
  {
    name: 'kick',
    aliases: ['remove'],
    category: 'group',
    description: 'Remove a member from the group',
    usage: '<@user|number>',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      const meta = await ctx.getGroupMetadata()
      if (!meta) return ctx.reply(ctx.t('group.notInGroup'))
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      const allowed = targets.filter(jid => !sameUser(jid, ctx.sock.user?.id))
      if (!allowed.length) return ctx.reply(ctx.t('group.cantKickSelf'))
      await ctx.sock.groupParticipantsUpdate(ctx.m.chat, allowed, 'remove')
      await ctx.reply(ctx.t('group.kicked', { users: renderTargets(allowed) }), { mentions: allowed })
    }
  },
  {
    name: 'add',
    category: 'group',
    description: 'Add a user to the group',
    usage: '<number>',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) {
        return ctx.reply(ctx.t('group.addUsage', { cmd: `${ctx.usedPrefix}${ctx.command}` }))
      }
      const jid = targets[0]
      const meta = await ctx.getGroupMetadata()
      if (!meta) return ctx.reply(ctx.t('group.notInGroup'))

      if (participantIds(meta).some(id => sameUser(id, jid))) {
        return ctx.reply(ctx.t('group.alreadyIn', { user: mention(jid) }), { mentions: [jid] })
      }

      let added = false
      try {
        const result = await ctx.sock.groupParticipantsUpdate(ctx.m.chat, [jid], 'add')
        const status = result?.[0]?.status
        added = status === 200 || status === '200'
      } catch { /* fall through to the invite-link fallback */ }

      if (added) {
        return ctx.reply(ctx.t('group.added', { user: mention(jid) }), { mentions: [jid] })
      }

      const code = await ctx.sock.groupInviteCode(ctx.m.chat)
      await ctx.sock.sendMessage(jid, {
        text: ctx.t('group.inviteDM', { group: meta.subject || ctx.m.chat, code })
      })
      await ctx.reply(ctx.t('group.addFailed', { user: mention(jid) }), { mentions: [jid] })
    }
  },
  {
    name: 'promote',
    category: 'group',
    description: 'Promote a member to group admin',
    usage: '<@user|number>',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      await ctx.sock.groupParticipantsUpdate(ctx.m.chat, targets, 'promote')
      await ctx.reply(ctx.t('group.promoted', { users: renderTargets(targets) }), { mentions: targets })
    }
  },
  {
    name: 'demote',
    category: 'group',
    description: 'Remove a member from group admins',
    usage: '<@user|number>',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      await ctx.sock.groupParticipantsUpdate(ctx.m.chat, targets, 'demote')
      await ctx.reply(ctx.t('group.demoted', { users: renderTargets(targets) }), { mentions: targets })
    }
  },
  {
    name: 'grouplink',
    aliases: ['link'],
    category: 'group',
    description: 'Show the group invite link',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      const code = await ctx.sock.groupInviteCode(ctx.m.chat)
      await ctx.reply(ctx.t('group.link', { url: groupInviteUrl(code) }))
    }
  },
  {
    name: 'revoke',
    category: 'group',
    description: 'Revoke the group invite link and create a new one',
    permission: ['group', 'admin', 'botAdmin'],
    cooldown: 5,
    async run (ctx) {
      await ctx.sock.groupRevokeInvite(ctx.m.chat)
      const code = await ctx.sock.groupInviteCode(ctx.m.chat)
      await ctx.reply(ctx.t('group.revoked', { url: groupInviteUrl(code) }))
    }
  },
  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    category: 'group',
    description: 'Show group details',
    permission: 'group',
    needsMeta: true,
    cooldown: 5,
    async run (ctx) {
      const meta = await ctx.getGroupMetadata()
      if (!meta) return ctx.reply(ctx.t('group.notInGroup'))
      const participants = meta.participants || []
      const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      const owner = meta.owner || participants.find(p => p.admin === 'superadmin')?.id
      const created = meta.creation
        ? new Date(meta.creation * 1000).toLocaleDateString(ctx.locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        : '—'
      await ctx.reply(ctx.t('group.info', {
        subject: meta.subject || ctx.m.chat,
        desc: meta.desc || '—',
        members: participants.length,
        admins: admins.length,
        owner: owner ? mention(owner) : '—',
        created,
        announcement: meta.announcement ? ctx.t('group.locked') : ctx.t('group.unlocked')
      }))
    }
  },
  {
    name: 'poll',
    category: 'group',
    description: 'Create a group poll',
    usage: '<question>|<option 1>|<option 2>',
    permission: 'group',
    cooldown: 10,
    async run (ctx) {
      const parts = ctx.text.split('|').map(part => part.trim()).filter(Boolean)
      if (parts.length < 3) {
        return ctx.reply(ctx.t('group.pollUsage', { prefix: ctx.usedPrefix }))
      }
      const [name, ...values] = parts
      await ctx.sock.sendMessage(ctx.m.chat, {
        poll: { name, values, selectableCount: 1 }
      }, { quoted: ctx.m })
      await ctx.m.react('📊')
    }
  },
  {
    name: 'welcome',
    category: 'group',
    description: 'Toggle welcome messages for new members',
    permission: ['group', 'admin'],
    async run (ctx) {
      ctx.chat.welcome = !ctx.chat.welcome
      await ctx.reply(ctx.t(ctx.chat.welcome ? 'group.welcomeOn' : 'group.welcomeOff'))
    }
  },
  {
    name: 'setwelcome',
    category: 'group',
    description: 'Set the welcome message text',
    usage: '<text>',
    permission: ['group', 'admin'],
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('group.setWelcomeUsage', { prefix: ctx.usedPrefix }))
      ctx.chat.sWelcome = ctx.text
      return ctx.reply(ctx.t('group.setWelcome', { text: ctx.text }))
    }
  },
  {
    name: 'setbye',
    category: 'group',
    description: 'Set the goodbye message text',
    usage: '<text>',
    permission: ['group', 'admin'],
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('group.setByeUsage', { prefix: ctx.usedPrefix }))
      ctx.chat.sBye = ctx.text
      return ctx.reply(ctx.t('group.setBye', { text: ctx.text }))
    }
  },
  {
    name: 'bye',
    category: 'group',
    description: 'Toggle goodbye messages for members who leave',
    permission: ['group', 'admin'],
    async run (ctx) {
      ctx.chat.bye = !ctx.chat.bye
      await ctx.reply(ctx.t(ctx.chat.bye ? 'group.byeOn' : 'group.byeOff'))
    }
  },
  {
    name: 'gwarn',
    aliases: ['groupwarn'],
    category: 'group',
    description: 'Warn a member; 3 warnings remove them when the bot is admin',
    usage: '<@user|number> [reason]',
    permission: ['group', 'admin'],
    cooldown: 3,
    async run (ctx) {
      const targets = resolveTargets(ctx).filter(jid =>
        !sameUser(jid, ctx.sender) && !sameUser(jid, ctx.sock.user?.id)
      )
      if (!targets.length) return ctx.reply(ctx.t('group.cantWarnSelf'))

      const reason = warningReason(ctx)
      const { botAdmin } = await ctx.getAdminStatus()
      const lines = []

      for (const jid of targets) {
        const entry = warningEntry(ctx.chat, jid)
        entry.count = Math.min(3, (entry.count || 0) + 1)
        if (reason) entry.reasons.push(reason)

        if (entry.count < 3) {
          lines.push(ctx.t('group.gwarned', { user: mention(jid), count: entry.count }))
          continue
        }

        if (!botAdmin) {
          lines.push(ctx.t('group.gwarnLimitNoBot', { user: mention(jid) }))
          continue
        }

        try {
          await ctx.sock.groupParticipantsUpdate(ctx.m.chat, [jid], 'remove')
          delete ctx.chat.warnings[jid]
          lines.push(ctx.t('group.gwarnKicked', { user: mention(jid) }))
        } catch {
          lines.push(ctx.t('group.gwarnLimitNoBot', { user: mention(jid) }))
        }
      }

      await ctx.reply(lines.join('\n'), { mentions: targets })
    }
  },
  {
    name: 'warnings',
    aliases: ['warns'],
    category: 'group',
    description: 'Show group warnings for yourself or a member',
    usage: '[@user|number]',
    permission: 'group',
    cooldown: 3,
    async run (ctx) {
      const targets = resolveTargets(ctx)
      const jid = targets[0] || ctx.sender
      const entry = ctx.chat.warnings?.[jid]
      if (!entry?.count) {
        return ctx.reply(ctx.t('group.warningsNone', { user: mention(jid) }), { mentions: [jid] })
      }
      const reasons = entry.reasons?.length
        ? entry.reasons.join('; ')
        : ctx.t('group.noReason')
      await ctx.reply(ctx.t('group.warningsInfo', {
        user: mention(jid),
        count: Math.min(3, entry.count),
        reasons
      }), { mentions: [jid] })
    }
  },
  {
    name: 'resetwarn',
    aliases: ['clearwarn'],
    category: 'group',
    description: 'Clear group warnings for a member',
    usage: '<@user|number>',
    permission: ['group', 'admin'],
    cooldown: 3,
    async run (ctx) {
      const targets = resolveTargets(ctx)
      if (!targets.length) return ctx.reply(ctx.t('group.noTarget'))
      for (const jid of targets) {
        if (ctx.chat.warnings) delete ctx.chat.warnings[jid]
      }
      await ctx.reply(ctx.t('group.warningsReset', { users: renderTargets(targets) }), { mentions: targets })
    }
  },
  {
    name: 'antilink',
    category: 'group',
    description: 'Delete WhatsApp group invite links posted by members',
    permission: ['group', 'admin'],
    async run (ctx) {
      ctx.chat.antilink = !ctx.chat.antilink
      await ctx.reply(ctx.t(ctx.chat.antilink ? 'group.antilinkOn' : 'group.antilinkOff'))
    }
  },
  {
    name: 'antidelete',
    category: 'group',
    description: 'Recover deleted messages in this group',
    permission: ['group', 'admin'],
    async run (ctx) {
      ctx.chat.antidelete = !ctx.chat.antidelete
      await ctx.reply(ctx.t(ctx.chat.antidelete ? 'group.antideleteOn' : 'group.antideleteOff'))
    }
  },
  {
    name: 'detect',
    category: 'group',
    description: 'Announce admin and group setting changes',
    permission: ['group', 'admin'],
    async run (ctx) {
      ctx.chat.detect = !ctx.chat.detect
      await ctx.reply(ctx.t(ctx.chat.detect ? 'group.detectOn' : 'group.detectOff'))
    }
  },
  {
    name: 'opengroup',
    aliases: ['open'],
    category: 'group',
    description: 'Allow every member to send messages',
    permission: ['group', 'admin', 'botAdmin'],
    async run (ctx) {
      await ctx.sock.groupSettingUpdate(ctx.m.chat, 'not_announcement')
      await ctx.reply(ctx.t('group.opened'))
    }
  },
  {
    name: 'closegroup',
    aliases: ['close'],
    category: 'group',
    description: 'Restrict messages to group admins',
    permission: ['group', 'admin', 'botAdmin'],
    async run (ctx) {
      await ctx.sock.groupSettingUpdate(ctx.m.chat, 'announcement')
      await ctx.reply(ctx.t('group.closed'))
    }
  },
  {
    name: 'setsubject',
    category: 'group',
    description: 'Change the group name',
    usage: '<text>',
    permission: ['group', 'admin', 'botAdmin'],
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('group.setSubjectUsage', { prefix: ctx.usedPrefix }))
      await ctx.sock.groupUpdateSubject(ctx.m.chat, ctx.text)
      await ctx.reply(ctx.t('group.setSubject', { text: ctx.text }))
    }
  },
  {
    name: 'setdesc',
    category: 'group',
    description: 'Change the group description',
    usage: '<text>',
    permission: ['group', 'admin', 'botAdmin'],
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('group.setDescUsage', { prefix: ctx.usedPrefix }))
      await ctx.sock.groupUpdateDescription(ctx.m.chat, ctx.text)
      await ctx.reply(ctx.t('group.setDesc'))
    }
  },
  {
    name: 'del',
    aliases: ['delete'],
    category: 'group',
    description: 'Delete a replied-to message',
    permission: 'group',
    cooldown: 3,
    async run (ctx) {
      const quoted = ctx.m.quoted
      if (!quoted?.key?.id) return ctx.reply(ctx.t('group.replyToMessage'))
      const { isAdmin, botAdmin } = await ctx.getAdminStatus()
      const ownMessage = quoted.key.fromMe || sameUser(quoted.sender, ctx.sender)
      if (!isAdmin && !ownMessage && !ctx.isOwner) return ctx.reply(ctx.t('group.delNoPerm'))
      if (!ownMessage && !botAdmin) return ctx.reply(ctx.t('perms.botAdmin'))
      await ctx.sock.sendMessage(ctx.m.chat, { delete: quoted.key })
    }
  }
]
