/**
 * Group events: welcome/bye, promote/demote notifications, group setting
 * changes, call rejection. Localized rewrite of the old participantsUpdate /
 * onCall handlers.
 */
import { resolveLocale, t } from '../i18n/index.js'
import { mention } from '../lib/utils.js'

export function attachEvents (deps) {
  const { sock, db, config, logger } = deps

  const localeFor = (jid) => resolveLocale([db.data.chats[jid]?.locale, config.locale])

  const render = (tpl, params) => String(tpl || '')
    .replace(/@user/g, params.users)
    .replace(/@subject/g, params.subject)
    .replace(/@desc/g, params.desc)

  // ---- Group participant changes ----
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id: jid, participants, action } = update
      const chat = db.ensureChat(jid)
      const locale = localeFor(jid)
      const meta = await sock.groupMetadata(jid).catch(() => null)
      const params = {
        users: participants.map(mention).join(', '),
        subject: meta?.subject || jid,
        desc: meta?.desc || ''
      }

      if (action === 'add' && chat.welcome) {
        const text = render(chat.sWelcome || t(locale, 'events.welcomeDefault'), params)
        let image = null
        try {
          image = participants.length === 1
            ? await fetch((await sock.profilePictureUrl(participants[0], 'image'))).then(r => r.arrayBuffer()).then(Buffer.from)
            : null
        } catch { /* no profile picture — text only */ }
        await sock.sendMessage(jid, {
          ...(image ? { image, caption: text } : { text }),
          mentions: participants
        }).catch(() => {})
      } else if ((action === 'remove' || action === 'leave') && chat.bye) {
        const text = render(chat.sBye || t(locale, 'events.byeDefault'), params)
        await sock.sendMessage(jid, { text, mentions: participants }).catch(() => {})
      } else if (action === 'promote' && chat.detect) {
        const text = render(chat.sPromote || t(locale, 'events.promoteDefault'), params)
        await sock.sendMessage(jid, { text, mentions: participants }).catch(() => {})
      } else if (action === 'demote' && chat.detect) {
        const text = render(chat.sDemote || t(locale, 'events.demoteDefault'), params)
        await sock.sendMessage(jid, { text, mentions: participants }).catch(() => {})
      }
    } catch (e) {
      logger.error({ err: e }, 'failed to process group event')
    }
  })

  // ---- Group setting changes (lock, description, subject…) ----
  sock.ev.on('groups.update', async (updates) => {
    try {
      for (const u of updates) {
        if (!u.id) continue
        const chat = db.data.chats[u.id]
        if (!chat?.detect) continue
        const locale = localeFor(u.id)
        if (u.announce !== undefined) {
          await sock.sendMessage(u.id, { text: t(locale, u.announce ? 'events.groupLocked' : 'events.groupUnlocked') }).catch(() => {})
        } else if (u.subject) {
          await sock.sendMessage(u.id, { text: t(locale, 'events.subjectChanged', { subject: u.subject }) }).catch(() => {})
        } else if (u.desc !== undefined) {
          await sock.sendMessage(u.id, { text: t(locale, 'events.descChanged') }).catch(() => {})
        }
      }
    } catch { /* ignore silently */ }
  })

  // ---- Reject calls ----
  sock.ev.on('call', async (calls) => {
    try {
      const settings = db.settings(sock.user.id)
      if (!settings.anticall) return
      for (const call of calls) {
        if (call.status !== 'ringing' || call.from === sock.user.id) continue
        try {
          if (typeof sock.rejectCall === 'function') await sock.rejectCall(call.id, call.from)
        } catch { /* could not reject — ignore */ }
        const locale = resolveLocale([db.data.users[call.from]?.locale, config.locale])
        await sock.sendMessage(call.from, { text: t(locale, 'events.antiCall') }).catch(() => {})
      }
    } catch (e) {
      logger.error({ err: e }, 'failed to process call event')
    }
  })
}
