/**
 * Template for new commands — copy this file (the leading underscore keeps
 * the loader from importing it). Each file exports a `commands` array.
 *
 * Supported fields:
 *  - name: command name (required, a-z0-9-)
 *  - aliases: alternative names
 *  - category: menu section ('core', 'sticker', 'tools'…)
 *  - description: short description (menu)
 *  - usage: usage hint (menu)
 *  - cooldown: seconds to wait between uses
 *  - permission: 'owner' | 'rowner' | 'mod' | 'premium' | 'group' |
 *                'private' | 'admin' | 'botAdmin' or an array of these
 *  - limit: true → consumes 1 usage limit
 *  - hidden: hide from the menu
 *
 * The ctx object provides: m, sock, db, config, registry, args, text, t(),
 * reply(), user, chat, locale, isOwner, getGroupMetadata(), …
 */
export const commands = [
  {
    name: 'example',
    category: 'other',
    description: 'Example command — echoes your text',
    usage: '<text>',
    cooldown: 5,
    async run (ctx) {
      await ctx.reply(ctx.t('example.echo', { text: ctx.text || '—' }))
    }
  }
]
