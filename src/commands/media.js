/** Media conversion commands: sticker→image/video, video→audio, voice notes. */
import { webpToImage, webpToVideo, toAudio, toPTT, toVideo } from '../lib/media.js'
import { fmtBytes } from '../lib/utils.js'

function quotedMedia (ctx) {
  const q = ctx.m.quoted
  if (!q?.msg?.mimetype) return null
  return { download: () => q.download(), mime: q.mime, seconds: q.seconds, mtype: q.mtype }
}

async function getTarget (ctx, wanted) {
  const q = quotedMedia(ctx)
  const src = q || (ctx.m.msg?.mimetype ? { download: () => ctx.m.download(), mime: ctx.m.mime, seconds: ctx.m.seconds, mtype: ctx.m.mtype } : null)
  if (!src) return null
  if (wanted && !new RegExp(wanted).test(src.mime)) return null
  return src
}

export const commands = [
  {
    name: 'toimg',
    aliases: ['toimage', 'img'],
    category: 'media',
    description: 'Convert a sticker to an image (reply to a sticker)',
    cooldown: 5,
    async run (ctx) {
      const q = ctx.m.quoted
      if (q?.mtype !== 'stickerMessage') return ctx.reply(ctx.t('sticker.replySticker'))
      const buf = await q.download()
      const image = await webpToImage(buf)
      await ctx.sock.sendMessage(ctx.m.chat, { image, caption: ctx.t('media.done') }, { quoted: ctx.m })
    }
  },
  {
    name: 'tomp4',
    aliases: ['tovideo'],
    category: 'media',
    description: 'Convert an animated sticker to a video',
    cooldown: 5,
    async run (ctx) {
      const q = ctx.m.quoted
      if (q?.mtype !== 'stickerMessage') return ctx.reply(ctx.t('sticker.replySticker'))
      const buf = await q.download()
      await ctx.m.react('⏳')
      const video = await webpToVideo(buf)
      await ctx.sock.sendMessage(ctx.m.chat, { video, caption: ctx.t('media.done') }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  },
  {
    name: 'tomp3',
    aliases: ['mp3'],
    category: 'media',
    description: 'Extract audio from a video (reply to a video)',
    cooldown: 5,
    async run (ctx) {
      const src = await getTarget(ctx, 'video|audio')
      if (!src) return ctx.reply(ctx.t('media.replyAudioVideo', { cmd: ctx.usedPrefix + 'tomp3' }))
      await ctx.m.react('⏳')
      const ext = src.mime.split('/')[1]?.split(';')[0] || 'mp4'
      const audio = await toAudio(await src.download(), ext)
      await ctx.sock.sendMessage(ctx.m.chat, {
        document: audio,
        fileName: 'audio.mp3',
        mimetype: 'audio/mpeg'
      }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  },
  {
    name: 'tovn',
    aliases: ['toptt', 'vn'],
    category: 'media',
    description: 'Convert audio/video to a voice note (reply to media)',
    cooldown: 5,
    async run (ctx) {
      const src = await getTarget(ctx, 'video|audio')
      if (!src) return ctx.reply(ctx.t('media.replyAudioVideo', { cmd: ctx.usedPrefix + 'tovn' }))
      await ctx.m.react('⏳')
      const ext = src.mime.split('/')[1]?.split(';')[0] || 'mp4'
      const ptt = await toPTT(await src.download(), ext)
      await ctx.sock.sendMessage(ctx.m.chat, {
        audio: ptt,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  },
  {
    name: 'fixvideo',
    category: 'media',
    description: 'Re-encode a video for WhatsApp compatibility',
    cooldown: 10,
    async run (ctx) {
      const src = await getTarget(ctx, 'video')
      if (!src) return ctx.reply(ctx.t('media.replyVideo', { cmd: ctx.usedPrefix + 'fixvideo' }))
      const buf = await src.download()
      if (buf.length > ctx.config.limits.maxFileSize) {
        return ctx.reply(ctx.t('general.fileTooBig', { size: fmtBytes(buf.length), max: fmtBytes(ctx.config.limits.maxFileSize) }))
      }
      await ctx.m.react('⏳')
      const video = await toVideo(buf, src.mime.split('/')[1]?.split(';')[0] || 'mp4')
      await ctx.sock.sendMessage(ctx.m.chat, { video, caption: ctx.t('media.done') }, { quoted: ctx.m })
      await ctx.m.react('✅')
    }
  }
]
