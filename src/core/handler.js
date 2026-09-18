/**
 * Message pipeline: serialization → database → middleware (self mode,
 * antilink, AFK, cooldown, permissions, locale) → command execution →
 * stats. Streamlined, i18n-aware rewrite of the old handler.js.
 */
import { serialize } from './serialize.js'
import { printMessage } from '../lib/logger.js'
import { resolveLocale, t } from '../i18n/index.js'
import { levenshtein, msToTime, redactSecrets } from '../lib/utils.js'

const GROUP_LINK_RE = /chat\.whatsapp\.com\/(invite\/)?[0-9A-Za-z]{15,}/i

const FLOOD_LIMIT = 15 // commands per minute
const FLOOD_BLOCK_MS = 60_000

const groupCache = new Map() // jid → { data, ts }

/**
 * @param {object} deps
 * @param {import('baileys').WASocket} deps.sock
 */
export function attachHandler (deps) {
  const { sock, db, registry, config, logger } = deps
  const cooldowns = new Map() // `${sender}:${command}` → timestamp
  const floods = new Map() // sender → { times: [], blockedUntil }
  const msgCache = new Map() // chat → recent messages (antidelete)

  /** Flood protection: true = blocked, 'just' = blocked this very call. */
  function checkFlood (sender) {
    const now = Date.now()
    const f = floods.get(sender) || { times: [], blockedUntil: 0 }
    f.times = f.times.filter(ts => now - ts < 60_000)
    if (f.blockedUntil > now) return true
    f.times.push(now)
    if (f.times.length > FLOOD_LIMIT) {
      const wasBlocked = f.blockedUntil > now
      f.blockedUntil = now + FLOOD_BLOCK_MS
      floods.set(sender, f)
      return wasBlocked ? true : 'just'
    }
    floods.set(sender, f)
    return false
  }

  const numberJid = (n) => `${n.replace(/[^0-9]/g, '')}@s.whatsapp.net`

  const isROwner = (jid) => [sock.user?.id, ...config.owner.map(numberJid)]
    .some(o => o && jid && o.split('@')[0] === jid.split('@')[0])

  const cacheMessage = (m) => {
    const list = msgCache.get(m.chat) || []
    list.push({ key: m.key, message: m.content })
    if (list.length > 50) list.splice(0, list.length - 50)
    msgCache.set(m.chat, list)
  }

  async function getGroupMetadata (jid) {
    const cached = groupCache.get(jid)
    if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.data
    try {
      const data = await sock.groupMetadata(jid)
      groupCache.set(jid, { data, ts: Date.now() })
      return data
    } catch {
      return cached?.data || null
    }
  }

  async function participantIsAdmin (meta, jid) {
    if (!meta || !jid) return false
    const p = meta.participants.find(p => p.id === jid || p.jid === jid)
    return p?.admin === 'admin' || p?.admin === 'superadmin'
  }

  // ---- Antidelete: recover revoked messages ----
  function handleRevoke (m) {
    const chat = db.data.chats[m.chat] || {}
    if (!chat.antidelete) return
    const revokedKey = m.msg?.key
    if (!revokedKey || revokedKey.fromMe) return
    const original = (msgCache.get(m.chat) || []).find(e => e.key.id === revokedKey.id)?.message
    if (!original) return
    const locale = resolveLocale([db.data.users[m.sender]?.locale, chat.locale, config.locale])
    sock.sendMessage(m.chat, {
      forward: { key: m.key, message: original }
    }).catch(() => {})
    sock.sendMessage(m.chat, {
      text: t(locale, 'handler.antideleteNote', { user: `@${m.sender.split('@')[0]}` }),
      mentions: [m.sender]
    }).catch(() => {})
  }

  // ---- Main entry ----
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const raw of messages) {
      try {
        await handleMessage(raw)
      } catch (e) {
        logger.error({ err: e }, 'failed to process message')
      }
    }
  })

  async function handleMessage (raw) {
    if (!raw.message) return
    const jid = raw.key.remoteJid
    if (jid === 'status@broadcast' || jid?.endsWith('@broadcast') || jid?.endsWith('@newsletter')) return

    const m = serialize(sock, raw)

    // Protocol messages (revocations) → antidelete
    if (m.mtype === 'protocolMessage') {
      handleRevoke(m)
      return
    }
    // Group action stubs are handled by events.js
    if (m.messageStubType) return

    if (!m.isBaileys) cacheMessage(m)
    if (m.isBaileys) return

    // ---- Database & locale ----
    const user = db.ensureUser(m.sender, m.pushName)
    const chat = db.ensureChat(m.chat)
    const settings = db.settings(sock.user.id)
    user.msgs = (user.msgs || 0) + 1
    m.locale = resolveLocale([user.locale, chat.locale, config.locale])

    // ---- AFK ----
    if (user.afk > -1) {
      const away = Math.round((Date.now() - user.afk) / 1000)
      user.afk = -1
      user.afkReason = ''
      m.reply(t(m.locale, 'handler.afkBack', { time: msToTime(away * 1000) })).catch(() => {})
    } else if (m.mentionedJid?.length) {
      for (const j of m.mentionedJid) {
        const mentioned = db.data.users[j]
        if (mentioned?.afk > -1) {
          m.reply(t(m.locale, 'handler.afkMention', {
            user: `@${j.split('@')[0]}`,
            time: msToTime((Date.now() - mentioned.afk) * 1000),
            reason: mentioned.afkReason || ''
          }), { mentions: [j] }).catch(() => {})
        }
      }
    }

    // ---- Mode filters ----
    if (settings.self && !m.fromMe && !isROwner(m.sender)) return
    if (settings.pconly && m.isGroup) return
    if (settings.gconly && !m.isGroup) return

    // ---- Antilink ----
    if (chat.antilink && m.isGroup && !m.fromMe && GROUP_LINK_RE.test(m.text)) {
      const meta = await getGroupMetadata(m.chat)
      const isAdmin = await participantIsAdmin(meta, m.sender)
      if (!isAdmin) {
        const botAdmin = await participantIsAdmin(meta, sock.user.id)
        if (botAdmin) {
          await sock.sendMessage(m.chat, { delete: m.key }).catch(() => {})
          m.reply(t(m.locale, 'handler.antilinkDeleted')).catch(() => {})
        } else {
          m.reply(t(m.locale, 'handler.antilinkNoPerm')).catch(() => {})
        }
        logger.warn({ chat: m.chat, from: m.sender }, 'antilink triggered')
        return
      }
    }

    // ---- Command parsing ----
    const prefixes = config.prefix?.length ? config.prefix : ['.']
    const usedPrefix = prefixes.find(p => m.text.startsWith(p))
    if (!usedPrefix) return

    const noPrefix = m.text.slice(usedPrefix.length).trim()
    const [cmdStr, ...args] = noPrefix.split(/\s+/).filter(Boolean)
    if (!cmdStr) return
    const command = cmdStr.toLowerCase()

    const def = registry.find(command)
    if (!def) {
      if (command.length >= 3) {
        let best = null
        let bestDist = 3
        for (const name of registry.commands.keys()) {
          const d = levenshtein(command, name)
          if (d < bestDist) { bestDist = d; best = name }
        }
        if (best && bestDist <= 2) {
          m.reply(t(m.locale, 'handler.unknownCommand', { prefix: usedPrefix, cmd: best })).catch(() => {})
        }
      }
      return
    }

    // ---- Permissions ----
    const isOwner = m.fromMe || isROwner(m.sender)
    const isMod = isOwner || config.mods.map(numberJid).includes(m.sender)
    const isPremium = isOwner || user.premium === true

    if (user.banned && !isOwner) return
    if (chat.isBanned && !isROwner(m.sender)) return

    const perms = [].concat(def.permission || [])
    const fail = (type) => {
      m.reply(t(m.locale, `perms.${type}`)).catch(() => {})
      return false
    }

    let meta = null
    let isAdmin = false
    let botAdmin = false
    if (m.isGroup && (perms.includes('admin') || perms.includes('botAdmin') || def.needsMeta)) {
      meta = await getGroupMetadata(m.chat)
      isAdmin = await participantIsAdmin(meta, m.sender)
      botAdmin = await participantIsAdmin(meta, sock.user.id)
    }

    if (perms.includes('rowner') && !isROwner(m.sender)) return fail('rowner')
    if (perms.includes('owner') && !isOwner) return fail('owner')
    if (perms.includes('mod') && !isMod) return fail('mod')
    if (perms.includes('premium') && !isPremium) return fail('premium')
    if (perms.includes('group') && !m.isGroup) return fail('group')
    if (perms.includes('private') && m.isGroup) return fail('private')
    if (perms.includes('admin') && !isAdmin) return fail('admin')
    if (perms.includes('botAdmin') && !botAdmin) return fail('botAdmin')

    // ---- Flood protection ----
    if (!isOwner) {
      const flood = checkFlood(m.sender)
      if (flood === 'just') {
        m.reply(t(m.locale, 'handler.flood')).catch(() => {})
        logger.warn({ from: m.sender }, 'flood protection triggered')
        return
      }
      if (flood) return // silently ignore while blocked
    }

    // ---- Limit ----
    if (def.limit && !isPremium && !isOwner && (user.limit || 0) < 1) {
      m.reply(t(m.locale, 'handler.noLimit', {
        amount: config.limits.dailyClaim,
        prefix: usedPrefix
      })).catch(() => {})
      return
    }

    // ---- Cooldown ----
    const cdSeconds = def.cooldown ?? config.limits.commandCooldown
    if (cdSeconds > 0 && !isOwner) {
      const key = `${m.sender}:${command}`
      const last = cooldowns.get(key) || 0
      const remain = cdSeconds * 1000 - (Date.now() - last)
      if (remain > 0) {
        m.reply(t(m.locale, 'handler.cooldown', {
          cmd: command,
          seconds: Math.ceil(remain / 1000)
        })).catch(() => {})
        return
      }
      cooldowns.set(key, Date.now())
      // keep the map bounded
      if (cooldowns.size > 5000) {
        const cutoff = Date.now() - 60_000
        for (const [k, ts] of cooldowns) {
          if (ts < cutoff) cooldowns.delete(k)
        }
      }
    }

    // ---- Execution ----
    m.isCommand = true
    m.usedPrefix = usedPrefix
    m.command = command

    const ctx = {
      m,
      sock,
      db,
      config,
      logger,
      registry,
      command,
      usedPrefix,
      prefix: usedPrefix,
      args,
      text: args.join(' ').trim(),
      user,
      chat,
      settings,
      sender: m.sender,
      pushName: m.pushName || user.name,
      locale: m.locale,
      t: (key, params) => t(m.locale, key, params),
      isGroup: m.isGroup,
      isPrivate: !m.isGroup,
      isOwner,
      isROwner: isROwner(m.sender),
      isMod,
      isPremium,
      getGroupMetadata: () => (m.isGroup ? getGroupMetadata(m.chat) : null),
      getAdminStatus: async () => {
        if (!m.isGroup) return { isAdmin: false, botAdmin: false }
        const gmeta = await getGroupMetadata(m.chat)
        return {
          isAdmin: await participantIsAdmin(gmeta, m.sender),
          botAdmin: await participantIsAdmin(gmeta, sock.user.id)
        }
      },
      reply: (text, opts) => sock.sendMessage(m.chat, { text: String(text) }, { quoted: m, ...opts }),
      cmd: def
    }

    let ok = true
    try {
      await def.run(ctx)
    } catch (e) {
      ok = false
      const text = redactSecrets(String(e?.message || e || 'unknown error')).slice(0, 300)
      m.reply(t(m.locale, 'general.error', { msg: text })).catch(() => {})
      m.react('❌').catch(() => {})
      logger.error({ err: e }, `command error: ${command}`)
    }

    // ---- Bookkeeping ----
    db.bumpStat(command, ok)
    if (ok) {
      const newLevel = db.addExp(m.sender, def.exp ?? 10)
      if (newLevel) {
        const { getRoleName } = await import('../i18n/index.js')
        m.reply(t(m.locale, 'handler.levelUp', {
          name: user.name || m.pushName || 'Kullanıcı',
          level: newLevel,
          role: getRoleName(m.locale, newLevel)
        })).catch(() => {})
      }
      if (def.limit && !isPremium && !isOwner) user.limit = Math.max(0, (user.limit || 0) - 1)
    }

    printMessage(logger, { ...m, isCommand: true, usedPrefix, command })
    if (settings.autoread) sock.readMessages([m.key]).catch(() => {})
  }

  return { getGroupMetadata, msgCache }
}
