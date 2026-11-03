# Contributing to wabot-aq

Thanks for taking the time to improve the bot. This guide covers local setup, the project layout, adding commands, and what a good pull request looks like.

## Before you start

- **Security issues** go through [SECURITY.md](SECURITY.md), never a public issue.
- **Bugs and feature requests** should use the issue templates. Small typo fixes can go straight to a PR.
- **One concern per pull request.** Keep unrelated refactors out of a bug fix.
- For non-trivial changes, open an issue first so the approach can be discussed.

## Requirements

- **Node.js 22 or 24** (the versions CI tests; the runtime guard requires 22+)
- **git**
- **ffmpeg** for stickers and media commands
- Optional: `yt-dlp` for the YouTube fallback

## Local setup

```bash
git clone https://github.com/KodYazicam/wabot-aq
cd wabot-aq
npm ci
cp .env.example .env
npm run setup          # interactive wizard, or edit .env by hand
npm test               # offline unit tests
npm run selftest:offline
npm start
```

`npm run selftest` also checks external APIs and therefore needs network access. CI uses the offline variant.

## Project map

| Path | Purpose |
| --- | --- |
| `src/index.js` | Entry point: config → i18n → database → commands → connection |
| `src/config.js` | `.env` loading, CLI flags, paths, defaults |
| `src/core/connection.js` | Baileys socket, QR pairing, reconnect/backoff |
| `src/core/handler.js` | Message pipeline: middleware, permissions, locale, execution |
| `src/core/commands.js` | Command loader, registry, hot reload |
| `src/commands/*.js` | Bot features; one file can export several commands |
| `plugins/*.js` | Optional local commands loaded after the built-ins |
| `src/i18n/locales/*.json` | User-facing text for en/es/id/tr/de/fr |
| `src/lib/` | Database, media, YouTube, logging, and utility helpers |
| `tests/` | Node test-runner suites (no WhatsApp or network required) |
| `scripts/` | Setup wizard and command-doc generator |

## Adding a command

1. Copy `src/commands/_example.js` or add to the most relevant existing file.
2. Export a `commands` array. Each definition needs a `name` and `run(ctx)`; supported fields are documented at the top of `_example.js`.
3. Add every user-facing string to **all six** locale files. The locale-parity test fails if `en`, `es`, `id`, `tr`, `de`, or `fr` drift apart.
4. Run `npm run docs` to regenerate `docs/COMMANDS.md`.
5. Run `npm test`. The command-registry test loads every bundled command and rejects duplicate names or aliases.

Useful `ctx` fields include `m`, `sock`, `db`, `config`, `args`, `text`, `t()`, `reply()`, `user`, `chat`, `locale`, `isOwner`, and `getGroupMetadata()`.

## Adding a locale

1. Copy `src/i18n/locales/en.json` to a new ISO code file, e.g. `it.json`.
2. Translate every value. Keep `{placeholders}` unchanged and keep array lengths identical — `jokes`, `quotes`, `ballAnswers`, and `roles` are all checked.
3. Add the flag to the map in `src/commands/lang.js` if it is missing.
4. Run `npm test`; the locale-parity test compares every key and array length against English.
5. Update the language list and string count in the README.

### Local plugins

If a command is personal and should not be part of the upstream tree, put it in `plugins/` instead of `src/commands/`. Copy [`plugins/_example.js`](plugins/_example.js) to a `.js` file (without the leading underscore), export the same `commands` array, and use `.plugins` to confirm it loaded. Both directories are hot-reloaded.

Plugins are trusted local code and are loaded after the built-ins, so they can override a name or alias. The registry logs a collision warning. There is no per-plugin locale loader yet; use plain text, an existing locale key, or propose a key in the core locale files.

## Code style

Match the existing code:

- ESM imports, 2-space indentation, single quotes, no semicolons.
- Keep command definitions declarative: put cooldowns, permissions, and limits in the definition rather than ad-hoc checks.
- Prefer the existing helpers in `src/lib/` over new dependencies.
- Never use `eval`; use the safe math parser.
- Sanitize filenames and user input, and never log session data or credentials.
- Keep user-facing text in i18n files, not hard-coded in commands.

## Tests

```bash
npm test                  # unit + registry + locale parity (offline)
npm run selftest:offline  # local dependency check (offline)
npm run selftest          # also probes external APIs (needs network)
```

Tests must not require WhatsApp, a real phone number, or network access. Add a regression test when fixing a bug that can be tested without those.

## Commits and pull requests

- Use clear prefixes: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`.
- Link the issue in the PR body with `Closes #123`.
- Fill in the pull request template: summary, validation commands, and the secret-handling checklist.
- Keep the branch focused and rebase or merge `main` if it has moved.
- CI must pass on both supported Node versions and the Docker job.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
