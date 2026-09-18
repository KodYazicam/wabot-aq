/** Utility commands: TTS, translate, weather, Wikipedia, QR, calculator… */
import crypto from 'node:crypto'
import QRCode from 'qrcode'
import {
  fetchJson,
  fetchBuffer,
  isUrl,
  safeMath,
  randomPick
} from '../lib/utils.js'

// Weather code → description key (open-meteo)
const WEATHER_KEYS = {
  0: 'weather.clear', 1: 'weather.mostlyClear', 2: 'weather.partlyCloudy', 3: 'weather.overcast',
  45: 'weather.fog', 48: 'weather.rimeFog',
  51: 'weather.drizzleLight', 53: 'weather.drizzle', 55: 'weather.drizzleDense',
  61: 'weather.rainLight', 63: 'weather.rain', 65: 'weather.rainHeavy',
  66: 'weather.rainFreezing', 67: 'weather.rainFreezing',
  71: 'weather.snowLight', 73: 'weather.snow', 75: 'weather.snowHeavy', 77: 'weather.snowGrains',
  80: 'weather.showersLight', 81: 'weather.showers', 82: 'weather.showersViolent',
  85: 'weather.snowShowers', 86: 'weather.snowShowers',
  95: 'weather.thunder', 96: 'weather.thunderHail', 99: 'weather.thunderHail'
}

