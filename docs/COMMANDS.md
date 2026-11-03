# Command reference

> Auto-generated from the command registry (`npm run docs`) — 91 commands, generated locale: `en` (de, en, es, fr, id, tr).

The prefix is configurable (`PREFIX` in .env, default `.`).

## AI (`ai`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.ai` | `.gpt`, `.chat`, `.ask` | `<prompt>` | Chat with an AI (OpenAI-compatible API) | everyone | 10s |
| `.resetai` | `.clearchat` | — | Clear the AI conversation history of this chat | everyone | 3s |

## Main (`core`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.menu` | `.?`, `.commands`, `.list` | — | Show the command menu | everyone | 3s |
| `.help` | `.cmd`, `.command` | `<command>` | Show help for one command | everyone | 3s |
| `.ping` | `.speed`, `.p` | — | Check the bot latency | everyone | 3s |
| `.uptime` | `.runtime` | — | Show how long the bot has been running | everyone | 3s |
| `.botinfo` | `.info` | — | Show bot statistics | everyone | 3s |
| `.plugins` | `.plugin` | — | List commands loaded from the plugins/ directory | everyone | 3s |
| `.stats` | — | — | Show the most used commands | everyone | 3s |

## Profile & RPG (`rpg`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.profile` | `.me` | — | Show your profile card (level, XP, limits) | everyone | 3s |
| `.daily` | `.claim` | — | Claim your daily usage limit | everyone | 5s |
| `.leaderboard` | `.rank`, `.lb`, `.top` | — | Top 10 most active users | everyone | 10s |
| `.afk` | — | `[reason]` | Mark yourself as away (reason optional) | everyone | 3s |
| `.level` | `.seviye` | — | Show your level and XP progress | everyone | 3s |

## Downloaders (`downloader`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.yts` | `.ytsearch`, `.youtube` | `<query>` | Search YouTube videos | everyone | 5s |
| `.play` | — | `<query>` | Search YouTube and send the audio | everyone | 10s |
| `.yta` | `.playmp3`, `.ytaudio` | `<url|query>` | Download YouTube audio | everyone | 10s |
| `.ytv` | `.ytvideo`, `.playvideo` | `<url|query>` | Download YouTube video | everyone | 10s |
| `.tiktok` | `.tt` | `<url>` | Download a TikTok video without watermark | everyone | 10s |

## Fun (`fun`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.8ball` | `.ball` | `<question>` | Ask the magic 8-ball | everyone | 3s |
| `.pick` | — | `<a|b|c…>` | Pick randomly between options | everyone | 3s |
| `.rate` | — | `<thing>` | Rate anything out of 10 | everyone | 3s |
| `.match` | `.ship`, `.uyum` | — | Compatibility between two mentioned people | group only | 5s |
| `.joke` | `.saka` | — | Tell a random joke | everyone | 3s |
| `.quote` | `.alinti` | — | Share an inspirational quote | everyone | 3s |
| `.russianroulette` | `.rr` | — | Russian roulette (1 in 6 chance of "losing") | everyone | 5s |
| `.flip` | — | — | Flip a coin | everyone | 3s |
| `.dice` | — | — | Roll a dice | everyone | 3s |

## Group (`group`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.tagall` | `.everyone`, `.all` | `[message]` | Mention every member of the group | group only + group admin | 10s |
| `.hidetag` | — | `[message]` | Notify everyone without showing their names | group only + group admin | 10s |
| `.kick` | `.remove` | `<@user|number>` | Remove a member from the group | group only + group admin + bot is admin | 5s |
| `.add` | — | `<number>` | Add a user to the group | group only + group admin + bot is admin | 5s |
| `.promote` | — | `<@user|number>` | Promote a member to group admin | group only + group admin + bot is admin | 5s |
| `.demote` | — | `<@user|number>` | Remove a member from group admins | group only + group admin + bot is admin | 5s |
| `.grouplink` | `.link` | — | Show the group invite link | group only + group admin + bot is admin | 5s |
| `.revoke` | — | — | Revoke the group invite link and create a new one | group only + group admin + bot is admin | 5s |
| `.groupinfo` | `.ginfo` | — | Show group details | group only | 5s |
| `.poll` | — | `<question>|<option 1>|<option 2>` | Create a group poll | group only | 10s |
| `.welcome` | — | — | Toggle welcome messages for new members | group only + group admin | 3s |
| `.setwelcome` | — | `<text>` | Set the welcome message text | group only + group admin | 3s |
| `.setbye` | — | `<text>` | Set the goodbye message text | group only + group admin | 3s |
| `.bye` | — | — | Toggle goodbye messages for members who leave | group only + group admin | 3s |
| `.gwarn` | `.groupwarn` | `<@user|number> [reason]` | Warn a member; 3 warnings remove them when the bot is admin | group only + group admin | 3s |
| `.warnings` | `.warns` | `[@user|number]` | Show group warnings for yourself or a member | group only | 3s |
| `.resetwarn` | `.clearwarn` | `<@user|number>` | Clear group warnings for a member | group only + group admin | 3s |
| `.antilink` | — | — | Delete WhatsApp group invite links posted by members | group only + group admin | 3s |
| `.antidelete` | — | — | Recover deleted messages in this group | group only + group admin | 3s |
| `.detect` | — | — | Announce admin and group setting changes | group only + group admin | 3s |
| `.opengroup` | `.open` | — | Allow every member to send messages | group only + group admin + bot is admin | 3s |
| `.closegroup` | `.close` | — | Restrict messages to group admins | group only + group admin + bot is admin | 3s |
| `.setsubject` | — | `<text>` | Change the group name | group only + group admin + bot is admin | 3s |
| `.setdesc` | — | `<text>` | Change the group description | group only + group admin + bot is admin | 3s |
| `.del` | `.delete` | — | Delete a replied-to message | group only | 3s |

