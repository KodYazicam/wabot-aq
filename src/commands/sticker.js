/** Sticker commands: create, watermark, restamp, and text stickers. */
import { toSticker } from '../lib/media.js'
import { MAX_TEXT_LENGTH, textToSticker } from '../lib/textsticker.js'
import { isUrl, fetchBuffer } from '../lib/utils.js'

async function getMedia (ctx) {
  // 1) reply to media, 2) media in this message, 3) URL argument
  if (ctx.m.quoted?.msg?.mimetype) {
    const buf = await ctx.m.quoted.download()
    return { buf, mime: ctx.m.quoted.mime, seconds: ctx.m.quoted.seconds }
  }
  if (ctx.m.msg?.mimetype) {
    const buf = await ctx.m.download()
    return { buf, mime: ctx.m.mime, seconds: ctx.m.seconds }
  }
  if (ctx.args[0] && isUrl(ctx.args[0])) {
    const buf = await fetchBuffer(ctx.args[0])
    return { buf, mime: 'image/jpeg', seconds: 0 }
  }
  return null
}

function textStickerCommand (name, style, description) {
  return {
    name,
    category: 'sticker',
    description,
    usage: '<text>',
    cooldown: 5,
    async run (ctx) {
      const text = (ctx.text || ctx.m.quoted?.text || '').trim()
      if (!text) {
        return ctx.reply(ctx.t('sticker.textUsage', { prefix: ctx.usedPrefix, cmd: name }))
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return ctx.reply(ctx.t('sticker.textTooLong', { max: MAX_TEXT_LENGTH }))
      }

      await ctx.m.react('⏳')
      const sticker = await textToSticker(text, {
        style,
        packname: ctx.config.sticker?.packname || 'Sticker',
        author: ctx.config.sticker?.author || ''
      })
      await ctx.sock.sendMessage(ctx.m.chat, { sticker }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  }
}

export const commands = [
  {
    name: 'sticker',
    aliases: ['s', 'st', 'stiker', 'stickergif'],
    category: 'sticker',
    description: 'Create a sticker from image/video (reply, media or URL)',
    usage: '[url] [packname|author]',
    cooldown: 5,
    async run (ctx) {
      const media = await getMedia(ctx)
      if (!media?.buf) return ctx.reply(ctx.t('general.noMediaReply', { cmd: ctx.usedPrefix + 'sticker' }))

      // optional custom watermark: .sticker MyPack|Author
      let packname = ctx.config.sticker.packname
      let author = ctx.config.sticker.author
      const wm = ctx.args.find(a => a.includes('|') && !isUrl(a))
      if (wm) {
        const [p, a] = wm.split('|').map(s => s.trim())
        packname = p || packname
        author = a ?? author
      }

      await ctx.m.react('⏳')
      const sticker = await toSticker(media.buf, media.mime, { packname, author, duration: media.seconds })
      await ctx.sock.sendMessage(ctx.m.chat, { sticker }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  },
  {
    name: 'stickerwm',
    aliases: ['swm', 'wm'],
    category: 'sticker',
    description: 'Create a sticker with custom watermark',
    usage: '<packname|author>',
    cooldown: 5,
    async run (ctx) {
      if (!ctx.text.includes('|')) return ctx.reply(ctx.t('sticker.wmUsage', { prefix: ctx.usedPrefix }))
      const [packname, author] = ctx.text.split('|').map(s => s.trim())
      const media = await getMedia(ctx)
      if (!media?.buf) return ctx.reply(ctx.t('general.noMediaReply', { cmd: ctx.usedPrefix + 'stickerwm' }))
      await ctx.m.react('⏳')
      const sticker = await toSticker(media.buf, media.mime, { packname, author, duration: media.seconds })
      await ctx.sock.sendMessage(ctx.m.chat, { sticker }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  },
  {
    name: 'take',
    category: 'sticker',
    description: 'Restamp a sticker with your watermark (reply to sticker)',
    usage: '[packname|author]',
    cooldown: 5,
    async run (ctx) {
      const q = ctx.m.quoted
      if (q?.mtype !== 'stickerMessage') return ctx.reply(ctx.t('sticker.replySticker'))
      let packname = ctx.config.sticker.packname
      let author = ctx.config.sticker.author
      if (ctx.text.includes('|')) {
        const [p, a] = ctx.text.split('|').map(s => s.trim())
        packname = p || packname
        author = a ?? author
      }
      const buf = await q.download()
      const { addExif } = await import('../lib/media.js')
      const sticker = await addExif(buf, packname, author)
      await ctx.sock.sendMessage(ctx.m.chat, { sticker }, { quoted: ctx.m })
    }
  },
  textStickerCommand('ttp', 'ttp', 'Create a transparent text sticker with a black outline'),
  textStickerCommand('brat', 'brat', 'Create a white text sticker in the brat style')
]
