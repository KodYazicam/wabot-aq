import pino from 'pino'

/**
 * Pino-based colored, single-line logging. Set LOG_PRETTY=false for plain
 * JSON output (container/ SIEM friendly).
 */
export function createLogger (name = 'bot', level = 'info') {
  const pretty = process.env.LOG_PRETTY !== 'false' && process.stdout.isTTY !== false
  return pino({
    name,
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname', singleLine: true } }
      : undefined
  })
}

/** Compact console summary of an incoming message. */
export function printMessage (logger, m) {
  if (!m.text && !m.mtype) return
  const name = m.pushName || m.sender?.split('@')[0] || '?'
  const cmd = m.isCommand ? `[CMD] ${m.usedPrefix || ''}${m.command}${m.text ? ' ' + m.text.split(' ')[0] : ''}` : ''
  const text = (m.text || `[${m.mtype}]`).split('\n')[0].slice(0, 80)
  logger.info({
    chat: m.isGroup ? m.chat.split('@')[0] + ' (group)' : m.chat,
    from: name
  }, `${cmd ? cmd + ' — ' : ''}${text}`)
}
