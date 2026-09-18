/** Downloader commands: YouTube search/play/download, TikTok. */
import yts from 'yt-search'
import { ytDownload, parseVideoId } from '../lib/youtube.js'
import { fmtBytes, fetchBuffer, fetchJson, isUrl } from '../lib/utils.js'

async function resolveQuery (ctx) {
  const query = ctx.text
  if (!query) throw new Error(ctx.t('downloader.noQuery', { cmd: ctx.usedPrefix + ctx.command }))
  if (isUrl(query) && parseVideoId(query)) return query
  const res = await yts(query)
  const candidates = (res.all || []).filter(v => v.type === 'video' && v.seconds && v.seconds < 3600)
  const vid = candidates[0] || (res.videos || []).find(v => v.type !== 'live') || res.videos?.[0]
  if (!vid) throw new Error(ctx.t('downloader.notFound'))
  return vid.url
}

async function youtubeDownload (ctx, mode) {
  const url = await resolveQuery(ctx)
  await ctx.m.react('⏳')
  let media
  try {
    media = await ytDownload(url, { mode, maxSize: ctx.config.limits.maxFileSize })
  } catch (e) {
    if (e.fileTooBig) {
      return ctx.reply(ctx.t('downloader.tooBig', {
        title: e.title || url,
        size: fmtBytes(e.size || 0),
        url
      }))
    }
    throw new Error(ctx.t('downloader.ytdlFail'))
  }

  await ctx.reply(ctx.t('downloader.downloading', { title: media.title, size: fmtBytes(media.size) }))
  if (mode === 'video') {
    await ctx.sock.sendMessage(ctx.m.chat, {
      video: media.buffer,
      caption: ctx.t('downloader.videoCaption', { title: media.title, url })
    }, { quoted: ctx.m })
  } else {
    await ctx.sock.sendMessage(ctx.m.chat, {
      audio: media.buffer,
      mimetype: 'audio/mpeg'
    }, { quoted: ctx.m })
  }
  await ctx.m.react('✅')
}

export const commands = [
  {
    name: 'yts',
    aliases: ['ytsearch', 'youtube'],
    category: 'downloader',
    description: 'Search YouTube videos',
    usage: '<query>',
    cooldown: 5,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('downloader.noQuery', { cmd: ctx.usedPrefix + 'yts' }))
      const res = await yts(ctx.text)
      if (!res.all?.length) return ctx.reply(ctx.t('downloader.notFound'))
      const lines = [ctx.t('downloader.resultsHeader', { query: ctx.text }), '']
      res.all.filter(v => v.type === 'video').slice(0, 8).forEach((v, i) => {
        lines.push(ctx.t('downloader.resultLine', {
          rank: i + 1,
          title: v.title,
          duration: v.timestamp || '—',
          views: Intl.NumberFormat(ctx.locale).format(v.views || 0),
          url: v.url
        }))
      })
      lines.push('')
      lines.push(ctx.t('downloader.resultsFooter', { prefix: ctx.usedPrefix }))
      await ctx.reply(lines.join('\n'))
    }
  },
  {
    name: 'play',
    category: 'downloader',
    description: 'Search YouTube and send the audio',
    usage: '<query>',
    cooldown: 10,
    limit: true,
    async run (ctx) {
      await youtubeDownload(ctx, 'audio')
    }
  },
  {
    name: 'yta',
    aliases: ['playmp3', 'ytaudio'],
    category: 'downloader',
    description: 'Download YouTube audio',
    usage: '<url|query>',
    cooldown: 10,
    limit: true,
    async run (ctx) {
      await youtubeDownload(ctx, 'audio')
    }
  },
  {
    name: 'ytv',
    aliases: ['ytvideo', 'playvideo'],
    category: 'downloader',
    description: 'Download YouTube video',
    usage: '<url|query>',
    cooldown: 10,
    limit: true,
    async run (ctx) {
      await youtubeDownload(ctx, 'video')
    }
  },
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'downloader',
    description: 'Download a TikTok video without watermark',
    usage: '<url>',
    cooldown: 10,
    async run (ctx) {
      const url = ctx.args[0]
      if (!url || !isUrl(url) || !/tiktok\.com/i.test(url)) {
        return ctx.reply(ctx.t('downloader.tiktokUsage', { cmd: ctx.usedPrefix + 'tiktok' }))
      }
      await ctx.m.react('⏳')
      const api = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`)
      if (api.code !== 0 || !api.data?.play) throw new Error(ctx.t('downloader.tiktokFail'))
      const video = await fetchBuffer(api.data.play)
      const music = api.data.music ? await fetchBuffer(api.data.music).catch(() => null) : null
      await ctx.sock.sendMessage(ctx.m.chat, {
        video,
        caption: ctx.t('downloader.tiktokCaption', {
          title: api.data.title || '—',
          author: api.data.author?.nickname || '—'
        })
      }, { quoted: ctx.m })
      if (music) {
        await ctx.sock.sendMessage(ctx.m.chat, { audio: music, mimetype: 'audio/mpeg' }, { quoted: ctx.m })
      }
      await ctx.m.react('✅')
    }
  }
]
