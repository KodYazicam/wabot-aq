/**
 * Persistent reminder scheduler. Runs from the entry point with the current
 * socket getter so it keeps working across reconnects.
 */
import { resolveLocale, t } from '../i18n/index.js'
import { mention } from '../lib/utils.js'

const MAX_ATTEMPTS = 3

/**
 * Send every due reminder once. Returns the number of delivered reminders.
 * Failed sends are retried on later ticks; after three failures the reminder
 * is dropped so a permanently broken chat cannot block the queue.
 */
export async function runDueReminders ({ db, sock, config, logger, now = Date.now() }) {
  if (!sock) return 0
  const reminders = Object.values(db.data.reminders || {})
    .filter(reminder => reminder && Number.isFinite(reminder.dueAt) && reminder.dueAt <= now)

  let sent = 0
  for (const reminder of reminders) {
    const locale = resolveLocale([
      db.data.users?.[reminder.sender]?.locale,
      db.data.chats?.[reminder.chat]?.locale,
      config.locale
    ])
    try {
      await sock.sendMessage(reminder.chat, {
        text: t(locale, 'remind.fired', {
          user: mention(reminder.sender),
          text: reminder.text
        }),
        mentions: [reminder.sender]
      })
      delete db.data.reminders[reminder.id]
      sent++
    } catch (e) {
      reminder.attempts = (reminder.attempts || 0) + 1
      logger?.warn({ err: e, id: reminder.id }, 'failed to send reminder')
      if (reminder.attempts >= MAX_ATTEMPTS) {
        delete db.data.reminders[reminder.id]
        logger?.warn({ id: reminder.id }, 'dropping reminder after repeated send failures')
      }
    }
  }

  if (reminders.length) await db.save().catch(() => {})
  return sent
}

/** Start the 30-second reminder loop. Returns a stop function. */
export function startReminderScheduler ({ db, getSock, config, logger, intervalMs = 30_000 }) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runDueReminders({ db, sock: getSock(), config, logger })
    } catch (e) {
      logger?.error({ err: e }, 'reminder scheduler failed')
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick().catch(() => {})
  return () => clearInterval(timer)
}
