/** Language commands: list locales, switch personal / chat / global language. */
import { availableLocales, resolveLocale } from '../i18n/index.js'

function flagFor (code) {
  return { en: '🇬🇧', tr: '🇹🇷', id: '🇮🇩', es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷', pt: '🇵🇹', ru: '🇷🇺', ar: '🇸🇦' }[code] || '🌐'
}

export const commands = [
  {
    name: 'lang',
    aliases: ['language', 'locale', 'dil'],
    category: 'settings',
    description: 'Show or change the bot language',
    usage: '[code]',
    async run (ctx) {
      const locales = availableLocales()
      const list = locales.map(code => `${flagFor(code)} ${code}`).join(' · ')

      const code = (ctx.args[0] || '').toLowerCase()
      if (!code) {
        return ctx.reply(ctx.t('lang.show', {
          current: ctx.locale,
          list,
          prefix: ctx.usedPrefix,
          examples: locales.slice(0, 4).map(l => `${ctx.usedPrefix}lang ${l}`).join(' | ')
        }))
      }
      if (!locales.includes(code)) {
        return ctx.reply(ctx.t('lang.unknown', { code, list, prefix: ctx.usedPrefix }))
      }

      if (ctx.isGroup) {
        // In groups: admins set the chat language, users set their own
        const { isAdmin } = await ctx.getAdminStatus()
        if (isAdmin || ctx.isOwner) {
          ctx.chat.locale = code
          await ctx.m.react('✅')
          return ctx.reply(ctx.t('lang.chatSet', { locale: code, flag: flagFor(code) }))
        }
        ctx.user.locale = code
        await ctx.m.react('✅')
        return ctx.reply(ctx.t('lang.userSet', { locale: code, flag: flagFor(code) }))
      }

      // Private chat: owner also changes the global default
      if (ctx.isROwner && ctx.args[1] === 'global') {
        ctx.config.locale = code
        await ctx.m.react('✅')
        return ctx.reply(ctx.t('lang.globalSet', { locale: code, flag: flagFor(code) }))
      }
      ctx.user.locale = code
      await ctx.m.react('✅')
      const locale = resolveLocale([code, ctx.config.locale])
      const { t } = await import('../i18n/index.js')
      return ctx.reply(t(locale, 'lang.userSet', { locale: code, flag: flagFor(code) }))
    }
  }
]
