<div align="center">

**wabot-aq 3.0**

*Modern, multi-language WhatsApp bot — a complete rewrite of [Nurutomo/wabot-aq](https://github.com/Nurutomo/wabot-aq) on Baileys 7 (multi-device)*

[![CI](https://github.com/KodYazicam/wabot-aq/actions/workflows/node.js.yml/badge.svg)](https://github.com/KodYazicam/wabot-aq/actions/workflows/node.js.yml)
[![Release](https://img.shields.io/github/release/KodYazicam/wabot-aq.svg)](https://github.com/KodYazicam/wabot-aq/releases)
[![License](https://img.shields.io/github/license/KodYazicam/wabot-aq.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-green.svg)](package.json)

🌍 en · tr · id · es · de · fr &nbsp;|&nbsp; ⚡ 87 commands & 80+ aliases &nbsp;|&nbsp; 🐳 Docker-ready

</div>

---

> ⚠️ **Read this first:** this is an *unofficial* bot that connects to WhatsApp as a linked device. Automating WhatsApp may violate the [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service) — in the worst case your number can be **banned**. Use a spare number, avoid mass messaging, and continue at your own risk.

## Table of contents

1. [What is this?](#what-is-this)
2. [What can it do?](#what-can-it-do)
3. [Requirements](#requirements)
4. [Quick start (3 steps)](#quick-start-3-steps)
5. [Installation details per platform](#installation-details-per-platform)
6. [Configuration explained](#configuration-explained)
7. [Running the bot](#running-the-bot)
8. [Using the bot](#using-the-bot)
9. [Languages](#languages)
10. [All commands](#all-commands)
11. [Writing your own command (step by step)](#writing-your-own-command-step-by-step)
12. [How it works (architecture)](#how-it-works-architecture)
13. [Security](#security)
14. [Contributing](#contributing)
15. [FAQ & troubleshooting](#faq--troubleshooting)
16. [Updating](#updating)
17. [Credits & license](#credits--license)

---

## What is this?

A WhatsApp bot you host yourself. You pair it once by scanning a QR code (like WhatsApp Web), and from then on it answers commands in your chats: makes stickers, downloads YouTube/TikTok, chats with an AI, manages groups, plays games, and much more.

This is a ground-up rewrite of the classic [Nurutomo/wabot-aq](https://github.com/Nurutomo/wabot-aq) — the original stopped working when WhatsApp shut down the old login method. Version 3.0 uses the modern **multi-device** protocol, speaks **six languages**, and is built to be easy to install and hard to break.

## What can it do?

| Area | Highlights |
|---|---|
| 🗨️ **Chat & AI** | talk to any OpenAI-compatible AI (OpenAI, Groq, OpenRouter, local Ollama) with per-chat memory |
| 🎨 **Stickers** | turn images, videos, GIFs or URLs into stickers — animated too, with your own watermark |
| 🎬 **Downloads** | YouTube audio/video (3 fallback engines so it keeps working), TikTok without watermark |
| 🔧 **Tools** | text-to-speech, translation, weather, Wikipedia, QR codes, calculator, password generator, URL shortener |
| 👥 **Groups** | welcome messages, anti-link, anti-delete, tag-everyone, polls, kick/promote/demote, open/close |
| 🕹 **Fun & RPG** | 8-ball, jokes, quotes, match-making, levels & XP, daily rewards, leaderboards, AFK |
| 🛡 **Safety** | owner/moderator/premium permission levels, cooldowns, flood protection, warnings, bans |
| 🌍 **Languages** | English, Türkçe, Bahasa Indonesia, Español, Deutsch, Français — per user, per group, or global |

## Requirements

- **Node.js ≥ 22** — [download](https://nodejs.org/en/download) (Node 24 LTS recommended)
- **ffmpeg** — free media tool used for stickers and conversions
- **A WhatsApp account** — the bot links to it as a "linked device" (your phone stays usable)

No database server, no API keys (except optionally for AI), no browser. Everything runs from one folder.

## Quick start (3 steps)

Open a terminal in the folder where you want the bot, then:

```bash
# 1. Get the code and install dependencies (one time)
git clone https://github.com/KodYazicam/wabot-aq
cd wabot-aq
npm install

# 2. Answer a few questions (bot name, your number, language…) — writes .env
npm run setup

# 3. Start the bot and scan the QR code
npm start
```

When the QR code appears in your terminal: open **WhatsApp on your phone → Settings → Linked devices → Link a device** and point the camera at the code. That's it — the bot is online. Send it `.menu` in any chat.

**First time using a terminal?** Copy-paste each block above, press Enter, wait for it to finish. On Windows use PowerShell or CMD; on Android scroll down to the Termux section.

## Installation details per platform

**ffmpeg** is the only extra program. Install it with:

| Platform | Command |
|---|---|
| Ubuntu / Debian | `sudo apt install ffmpeg` |
| Arch / Manjaro | `sudo pacman -S ffmpeg` |
| Fedora | `sudo dnf install ffmpeg` |
| macOS (Homebrew) | `brew install ffmpeg` |
| Windows | `winget install Gyan.FFmpeg` — then **restart your terminal** |
| Android (Termux) | `pkg install ffmpeg` (Node: `pkg install nodejs -y && pkg install git -y`) |

<details>
<summary><b>Android (Termux) — full setup</b></summary>

```bash
pkg update && pkg upgrade -y
pkg install nodejs git ffmpeg -y
git clone https://github.com/KodYazicam/wabot-aq
cd wabot-aq
npm install
npm run setup
npm start
```
Keep Termux alive (acquire wakelock with `termux-wake-lock`) so the bot doesn't stop when the screen turns off.
</details>

<details>
<summary><b>Docker — for 24/7 servers</b></summary>

```bash
git clone https://github.com/KodYazicam/wabot-aq
cd wabot-aq
cp .env.example .env        # edit OWNER at minimum
docker compose up -d        # builds and starts with ffmpeg included
docker compose logs -f      # follow the log to see the QR code
```

The first login must use the web panel: set `WEB_SERVER=true` in `.env`, restart, then open `http://YOUR-SERVER-IP:3000` and scan the QR from your browser. Your session and data survive restarts (they're in Docker volumes). To stop: `docker compose down`.

The build context excludes `.env`, `sessions/`, and `data/`; the container gets secrets from the environment file and state from mounted volumes, so neither is baked into an image layer.
</details>

<details>
<summary><b>VPS / always-on tips (pm2)</b></summary>

```bash
npm install -g pm2
pm2 start src/index.js --name wabot
pm2 save && pm2 startup      # survive server reboots
pm2 logs wabot               # see the QR / logs
```
</details>

## Configuration explained

All settings live in one file: **`.env`** (created by `npm run setup`, template in `.env.example`). The important ones:

| Setting | What it does | Example |
|---|---|---|
| `OWNER` | **Your WhatsApp number** (country code, digits only). You get owner powers: settings, broadcasts, bans | `905321234567` |
| `LOCALE` | Default bot language | `en` |
| `PREFIX` | Character before commands | `.` (→ `.menu`) |
| `MODE` | `public` = everyone can use it · `self` = only you | `public` |
| `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` | Enable the `.ai` command with any OpenAI-compatible API (leave empty to disable) | see `.env.example` |
| `WEB_SERVER` + `WEB_PORT` | Web page with the pairing QR (VPS/Docker) | `true`, `3000` |
| `MAX_FILE_SIZE` | Download limit in bytes (100 MB default) | `104857600` |
| `SAFE_MODE` | Disables the `.exec` shell command (shared hosting) | `false` |

Every option is explained with examples inside [`.env.example`](.env.example) — open it in any text editor.

## Running the bot

```bash
npm start          # normal start
npm run dev        # auto-restart on code changes (while developing)
npm test           # offline unit tests: database, i18n, utils/SSRF, math — no WhatsApp or network
npm run selftest   # health check: ffmpeg, i18n, commands, external APIs — no WhatsApp needed
npm run selftest:offline  # same checks without external API calls (used by CI)
npm run docs       # regenerate docs/COMMANDS.md after adding commands
node src/index.js --big-qr     # larger QR code for small terminals
node src/index.js --session work  # run a second bot under a different session name
```

The bot reconnects automatically when the connection drops, and saves your pairing — the QR is only needed the first time (or after you delete the `sessions/` folder).

## Using the bot

Send the bot a message in any chat (or add it to a group):

```text
.menu          → the full command list
.help sticker  → details for one command
.ping          → is the bot alive?
.lang tr       → switch language
```

A few favorites:

```text
.sticker        (reply to a photo/video, or send a photo with this caption)
.play never gonna give you up        → sends the song
.ai explain quantum computing simply
.weather Istanbul
.translate en cómo estás
.tagall party tonight 🎉              (in groups, admins)
.profile        → your XP card
```

Full reference with aliases, permissions and cooldowns: **[docs/COMMANDS.md](docs/COMMANDS.md)**.

## Languages

English, Türkçe, Bahasa Indonesia, Español, Deutsch, Français — all complete (290+ strings each: menus, errors, games, jokes, quotes…).

- **You**: `.lang tr` — your private chats with the bot
- **Group admins**: `.lang tr` — the group's language (members can still pick their own)
- **Owner**: `.lang tr global` — the default for everyone

Missing keys fall back automatically: *user → group → global → English*. **Adding a language is just one file**: copy `src/i18n/locales/en.json`, translate the values, save it as e.g. `it.json` — done. (Array values hold jokes, quotes and 8-ball answers — translate those too.)

## All commands

87 commands with 80+ aliases in 11 categories — see the **[complete reference](docs/COMMANDS.md)** (auto-generated, always in sync). Summary:

| Category | Commands |
|---|---|
| Main | `menu` `help` `ping` `uptime` `botinfo` `plugins` `stats` |
| Settings | `mode` `setting` `setprefix` `setbotname` `setpp` `lang` |
| Stickers | `sticker` (`s`) `stickerwm` `take` `setexif` |
| Media | `toimg` `tomp4` `tomp3` `tovn` `fixvideo` |
| Downloads | `yts` `play` `yta` `ytv` `tiktok` |
| AI | `ai` `resetai` |
| Tools | `tts` `translate` `weather` `wiki` `qr` `calc` `base64` `shorturl` `pass` `readmore` `dice` `flip` |
| Groups | `tagall` `hidetag` `kick` `add` `promote` `demote` `grouplink` `revoke` `groupinfo` `poll` `welcome` `setwelcome` `setbye` `antilink` `antidelete` `detect` `opengroup` `closegroup` `setsubject` `setdesc` `del` |
| Fun | `8ball` `pick` `rate` `match` `joke` `quote` `russianroulette` |
| Profile & RPG | `profile` `level` `daily` `leaderboard` `afk` |
| Owner | `banuser` `unbanuser` `banchat` `unbanchat` `addprem` `delprem` `broadcast` `bcgroup` `exec` `join` `leave` `warn` `dbstats` |

## Writing your own command (step by step)

Commands are small JavaScript files in `src/commands/`. You don't need to restart the bot — saving the file reloads it automatically.

**Step 1.** Create `src/commands/weather2.js`:

```js
export const commands = [
  {
    name: 'shout',                 // command name → used as .shout
    aliases: ['yell'],             // alternative names
    category: 'fun',               // menu section
    description: 'SHOUT YOUR TEXT',
    usage: '<text>',               // shown in the menu
    cooldown: 5,                   // seconds between uses
    async run (ctx) {              // runs when someone sends .shout hi
      await ctx.reply((ctx.text || 'hello').toUpperCase() + '!!!')
    }
  }
]
```

**Step 2.** Save. In WhatsApp send `.shout good morning` → the bot replies `GOOD MORNING!!!`.

**What `ctx` gives you** — the useful parts:

- `ctx.text` — everything after the command (`.shout hello world` → `"hello world"`)
- `ctx.args` — the same, split into words (`["hello", "world"]`)
- `ctx.reply(text)` — answer in the same chat, quoting the user
- `ctx.t('key')` — translated text (see `src/i18n/locales/en.json` for existing keys)
- `ctx.m` — the raw message: `ctx.m.quoted` (replied-to message), `ctx.m.download()` (its media), `ctx.m.mentionedJid`
- `ctx.sock` — the WhatsApp connection for sending media, group actions, …
- `ctx.isOwner`, `ctx.isGroup`, `ctx.getGroupMetadata()`, `ctx.user`/`ctx.chat` (database records)

**Step 3 (optional).** Add your own reply text to all six locale files (`en`, `es`, `id`, `tr`, `de`, `fr`) so it's translatable:

```json
"fun": { "shoutResult": "{text}!!!" }
```

Then use `ctx.reply(ctx.t('fun.shoutResult', { text: ctx.text }))` instead of hardcoding.

A full annotated template is in [`src/commands/_example.js`](src/commands/_example.js).

### Local plugins (no core edits)

For commands you do not want to upstream, use the optional `plugins/` directory:

```bash
cp plugins/_example.js plugins/hello.js
# edit it, save it — the bot hot-reloads it
```

Plugin files use the same `commands` export and `ctx` contract as built-ins. They are loaded after `src/commands/`, so you can add or override a name (the registry logs a warning on collisions). Files starting with `_` are skipped. Use `.plugins` to list what is currently loaded.

Plugins are trusted local code — there is no sandbox. In Docker, `docker-compose.yml` mounts `./plugins` into the container, so the directory survives rebuilds and can be edited on the host. See [`plugins/README.md`](plugins/README.md).

## How it works (architecture)

```
┌────────────┐   messages    ┌─────────────┐   commands    ┌──────────────┐
│  WhatsApp  │ ◄───────────► │  Baileys 7  │ ────────────► │  87 commands │
│ (multi-dev)│    QR pair    │  (socket)   │  hot-reload   │  src/commands│
└────────────┘               └─────────────┘               └──────────────┘
                                  │                              │
                    ┌─────────────┼──────────────┐               │
              ┌─────▼─────┐ ┌────▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐
              │  handler  │ │  events  │ │     i18n    │ │ media/tools │
              │ middleware│ │ welcome/ │ │ en…fr (6)   │ │ ffmpeg/sharp│
              │ perms/AFK │ │ antilink │ │  fallbacks  │ │  youtube    │
              └─────┬─────┘ └──────────┘ └─────────────┘ └─────────────┘
                    │
              ┌─────▼──────────┐
              │ data/database  │  JSON, atomic writes, skip unchanged
              └────────────────┘
```

- **`src/core/connection.js`** — connects to WhatsApp, shows the QR, reconnects with increasing backoff if the network drops
- **`src/core/handler.js`** — every incoming message passes through here: language resolution → AFK → anti-link → permissions → cooldown → flood check → your command
- **`src/commands/*.js`** — the features; one file can hold several related commands
- **`src/i18n/`** — all user-facing text, per language
- **`src/lib/`** — media pipeline (ffmpeg + sharp), YouTube engine (3 fallback layers), database, helpers

## Security

- **Your session is your account.** The `sessions/` folder contains the keys to your WhatsApp login — never commit, share or copy it anywhere. It is protected with `chmod 700` and excluded via `.gitignore` by default.
- **`.env` holds private settings** — also git-ignored, file permissions set to 600.
- **SSRF protection** — URLs users send to the bot (stickers, downloads) are checked and can't reach internal/private network addresses (localhost, LAN, cloud metadata).
- **No `eval`** — the calculator is a real parser; API keys are automatically redacted from error messages and `.exec` output.
- **Permission levels** — destructive commands are owner-only; `.exec` can be fully disabled with `SAFE_MODE=true`.
- **Anti-abuse** — per-command cooldowns, flood protection (15 commands/min), 3-strike warning system, user and chat bans.
- **Good citizenship** — broadcasts are rate-limited (0.8s between messages) to avoid triggering WhatsApp spam detection.

If you find a vulnerability, please report it privately using [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Contributing

Contributions are welcome — bug reports, translations, commands, and documentation all help.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, command authoring, and the PR checklist.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security problems privately through [SECURITY.md](SECURITY.md).

For small fixes, a focused pull request is enough. For larger changes, open an issue first so the approach can be discussed.

## FAQ & troubleshooting

**The QR code expired / I missed it.**
QR codes refresh automatically every ~20 seconds — just wait for the next one. `--big-qr` prints a larger version.

**The bot doesn't reply.**
1. Did you pair successfully? You should see `✅ connected as …` in the log.
2. Are you using the right prefix? Default is `.` — try `.ping`.
3. `MODE=self` in `.env` makes it answer only the owner — is `OWNER` set correctly?
4. Run `npm run selftest` to check the environment.

**"ffmpeg not found" / stickers fail.**
Install ffmpeg (table above) and restart the bot. Verify with `npm run selftest`.

**YouTube downloads fail sometimes.**
The engine tries three methods in order (InnerTube API → ytdl-core → yt-dlp). If all fail, the video is age-restricted or YouTube is blocking your server's IP — installing [yt-dlp](https://github.com/yt-dlp/yt-dlp) on the host helps a lot.

**I want to pair a different number / start over.**
Stop the bot, delete the `sessions/` folder, start again → a fresh QR appears.

**I got logged out ("session logged out").**
Someone removed the linked device from the phone, or you deleted sessions. Delete the folder and re-pair.

**Can the bot and WhatsApp Web run at the same time?**
WhatsApp allows one web session and several "linked devices" — the bot counts as a linked device, so yes.

**Is my data sent anywhere?**
Message processing happens on your machine. External calls are only made for features you actually use (e.g. `.weather` → Open-Meteo, `.ai` → your chosen API). No telemetry.

**How do I run two bots?**
`node src/index.js --session second` with a different `SESSION_NAME` — each session is a separate WhatsApp login.

## Updating

```bash
git pull
npm install
npm start        # your session and database are kept
```

## Credits & license

- Original project: [Nurutomo/wabot-aq](https://github.com/Nurutomo/wabot-aq) and its contributors
- WhatsApp protocol library: [Baileys](https://github.com/WhiskeySockets/Baileys) by WhiskeySockets
- Media: [sharp](https://sharp.pixelplumbing.com/), ffmpeg, node-webpmux · Search: yt-search · Plus all bundled locale contributors

Licensed under **[GPL-3.0-or-later](LICENSE)** — same as the original. If you fork it, keep the license and the credits. Best Regards, wabot-aq 💙
