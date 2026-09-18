/**
 * Connection manager: Baileys 7 socket, multi-file auth session, automatic
 * reconnection with backoff, QR display (terminal + optional web panel).
 *
 * Pattern: connect() creates a fresh socket; on 'open' the provided
 * onOpen(sock) hook runs (handlers attach there); on 'close' a new
 * connection is created, re-reading credentials from disk.
 */
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from 'baileys'
import { createRequire } from 'node:module'
import http from 'node:http'
import path from 'node:path'
import QRCode from 'qrcode'
import { createLogger } from '../lib/logger.js'
import { t } from '../i18n/index.js'
import { args } from '../config.js'

const require = createRequire(import.meta.url)
const qrcodeTerminal = require('qrcode-terminal')

const state = {
  sock: null,
  qr: null,
  connected: false,
  connection: 'closed',
  phone: null,
  startedAt: Date.now(),
  reconnects: 0
}

export function getBotState () {
  return { ...state, uptime: Date.now() - state.startedAt }
}

function printQR (qr, big) {
  qrcodeTerminal.generate(qr, { small: !big })
}

/** Web panel: status + QR pairing page (dependency-free node:http). */
function startWebServer (port, logger, locale) {
  const page = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wabot-aq — Panel</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
         display: flex; flex-direction: column; align-items: center; margin: 0; padding: 2rem; }
  h1 { font-weight: 600; }
  .card { background: #1e293b; padding: 1.5rem 2rem; border-radius: 1rem; text-align: center; max-width: 90vw; }
  img { width: 280px; image-rendering: pixelated; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  .ok { background: #22c55e; } .wait { background: #eab308; } .off { background: #ef4444; }
  small { color: #94a3b8; }
</style>
</head>
<body>
<h1>🤖 wabot-aq</h1>
<div class="card">
  <p><span class="dot" id="dot"></span><span id="status">…</span></p>
  <img id="qr" alt="QR">
  <p><small>${t(locale, 'web.scanHint')}</small></p>
</div>
<script>
  const poll = async () => {
    try {
      const s = await (await fetch('/state')).json();
      const dot = document.getElementById('dot');
      const st = document.getElementById('status');
      const qr = document.getElementById('qr');
      if (s.connected) { dot.className = 'dot ok'; st.textContent = ${JSON.stringify(t(locale, 'web.connected'))} + ' ' + (s.phone || '');
        qr.style.display = 'none'; }
      else if (s.qr) { dot.className = 'dot wait'; st.textContent = ${JSON.stringify(t(locale, 'web.waiting'))};
        qr.src = 'data:image/png;base64,' + s.qr; qr.style.display = 'block'; }
      else { dot.className = 'dot off'; st.textContent = ${JSON.stringify(t(locale, 'web.disconnected'))}; }
    } catch {}
  };
  poll(); setInterval(poll, 2000);
</script>
</body>
</html>`

  const server = http.createServer(async (req, res) => {
    if (req.url === '/state') {
      const s = getBotState()
      let qr = null
      if (s.qr) {
        qr = await QRCode.toDataURL(s.qr, { margin: 1 }).then(d => d.split(',')[1]).catch(() => null)
      }
      const payload = { connected: s.connected, phone: s.phone, connection: s.connection, uptime: s.uptime, qr }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(payload))
    }
    if (req.url === '/health') {
      res.writeHead(200)
      return res.end('ok')
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(page)
  })
  server.listen(port, () => logger.info(`🌐 web panel: http://localhost:${port}`))
  return server
}

/**
 * Start the connection loop. onOpen(sock, { isNew }) runs on every
 * successful connection (including reconnects).
 */
export function startConnection (deps) {
  const { config, onOpen, logger = createLogger('sock', config.logLevel) } = deps
  const sessionDir = path.join('sessions', config.sessionName)
  config.sessionDir = sessionDir

  let webServer = null

  const connect = async () => {
    const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))

    const sock = makeWASocket({
      version,
      logger: logger.child({ class: 'baileys' }),
      printQRInTerminal: false,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger.child({ class: 'keystore' }))
      },
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false
    })
    state.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update

      if (qr) {
        state.qr = qr
        state.connected = false
        state.connection = 'waiting for QR'
        printQR(qr, args['big-qr'])
        if (config.webServer.enabled && !webServer) {
          webServer = startWebServer(config.webServer.port, logger, config.locale)
        } else {
          logger.info('📱 scan the QR: WhatsApp → Linked devices → Link a device')
        }
      }

      if (connection === 'connecting') state.connection = 'connecting'

      if (connection === 'open') {
        state.qr = null
        state.connected = true
        state.connection = 'connected'
        state.phone = sock.user?.id?.split('@')[0] || null
        logger.info(`✅ connected as ${sock.user?.id || 'unknown'}`)
        try {
          await onOpen?.(sock, { isNew: !authState.creds.registered })
        } catch (e) {
          logger.error({ err: e }, 'onOpen hook failed')
        }
      }

      if (connection === 'close') {
        state.connected = false
        state.qr = null
        state.connection = 'closed'
        const code = lastDisconnect?.error?.output?.statusCode
        logger.warn({ code }, `connection closed: ${lastDisconnect?.error?.message || 'unknown reason'}`)

        if (code === DisconnectReason.loggedOut) {
          logger.error('🚪 session logged out. Delete the folder under sessions/ and restart to pair again.')
          process.exit(1)
        }
        state.reconnects++
        const wait = Math.min(3000 * state.reconnects, 30_000)
        setTimeout(() => {
          connect().catch(e => logger.error({ err: e }, 'reconnect failed'))
        }, wait)
      }
    })
  }

  connect().catch(e => logger.error({ err: e }, 'initial connection failed'))
  return { state }
}

export default startConnection