export const commands = [
  {
    name: 'tts',
    aliases: ['say'],
    category: 'tools',
    description: 'Convert text to a voice note',
    usage: '[lang] <text>',
    cooldown: 5,
    async run (ctx) {
      let lang = 'en'
      let text = ctx.text
      if (ctx.args[0]?.length === 2 && /^[a-z]{2}$/i.test(ctx.args[0])) {
        lang = ctx.args[0].toLowerCase()
        text = ctx.args.slice(1).join(' ')
      }
      if (!text) return ctx.reply(ctx.t('tools.ttsUsage', { cmd: ctx.usedPrefix + 'tts' }))
      if (text.length > 500) text = text.slice(0, 500)
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
      const audio = await fetchBuffer(url)
      await ctx.sock.sendMessage(ctx.m.chat, { audio, mimetype: 'audio/mpeg' }, { quoted: ctx.m })
    }
  },
  {
    name: 'translate',
    aliases: ['tr', 'cevir'],
    category: 'tools',
    description: 'Translate text (auto-detect source language)',
    usage: '<lang> <text>',
    cooldown: 3,
    async run (ctx) {
      const lang = (ctx.args[0] || '').toLowerCase()
      const text = ctx.args.slice(1).join(' ')
      if (!/^[a-z]{2}$/.test(lang) || !text) {
        return ctx.reply(ctx.t('tools.translateUsage', { cmd: ctx.usedPrefix + 'translate' }))
      }
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
      const data = await fetchJson(url)
      const translated = (data[0] || []).map(seg => seg[0]).join('')
      if (!translated) throw new Error(ctx.t('tools.translateFail'))
      await ctx.reply(ctx.t('tools.translateResult', {
        from: data[2] || '?',
        to: lang,
        text: translated
      }))
    }
  },
  {
    name: 'weather',
    aliases: ['hava'],
    category: 'tools',
    description: 'Current weather for a city',
    usage: '<city>',
    cooldown: 5,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('tools.weatherUsage', { cmd: ctx.usedPrefix + 'weather' }))
      const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ctx.text)}&count=1&language=${ctx.locale}`)
      if (!geo.results?.length) return ctx.reply(ctx.t('tools.weatherNotFound', { city: ctx.text }))
      const place = geo.results[0]
      const weather = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`)
      const c = weather.current || {}
      await ctx.reply(ctx.t('tools.weatherResult', {
        city: place.name,
        country: place.country || '',
        temp: Math.round(c.temperature_2m ?? 0),
        feels: Math.round(c.apparent_temperature ?? 0),
        desc: ctx.t(WEATHER_KEYS[c.weather_code] || 'weather.unknown'),
        wind: Math.round(c.wind_speed_10m ?? 0),
        humidity: c.relative_humidity_2m ?? 0
      }))
    }
  },
  {
    name: 'wiki',
    aliases: ['wikipedia'],
    category: 'tools',
    description: 'Wikipedia summary',
    usage: '<query>',
    cooldown: 5,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('tools.wikiUsage', { cmd: ctx.usedPrefix + 'wiki' }))
      const search = await fetchJson(`https://${ctx.locale}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(ctx.text)}&format=json&origin=*&srlimit=1`)
      const hit = search.query?.search?.[0]
      if (!hit) return ctx.reply(ctx.t('tools.wikiNotFound', { query: ctx.text }))
      const page = await fetchJson(`https://${ctx.locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`)
      if (!page.extract) return ctx.reply(ctx.t('tools.wikiNotFound', { query: ctx.text }))
      let thumb = null
      if (page.thumbnail?.source) {
        thumb = await fetchBuffer(page.thumbnail.source).catch(() => null)
      }
      const caption = ctx.t('tools.wikiResult', { title: page.title, extract: page.extract, url: page.content_urls?.desktop?.page || '' })
      await ctx.sock.sendMessage(ctx.m.chat, {
        ...(thumb ? { image: thumb, caption } : { text: caption })
      }, { quoted: ctx.m })
    }
  },
  {
    name: 'qr',
    aliases: ['qrcode'],
    category: 'tools',
    description: 'Generate a QR code image',
    usage: '<text|url>',
    cooldown: 3,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('tools.qrUsage', { cmd: ctx.usedPrefix + 'qr' }))
      const png = await QRCode.toBuffer(ctx.text.slice(0, 1000), { margin: 2, width: 512 })
      await ctx.sock.sendMessage(ctx.m.chat, { image: png, caption: ctx.t('tools.qrCaption') }, { quoted: ctx.m })
    }
  },
  {
    name: 'calc',
    aliases: ['math', 'hesapla'],
    category: 'tools',
    description: 'Safe calculator (no eval)',
    usage: '<expression>',
    cooldown: 3,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('tools.calcUsage', { cmd: ctx.usedPrefix + 'calc' }))
      const result = safeMath(ctx.text)
      await ctx.reply(ctx.t('tools.calcResult', { expr: ctx.text, result }))
    }
  },
  {
    name: 'base64',
    aliases: ['b64'],
    category: 'tools',
    description: 'Base64 encode/decode',
    usage: 'enc|dec <text>',
    cooldown: 3,
    async run (ctx) {
      const mode = (ctx.args[0] || '').toLowerCase()
      const text = ctx.args.slice(1).join(' ')
      if (!['enc', 'dec'].includes(mode) || !text) {
        return ctx.reply(ctx.t('tools.base64Usage', { cmd: ctx.usedPrefix + 'base64' }))
      }
      const result = mode === 'enc'
        ? Buffer.from(text, 'utf8').toString('base64')
        : Buffer.from(text, 'base64').toString('utf8')
      await ctx.reply(ctx.t('tools.base64Result', { mode, result }))
    }
  },
  {
    name: 'shorturl',
    aliases: ['shorten'],
    category: 'tools',
    description: 'Shorten a URL (is.gd)',
    usage: '<url>',
    cooldown: 3,
    async run (ctx) {
      const url = ctx.args[0]
      if (!url || !isUrl(url)) return ctx.reply(ctx.t('tools.shortUrlUsage', { cmd: ctx.usedPrefix + 'shorturl' }))
      const data = await fetchJson(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`)
      if (!data.shorturl) throw new Error(ctx.t('tools.shortUrlFail'))
      await ctx.reply(ctx.t('tools.shortUrlResult', { url: data.shorturl }))
    }
  },
  {
    name: 'pass',
    aliases: ['password'],
    category: 'tools',
    description: 'Generate a secure random password',
    usage: '[length]',
    cooldown: 3,
    async run (ctx) {
      const len = Math.min(Math.max(parseInt(ctx.args[0]) || 16, 8), 64)
      const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*-_+'
      const bytes = crypto.randomBytes(len)
      const pass = Array.from(bytes, b => chars[b % chars.length]).join('')
      await ctx.reply(ctx.t('tools.passwordResult', { password: pass, length: len }))
    }
  },
  {
    name: 'readmore',
    aliases: ['spoiler'],
    category: 'tools',
    description: 'Hide text behind a "read more" collapse',
    usage: '<visible>|<hidden>',
    cooldown: 3,
    async run (ctx) {
      if (!ctx.text.includes('|')) return ctx.reply(ctx.t('tools.readmoreUsage', { cmd: ctx.usedPrefix + 'readmore' }))
      const [visible, hidden] = ctx.text.split('|')
      const readMore = String.fromCharCode(8206).repeat(400)
      await ctx.sock.sendMessage(ctx.m.chat, {
        text: `${visible.trim()}\n${readMore}\n${hidden.trim()}`
      }, { quoted: ctx.m })
    }
  },
  {
    name: 'flip',
    category: 'fun',
    description: 'Flip a coin',
    async run (ctx) {
      const side = Math.random() < 0.5 ? 'tools.heads' : 'tools.tails'
      await ctx.reply(ctx.t('tools.coinFlip', { side: ctx.t(side) }))
    }
  },
  {
    name: 'dice',
    category: 'fun',
    description: 'Roll a dice',
    async run (ctx) {
      const n = Math.floor(Math.random() * 6) + 1
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
      await ctx.reply(ctx.t('tools.dice', { n, face: faces[n - 1] }))
    }
  }
]
