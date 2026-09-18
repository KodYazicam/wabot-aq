/** Shared helpers: formatting, durations, networking, safe math. */

export const isUrl = (text) =>
  /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/i.test(text)

export const msToTime = (ms) => {
  const s = Math.floor((ms / 1000) % 60)
  const m = Math.floor((ms / (1000 * 60)) % 60)
  const h = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const d = Math.floor(ms / (1000 * 60 * 60 * 24))
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

export const fmtBytes = (bytes) => {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** '1h30m' / '2d 5s' style durations → milliseconds */
export function parseDuration (str) {
  const m = String(str).match(/(\d+)\s*(s|m|h|d|sec|min|hour|day)/gi)
  if (!m) return null
  const mult = { s: 1000, sec: 1000, m: 60_000, min: 60_000, h: 3_600_000, hour: 3_600_000, d: 86_400_000, day: 86_400_000 }
  return m.reduce((total, part) => {
    const num = parseInt(part)
    const unit = part.replace(/\d+|\s+/g, '').toLowerCase()
    return total + num * (mult[unit] || 0)
  }, 0)
}

export const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)]

/** Deterministic percentage (fun commands: same input → same output). */
export function hashPercent (str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % 101
}

/** JSON fetch with timeout and a browser User-Agent. */
export async function fetchJson (url, opts = {}, timeout = 15_000) {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ...(opts.headers || {})
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`)
  return res.json()
}

export async function fetchBuffer (url, timeout = 60_000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Safe calculator (no eval — shunting-yard algorithm)
// ---------------------------------------------------------------------------
const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }

export function safeMath (expr) {
  const tokens = String(expr).replace(/,/g, '.').match(/(\d+\.?\d*|[+\-*/%^()])/g)
  if (!tokens) throw new Error('invalid expression')
  const out = []
  const ops = []
  const apply = () => {
    const op = ops.pop()
    const b = out.pop()
    const a = out.pop()
    if (a === undefined || b === undefined) throw new Error('missing operand')
    switch (op) {
      case '+': out.push(a + b); break
      case '-': out.push(a - b); break
      case '*': out.push(a * b); break
      case '/': if (b === 0) throw new Error('division by zero'); out.push(a / b); break
      case '%': out.push(a % b); break
      case '^': out.push(a ** b); break
    }
  }
  for (const tok of tokens) {
    if (/^\d/.test(tok)) out.push(parseFloat(tok))
    else if (tok === '(') ops.push(tok)
    else if (tok === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') apply()
      if (!ops.length) throw new Error('mismatched parentheses')
      ops.pop()
    } else {
      while (ops.length && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[tok] && ops[ops.length - 1] !== '(') apply()
      ops.push(tok)
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1] === '(') throw new Error('mismatched parentheses')
    apply()
  }
  if (out.length !== 1) throw new Error('invalid expression')
  return Math.round(out[0] * 1e10) / 1e10
}

export const mention = (jid) => `@${jid?.split('@')[0] || '?'}`

export function safeFilename (name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64)
}

/** Levenshtein distance — "did you mean?" suggestions. */
export function levenshtein (a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

/** Turn a bar (0-100) into a Unicode progress bar. */
export function progressBar (percent, size = 10) {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * size)
  return '█'.repeat(filled) + '░'.repeat(size - filled)
}