## Settings (`settings`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.lang` | `.language`, `.locale`, `.dil` | `[code]` | Show or change the bot language | everyone | 3s |
| `.mode` | `.self`, `.public` | — | Switch between self (owner only) and public mode | owner | 3s |
| `.setting` | `.toggle`, `.autoread`, `.anticall`, `.pconly`, `.gconly` | `<name> [on/off]` | Toggle bot settings: autoread, anticall, pconly, gconly | owner | 3s |
| `.setprefix` | — | `<prefix>` | Change the command prefix | real owner | 3s |
| `.setbotname` | — | `<name>` | Change the bot display name | real owner | 3s |
| `.setpp` | — | — | Set the bot profile picture (reply to an image) | real owner | 3s |

## Media (`media`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.toimg` | `.toimage`, `.img` | — | Convert a sticker to an image (reply to a sticker) | everyone | 5s |
| `.tomp4` | `.tovideo` | — | Convert an animated sticker to a video | everyone | 5s |
| `.tomp3` | `.mp3` | — | Extract audio from a video (reply to a video) | everyone | 5s |
| `.tovn` | `.toptt`, `.vn` | — | Convert audio/video to a voice note (reply to media) | everyone | 5s |
| `.fixvideo` | — | — | Re-encode a video for WhatsApp compatibility | everyone | 10s |

## Owner (`owner`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.banuser` | — | — | Ban a user from using the bot | owner | 3s |
| `.unbanuser` | — | — | Lift a user ban | owner | 3s |
| `.banchat` | — | — | Disable the bot in this chat | owner | 3s |
| `.unbanchat` | — | — | Re-enable the bot in this chat | real owner | 3s |
| `.addprem` | `.addpremium` | — | Grant premium to a user | owner | 3s |
| `.delprem` | `.delpremium` | — | Revoke premium from a user | owner | 3s |
| `.broadcast` | `.bc` | `<text>` | Broadcast a message to all chats | real owner | 30s |
| `.bcgroup` | `.bcg` | `<text>` | Broadcast to groups only | real owner | 30s |
| `.exec` | — | `<command>` | Run a shell command on the host | real owner | 5s |
| `.join` | — | `<link>` | Join a group via invite link | real owner | 3s |
| `.leave` | `.ayrıl`, `.ayril` | — | Leave the current group | owner | 3s |
| `.warn` | — | — | Warn a user (3 warnings → ban) | moderator | 3s |
| `.dbstats` | `.dbinfo` | — | Show database size and save metrics | owner | 3s |

## Stickers (`sticker`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.setexif` | — | `<packname|author>` | Set default sticker watermark (pack|author) | owner | 3s |
| `.sticker` | `.s`, `.st`, `.stiker`, `.stickergif` | `[url] [packname|author]` | Create a sticker from image/video (reply, media or URL) | everyone | 5s |
| `.stickerwm` | `.swm`, `.wm` | `<packname|author>` | Create a sticker with custom watermark | everyone | 5s |
| `.take` | — | `[packname|author]` | Restamp a sticker with your watermark (reply to sticker) | everyone | 5s |

## Tools (`tools`)

| Command | Aliases | Usage | Description | Access | Cooldown |
|---|---|---|---|---|---|
| `.tts` | `.say` | `[lang] <text>` | Convert text to a voice note | everyone | 5s |
| `.translate` | `.tr`, `.cevir` | `<lang> <text>` | Translate text (auto-detect source language) | everyone | 3s |
| `.weather` | `.hava` | `<city>` | Current weather for a city | everyone | 5s |
| `.wiki` | `.wikipedia` | `<query>` | Wikipedia summary | everyone | 5s |
| `.qr` | `.qrcode` | `<text|url>` | Generate a QR code image | everyone | 3s |
| `.calc` | `.math`, `.hesapla` | `<expression>` | Safe calculator (no eval) | everyone | 3s |
| `.base64` | `.b64` | `enc|dec <text>` | Base64 encode/decode | everyone | 3s |
| `.shorturl` | `.shorten` | `<url>` | Shorten a URL (is.gd) | everyone | 3s |
| `.pass` | `.password` | `[length]` | Generate a secure random password | everyone | 3s |
| `.readmore` | `.spoiler` | `<visible>|<hidden>` | Hide text behind a "read more" collapse | everyone | 3s |

---

**Access levels** (checked in this order):

- **real owner** — the number configured as `OWNER` (or the bot's own account)
- **owner** — real owner, or messages sent from the bot account itself
- **moderator** — owner or numbers in `MODS`
- **premium** — users granted `.addprem` (bypass limits and cooldowns)
- **group admin / bot is admin** — checked against the WhatsApp group participant list

