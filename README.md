# wabot-aq 3.0

Modern, multi-language WhatsApp bot — a complete rewrite of [Nurutomo/wabot-aq](https://github.com/Nurutomo/wabot-aq) on top of **Baileys 7 (multi-device)**.

> ⚠️ **Note:** unofficial automation of WhatsApp may violate the WhatsApp Terms of Service and can get your number banned. Use at your own risk.

## Highlights

- **Multi-device, no browser** — pure WebSocket via [Baileys 7](https://npm.im/baileys)
- **🌍 Multi-language** — bot UI ships with English, Turkish, Indonesian and Spanish; per-user, per-group and global language (`en` default, 140+ localized strings with graceful fallback)
- **122 commands** across 11 categories (stickers, downloads, AI, tools, group admin, fun, RPG…)
- **Layered YouTube engine** — InnerTube API → ytdl-core → yt-dlp fallback chain, so downloads keep working when one engine breaks
- **Self-contained** — JSON database with atomic writes, command hot-reload, auto-reconnect with backoff
- **Web panel** (optional) — scan the pairing QR from your browser on a headless VPS
- **Safe by design** — no `eval`, safe math parser, size guards, anti-spam cooldowns, warning system

## Requirements

- Node.js **≥ 18.17** (20/22 recommended)
- **ffmpeg** (stickers, media conversions)
- A WhatsApp account (to pair as a "linked device")

## Quick start

```bash
git clone https://github.com/Nurutomo/wabot-aq
cd wabot-aq
npm install

cp .env.example .env
# edit .env — set at least OWNER=your_number (e.g. 905xxxxxxxxx)

npm start
```

Scan the QR shown in the terminal (WhatsApp → Settings → Linked devices → Link a device). Done.

### Docker

```bash
cp .env.example .env   # edit OWNER etc.
docker compose up -d --build
```

If `WEB_SERVER=true` (or `--server`), open `http://localhost:3000` and scan the QR from your browser — ideal for a headless VPS.

### Self-test

```bash
npm run selftest
```

Checks ffmpeg, sharp, sticker EXIF, i18n, database, all commands and external APIs — without connecting.

## Configuration (`.env`)

| Key | Default | Description |
|---|---|---|
| `BOT_NAME` | `Aqua Bot` | Display name |
| `OWNER` | — | Bot owner number(s), comma separated. **Set this!** |
| `LOCALE` | `en` | Default language: `en`, `tr`, `id`, `es` |
| `PREFIX` | `.` | Command prefix (multi allowed) |
| `SESSION_NAME` | `aqua` | Session folder under `sessions/` |
| `MODE` | `public` | `public` (everyone) or `self` (owner only) |
| `TZ` | `Europe/Istanbul` | Timezone |
| `WEB_SERVER` / `WEB_PORT` | `false` / `3000` | QR/status web panel |
| `AI_API_KEY` | — | Any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Ollama…) |
| `AI_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `AI_MODEL` | `gpt-4o-mini` | Chat model |
| `MAX_FILE_SIZE` | `104857600` | Download size limit (bytes) |
| `COMMAND_COOLDOWN` | `3` | Default per-command cooldown (seconds) |
| `STICKER_PACKNAME` / `STICKER_AUTHOR` | — | Sticker watermark |

Legacy CLI flags still work: `node src/index.js [--session name] [--prefix .!] [--server] [--big-qr] [--debug] [--trace]`

## Languages

| Code | Language | Coverage |
|---|---|---|
| `en` | English | 100% |
| `tr` | Türkçe | 100% |
| `id` | Bahasa Indonesia | 100% |
| `es` | Español | 100% |

- Everyone: `.lang` — see available languages
- Private chat: `.lang tr` — set **your** language
- Group: `.lang tr` (admins) — set the **group** language; members can still pick their own
- Owner: `.lang tr global` — change the global default

Missing keys fall back automatically (user → group → global → `en`). **Adding a language = dropping a JSON file** into `src/i18n/locales/` — no code changes needed (arrays for jokes/quotes/8-ball answers included).

## Commands (selection)

| Category | Commands |
|---|---|
| Main | `menu` `help` `ping` `uptime` `botinfo` `stats` |
| Stickers | `sticker` (`s`) `stickerwm` `take` `setexif` |
| Media | `toimg` `tomp4` `tomp3` `tovn` `fixvideo` |
| Downloads | `yts` `play` `yta` `ytv` `tiktok` |
| AI | `ai` `resetai` |
| Tools | `tts` `translate` `weather` `wiki` `qr` `calc` `base64` `shorturl` `pass` `readmore` |
| Group | `tagall` `hidetag` `kick` `add` `promote` `demote` `grouplink` `revoke` `groupinfo` `poll` `welcome` `setwelcome` `setbye` `antilink` `antidelete` `detect` `opengroup` `closegroup` `setsubject` `setdesc` `del` |
| Fun | `8ball` `pick` `rate` `match` `joke` `quote` `dice` `flip` `russianroulette` |
| Profile & RPG | `profile` `level` `daily` `leaderboard` `afk` |
| Owner | `mode` `setting` `setprefix` `setbotname` `setpp` `banuser` `unbanuser` `banchat` `unbanchat` `addprem` `delprem` `broadcast` `bcgroup` `exec` `join` `leave` `warn` |

Use `.menu` in chat for the full, live list.

## Writing your own command

Copy `src/commands/_example.js`:

```js
export const commands = [
  {
    name: 'hello',
    aliases: ['hi'],
    category: 'other',
    description: 'Say hello',
    usage: '[name]',
    cooldown: 5,
    permission: 'group',      // optional: owner, admin, botAdmin, premium…
    async run (ctx) {
      await ctx.reply(ctx.t('example.echo', { text: ctx.text || 'world' }))
    }
  }
]
```

`ctx` exposes: `m` (serialized message: `m.reply()`, `m.download()`, `m.quoted`…), `sock`, `db`, `args`, `text`, `t()` (i18n), `user`, `chat`, `isOwner`, `getGroupMetadata()`, `getAdminStatus()`…

Files are **hot-reloaded** — save the file and the command updates instantly, no restart.

## Project structure

```
src/
├── index.js            # entry point: config → i18n → db → commands → connection
├── config.js           # .env + CLI flags
├── core/
│   ├── connection.js   # Baileys socket, session, reconnect, QR, web panel
│   ├── handler.js      # message pipeline: middleware → permissions → execution
│   ├── serialize.js    # proto message → convenient `m` object
│   ├── commands.js     # loader/registry with hot-reload
│   └── events.js       # welcome/bye, group changes, call rejection
├── lib/
│   ├── database.js     # JSON store (atomic writes, autosave)
│   ├── media.js        # ffmpeg wrapper, sticker pipeline, conversions
│   ├── youtube.js      # InnerTube → ytdl-core → yt-dlp engine
│   ├── utils.js        # formatting, fetch helpers, safe math
│   └── logger.js       # pino setup + console printer
├── i18n/               # locale engine + en/tr/id/es JSON files
└── commands/           # 11 command modules (122 commands)
```

## Data & session

- `sessions/<name>/` — WhatsApp credentials (**never share**)
- `data/database.json` — users, chats, settings, stats

## Credits

- Original project: [Nurutomo](https://github.com/Nurutomo/wabot-aq) and contributors
- WhatsApp protocol: [Baileys](https://github.com/WhiskeySockets/Baileys) (WhiskeySockets)

License: **GPL-3.0-or-later** (as the original).
