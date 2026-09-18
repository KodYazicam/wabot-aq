/** Owner settings: bot mode, autoread, anticall, chat filters, prefix, profile. */

const TOGGLES = {
  self: { key: 'self', on: 'settings.selfOn', off: 'settings.selfOff' },
  autoread: { key: 'autoread', on: 'settings.autoreadOn', off: 'settings.autoreadOff' },
  anticall: { key: 'anticall', on: 'settings.anticallOn', off: 'settings.anticallOff' },
  pconly: { key: 'pconly', on: 'settings.pconlyOn', off: 'settings.pconlyOff' },
  gconly: { key: 'gconly', on: 'settings.gconlyOn', off: 'settings.gconlyOff' }
}

export const commands = [
  {
    name: 'mode',
    aliases: ['self', 'public'],
    category: 'settings',
    description: 'Switch between self (owner only) and public mode',
    permission: 'owner',
    async run (ctx) {
      const settings = ctx.settings
      const want = ctx.command === 'self' ? true : ctx.command === 'public' ? false : ctx.args[0] === 'on' || ctx.args[0] === 'self'
      settings.self = want
      await ctx.reply(ctx.t(want ? 'settings.selfOn' : 'settings.selfOff'))
    }
  },
  {
    name: 'setting',
    aliases: ['toggle', 'autoread', 'anticall', 'pconly', 'gconly'],
    category: 'settings',
    description: 'Toggle bot settings: autoread, anticall, pconly, gconly',
    usage: '<name> [on/off]',
    permission: 'owner',
    async run (ctx) {
      const settings = ctx.settings
      let name = ctx.command
      let explicit = ['on', 'off'].includes((ctx.args[0] || '').toLowerCase()) ? ctx.args[0].toLowerCase() : null
      if (name === 'setting' || name === 'toggle') {
        name = (ctx.args[0] || '').toLowerCase()
        explicit = ['on', 'off'].includes((ctx.args[1] || '').toLowerCase()) ? ctx.args[1].toLowerCase() : null
        if (!name || !TOGGLES[name]) {
          return ctx.reply(ctx.t('settings.usage', { prefix: ctx.usedPrefix }))
        }
      }
      const toggle = TOGGLES[name]
      if (!toggle) return ctx.reply(ctx.t('settings.usage', { prefix: ctx.usedPrefix }))

      settings[toggle.key] = explicit === null ? !settings[toggle.key] : explicit === 'on'
      await ctx.reply(ctx.t(settings[toggle.key] ? toggle.on : toggle.off))
    }
  },
  {
    name: 'setprefix',
    category: 'settings',
    description: 'Change the command prefix',
    usage: '<prefix>',
    permission: 'rowner',
    async run (ctx) {
      const p = ctx.args[0]
      if (!p || p.length > 3) return ctx.reply(ctx.t('settings.prefixUsage', { prefix: ctx.usedPrefix }))
      ctx.config.prefix = p.split('')
      await ctx.m.react('✅')
      await ctx.reply(ctx.t('settings.prefixSet', { prefix: p }))
    }
  },
  {
    name: 'setbotname',
    category: 'settings',
    description: 'Change the bot display name',
    usage: '<name>',
    permission: 'rowner',
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('settings.nameUsage', { prefix: ctx.usedPrefix }))
      ctx.config.botName = ctx.text.slice(0, 60)
      await ctx.sock.updateProfileName(ctx.config.botName)
      await ctx.reply(ctx.t('settings.nameSet', { name: ctx.config.botName }))
    }
  },
  {
    name: 'setpp',
    category: 'settings',
    description: 'Set the bot profile picture (reply to an image)',
    permission: 'rowner',
    async run (ctx) {
      const buf = await (ctx.m.quoted?.mtype === 'imageMessage' ? ctx.m.quoted.download() : ctx.m.mtype === 'imageMessage' ? ctx.m.download() : null)
      if (!buf) return ctx.reply(ctx.t('general.noImageReply'))
      await ctx.sock.updateProfilePicture(ctx.sock.user.id, buf)
      await ctx.m.react('✅')
    }
  },
  {
    name: 'setexif',
    category: 'sticker',
    description: 'Set default sticker watermark (pack|author)',
    usage: '<packname|author>',
    permission: 'owner',
    async run (ctx) {
      if (!ctx.text.includes('|')) return ctx.reply(ctx.t('sticker.exifUsage', { prefix: ctx.usedPrefix }))
      const [packname, author] = ctx.text.split('|').map(s => s.trim())
      ctx.config.sticker.packname = packname
      ctx.config.sticker.author = author || ''
      await ctx.m.react('✅')
      await ctx.reply(ctx.t('sticker.exifSet', { packname, author: author || '—' }))
    }
  }
]
