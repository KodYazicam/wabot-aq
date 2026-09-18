/** Fun commands: 8ball, pick, rate, match, jokes, quotes. */
import { randomPick, hashPercent, progressBar } from '../lib/utils.js'

export const commands = [
  {
    name: '8ball',
    aliases: ['ball'],
    category: 'fun',
    description: 'Ask the magic 8-ball',
    usage: '<question>',
    cooldown: 3,
    async run (ctx) {
      if (!ctx.text) return ctx.reply(ctx.t('fun.ballUsage', { cmd: ctx.usedPrefix + '8ball' }))
      const { tArray } = await import('../i18n/index.js')
      const answers = tArray(ctx.locale, 'fun.ballAnswers')
      if (!answers.length) return ctx.reply(ctx.t('fun.ballUsage', { cmd: ctx.usedPrefix + '8ball' }))
      await ctx.reply(ctx.t('fun.ballResult', { question: ctx.text, answer: randomPick(answers) }))
    }
  },
  {
    name: 'pick',
    category: 'fun',
    description: 'Pick randomly between options',
    usage: '<a|b|c…>',
    cooldown: 3,
    async run (ctx) {
      const options = ctx.text.split('|').map(s => s.trim()).filter(Boolean)
      if (options.length < 2) return ctx.reply(ctx.t('fun.pickUsage', { cmd: ctx.usedPrefix + 'pick' }))
      await ctx.reply(ctx.t('fun.pickResult', {
        options: options.join(ctx.t('fun.pickSeparator')),
        choice: randomPick(options)
      }))
    }
  },
  {
    name: 'rate',
    category: 'fun',
    description: 'Rate anything out of 10',
    usage: '<thing>',
    cooldown: 3,
    async run (ctx) {
      const thing = ctx.text || ctx.t('fun.rateDefault')
      const percent = hashPercent(thing + 'rate') * 10 / 100
      const score = Math.round(percent * 10) / 10
      await ctx.reply(ctx.t('fun.rateResult', {
        thing,
        score,
        bar: progressBar(percent)
      }))
    }
  },
  {
    name: 'match',
    aliases: ['ship', 'uyum'],
    category: 'fun',
    description: 'Compatibility between two mentioned people',
    permission: 'group',
    cooldown: 5,
    async run (ctx) {
      const jids = ctx.m.mentionedJid || []
      if (jids.length < 2) return ctx.reply(ctx.t('fun.matchUsage', { cmd: ctx.usedPrefix + 'match' }))
      const percent = hashPercent(jids.join(''))
      await ctx.reply(ctx.t('fun.matchResult', {
        a: `@${jids[0].split('@')[0]}`,
        b: `@${jids[1].split('@')[0]}`,
        percent,
        bar: progressBar(percent)
      }), { mentions: jids })
    }
  },
  {
    name: 'joke',
    aliases: ['saka'],
    category: 'fun',
    description: 'Tell a random joke',
    cooldown: 3,
    async run (ctx) {
      const { tArray } = await import('../i18n/index.js')
      const jokes = tArray(ctx.locale, 'fun.jokes')
      if (!jokes.length) return ctx.reply(ctx.t('fun.jokesUnavailable'))
      await ctx.reply(randomPick(jokes))
    }
  },
  {
    name: 'quote',
    aliases: ['alinti'],
    category: 'fun',
    description: 'Share an inspirational quote',
    cooldown: 3,
    async run (ctx) {
      const { tArray } = await import('../i18n/index.js')
      const quotes = tArray(ctx.locale, 'fun.quotes')
      if (!quotes.length) return ctx.reply(ctx.t('fun.jokesUnavailable'))
      await ctx.reply(randomPick(quotes))
    }
  },
  {
    name: 'russianroulette',
    aliases: ['rr'],
    category: 'fun',
    description: 'Russian roulette (1 in 6 chance of "losing")',
    cooldown: 5,
    async run (ctx) {
      const chambers = [1, 2, 3, 4, 5, 6]
      const bullet = randomPick(chambers)
      const spin = randomPick(chambers)
      if (spin === bullet) {
        await ctx.m.react('💥')
        return ctx.reply(ctx.t('fun.rrBang'))
      }
      await ctx.m.react('🟢')
      await ctx.reply(ctx.t('fun.rrClick'))
    }
  }
]
