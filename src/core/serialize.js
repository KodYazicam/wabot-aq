/**
 * Serializes a WhatsApp proto message into a convenient `m` object.
 * Rewritten for Baileys 7 (replaces the old lib/simple.js smsg()).
 */
import {
  areJidsSameUser,
  downloadContentFromMessage,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent
} from 'baileys'

const MEDIA_TYPES = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  documentMessage: 'document',
  documentWithCaptionMessage: 'document'
}

async function streamToBuffer (stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Download the media of an inner message content; null when no media. */
async function downloadMedia (content) {
  if (!content) return null
  const mtype = getContentType(content)
  if (!mtype || !MEDIA_TYPES[mtype]) return null
  const mediaMsg = mtype === 'documentWithCaptionMessage'
    ? (content[mtype]?.message?.documentMessage || content[mtype])
    : content[mtype]
  if (!mediaMsg?.mediaKey) return null
  const stream = await downloadContentFromMessage(mediaMsg, MEDIA_TYPES[mtype])
  return streamToBuffer(stream)
}

function extractText (content, mtype) {
  const inner = content[mtype]
  if (mtype === 'conversation') return inner ?? ''
  if (mtype === 'extendedTextMessage') return inner?.text ?? ''
  return inner?.caption ?? inner?.text ?? ''
}

/**
 * @param {import('baileys').WASocket} sock
 * @param {import('baileys').proto.IWebMessageInfo} raw
 */
export function serialize (sock, raw) {
  const content = normalizeMessageContent(raw.message)
  const mtype = content ? getContentType(content) : null

  const m = {
    ...raw,
    key: raw.key,
    id: raw.key.id,
    chat: raw.key.remoteJid,
    isBaileys: raw.key.id?.startsWith('3EB0'),
    fromMe: raw.key.fromMe,
    isGroup: raw.key.remoteJid?.endsWith('@g.us'),
    pushName: raw.pushName || '',
    mtype: mtype || '',
    msg: mtype ? content[mtype] : null,
    messageStubType: raw.messageStubType,
    messageStubParameters: raw.messageStubParameters,
    content
  }

  // Sender
  if (m.isGroup) {
    m.sender = jidNormalizedUser(raw.key.participant || m.chat)
  } else if (m.fromMe) {
    m.sender = jidNormalizedUser(sock.user?.id)
  } else {
    m.sender = jidNormalizedUser(m.chat)
  }

  // Text
  m.text = mtype ? extractText(content, mtype) : ''
  if (typeof m.text !== 'string') m.text = ''

  // Mentions
  m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []

  // Quoted message
  const quotedContent = m.msg?.contextInfo?.quotedMessage
  if (quotedContent) {
    const qContent = normalizeMessageContent(quotedContent)
    const qMtype = qContent ? getContentType(qContent) : null
    const q = {
      chat: m.chat,
      sender: jidNormalizedUser(m.msg.contextInfo.participant || m.sender),
      mtype: qMtype || '',
      msg: qMtype ? qContent[qMtype] : null,
      key: {
        remoteJid: m.chat,
        fromMe: areJidsSameUser(m.msg.contextInfo.participant, sock.user?.id),
        id: m.msg.contextInfo.stanzaId
      }
    }
    q.text = qMtype ? extractText(qContent, qMtype) : ''
    if (typeof q.text !== 'string') q.text = ''
    q.mentionedJid = q.msg?.contextInfo?.mentionedJid || []
    q.download = () => downloadMedia(qContent)
    m.quoted = q
  } else {
    m.quoted = null
  }

  // Media helpers
  m.download = () => downloadMedia(content)
  m.mime = m.msg?.mimetype || (m.mtype === 'stickerMessage' ? 'image/webp' : '')
  m.seconds = m.msg?.seconds || m.msg?.duration || 0

  // Convenience helpers
  m.reply = (text, opts = {}) =>
    sock.sendMessage(m.chat, { text: String(text) }, { quoted: m, ...opts })

  m.react = (emoji) =>
    sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } })

  return m
}

export default serialize
