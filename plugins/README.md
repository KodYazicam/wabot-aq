# External plugins

Drop `.js` files in this directory to add commands without editing the core
tree.

```bash
cp plugins/_example.js plugins/hello.js
# edit it, save it — the bot hot-reloads it
```

A plugin file exports the same `commands` array as the built-in modules:

```js
export const commands = [
  {
    name: 'hello',
    aliases: ['hi'],
    category: 'other',
    description: 'Say hello',
    async run (ctx) {
      await ctx.reply(ctx.t('plugins.hello', { name: ctx.pushName || 'friend' }))
    }
  }
]
```

## Rules and behaviour

- Files starting with `_` are ignored. `_example.js` is a template, not a live
  command.
- Plugins are loaded **after** `src/commands/`. A plugin can override a built-in
  name or alias, and the registry logs a warning when that happens. Prefer a
  unique name such as `mybot-status`.
- Both `src/commands/` and `plugins/` are watched when hot reload is enabled.
- Plugins are **trusted local code**, exactly like the built-in commands. There
  is no sandbox. Only install plugins you understand.
- The built-in `plugins.hello` translation is available to the example.
  Plugins can also ship their own translations (see below).

## Plugin translations

A plugin can keep its strings next to its code instead of editing the core
locale files:

```text
plugins/
  hello.js
  locales/
    hello/
      en.json
      tr.json
```

```json
{
  "greeting": "Hello {name}!",
  "usage": "Usage: {prefix}hello"
}
```

Keys are exposed as `plugin.<directory>.<key>`, so the command uses:

```js
await ctx.reply(ctx.t('plugin.hello.greeting', { name: ctx.pushName || 'friend' }))
```

Only the six core locale codes (`en`, `tr`, `es`, `id`, `de`, `fr`) are merged.
A missing language falls back through the normal chain to English. Files for
unknown locale codes are skipped with a warning, and the directory name is
used as the namespace.

Plugin locale JSON is read once at startup; restart the bot after editing it.
Plugin `.js` files still hot-reload normally.

## Docker

`docker-compose.yml` mounts `./plugins` into the container, so editing a plugin
on the host and restarting/reloading the container is enough. The image also
contains the example and this README.

Use `.plugins` in WhatsApp to list the external files the registry currently
sees.
