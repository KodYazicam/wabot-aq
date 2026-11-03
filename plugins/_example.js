/**
 * Example external plugin.
 *
 * The leading underscore makes the registry skip this file. Copy it to
 * `plugins/hello.js` (or write your own file) to load it automatically.
 *
 * A plugin file uses exactly the same contract as the built-in commands:
 * export a `commands` array, give each command a name and a run() function.
 */
export const commands = [
  {
    name: 'hello',
    aliases: ['hi'],
    category: 'other',
    description: 'Example command loaded from the plugins/ directory',
    cooldown: 3,
    async run (ctx) {
      await ctx.reply(ctx.t('plugins.hello', {
        name: ctx.pushName || ctx.user?.name || 'friend'
      }))
    }
  }
]
