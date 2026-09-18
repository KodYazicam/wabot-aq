/**
 * YouTube download engine with layered fallbacks:
 *   1. InnerTube API (ANDROID client — direct URLs, no signature needed)
 *   2. @distube/ytdl-core (often works from residential networks)
 *   3. yt-dlp binary (if installed on the host)
 * Keeps downloads working when one engine is blocked/broken.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

const execFileAsync = promisify(execFile)

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player'
const ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    androidSdkVersion: 30,
    hl: 'en',
    gl: 'US'
  }
}

const TMP = process.env.WABOT_TMPDIR || path.join(process.cwd(), 'tmp')

function tmpFile (ext) {
  fs.mkdirSync(TMP, { recursive: true })
  return path.join(TMP, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`)
}

/** Extract the video id from any YouTube URL form. */
export function parseVideoId (input) {
  if (!input) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
  const m = String(input).match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

async function innertubePlayer (videoId) {
  const res = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, context: ANDROID_CONTEXT }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`innertube HTTP ${res.status}`)
  const data = await res.json()
  if (data.playabilityStatus?.status !== 'OK') {
    throw new Error(`innertube playability: ${data.playabilityStatus?.status || 'unknown'}`)
  }
  const formats = [
    ...(data.streamingData?.formats || []),
    ...(data.streamingData?.adaptiveFormats || [])
  ].filter(f => f.url)
  if (!formats.length) throw new Error('innertube: no playable formats')
  return {
    title: data.videoDetails?.title || 'video',
    author: data.videoDetails?.author || '',
    lengthSeconds: parseInt(data.videoDetails?.lengthSeconds || 0),
    viewCount: parseInt(data.videoDetails?.viewCount || 0),
    formats,
    engine: 'innertube'
  }
}

async function ytdlCoreInfo (videoId) {
  const ytdl = (await import('@distube/ytdl-core')).default
  const info = await ytdl.getInfo(videoId)
  const formats = info.formats.filter(f => f.url)
  if (!formats.length) throw new Error('ytdl-core: no playable formats')
  return {
    title: info.videoDetails.title,
    author: info.videoDetails.author,
    lengthSeconds: parseInt(info.videoDetails.lengthSeconds || 0),
    viewCount: parseInt(info.videoDetails.viewCount || 0),
    formats,
    engine: 'ytdl-core'
  }
}

/** Fetch info through the fallback chain. */
export async function ytGetInfo (urlOrId) {
  const id = parseVideoId(urlOrId)
  if (!id) throw new Error('invalid YouTube URL or id')
  const engines = [['innertube', innertubePlayer], ['ytdl-core', ytdlCoreInfo]]
  const errors = []
  for (const [, engine] of engines) {
    try {
      return await engine(id)
    } catch (e) {
      errors.push(e.message)
    }
  }
  throw new Error(errors.join(' | '))
}

function pickFormat (info, mode) {
  const audio = info.formats.filter(f => /^audio\//.test(f.mimeType || ''))
  if (mode === 'audio') {
    return audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null
  }
  // combined formats first (no remux needed)
  const combined = info.formats.filter(f =>
    (f.mimeType || '').startsWith('video/mp4') && (f.mimeType || '').includes('audio'))
  if (combined.length) return combined.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]
  const video = info.formats.filter(f => (f.mimeType || '').startsWith('video/mp4'))
  return video.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null
}

async function downloadUrl (url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(300_000),
    headers: { 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip' }
  })
  if (!res.ok) throw new Error(`media HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Remux video + audio streams into one mp4 (stream copy — fast). */
function ffmpegMerge (videoBuf, audioBuf) {
  return new Promise((resolve, reject) => {
    const v = tmpFile('v.mp4')
    const a = tmpFile('a.m4a')
    const out = `${v}.out.mp4`
    fs.writeFileSync(v, videoBuf)
    fs.writeFileSync(a, audioBuf)
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', v, '-i', a, '-c', 'copy', '-movflags', '+faststart', out])
    let err = ''
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', () => reject(new Error('ffmpeg not found')))
    proc.on('close', code => {
      for (const f of [v, a]) fs.promises.unlink(f).catch(() => {})
      if (code !== 0) {
        fs.promises.unlink(out).catch(() => {})
        return reject(new Error('ffmpeg merge failed: ' + err.slice(0, 200)))
      }
      fs.promises.readFile(out)
        .then(buf => { fs.promises.unlink(out).catch(() => {}); resolve(buf) })
        .catch(reject)
    })
  })
}

/** Download via the yt-dlp binary (used as last resort). */
async function ytDlpBuffer (url, mode) {
  const args = mode === 'audio'
    ? ['-f', 'bestaudio[ext=m4a]/bestaudio', '-o', '-']
    : ['-f', 'best[ext=mp4]/best', '-o', '-']
  const { stdout } = await execFileAsync('yt-dlp', [...args, url], {
    maxBuffer: 256 * 1024 * 1024,
    timeout: 300_000
  })
  return Buffer.from(stdout)
}

export const hasYtDlp = async () => {
  try {
    await execFileAsync('yt-dlp', ['--version'], { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Download audio or video. Returns
 * { buffer, title, mime, ext, size, engine }.
 */
export async function ytDownload (urlOrId, { mode = 'audio', maxSize = 100 * 1024 * 1024 } = {}) {
  let info
  try {
    info = await ytGetInfo(urlOrId)
  } catch (e) {
    // both metadata engines failed → try yt-dlp directly
    try {
      const buffer = await ytDlpBuffer(urlOrId, mode)
      return { buffer, title: 'video', mime: mode === 'audio' ? 'audio/mpeg' : 'video/mp4', ext: mode === 'audio' ? 'mp3' : 'mp4', size: buffer.length, engine: 'yt-dlp' }
    } catch {
      throw new Error(e.message)
    }
  }

  const fmt = pickFormat(info, mode)
  if (!fmt) throw new Error('no suitable format found')

  const size = fmt.contentLength ? parseInt(fmt.contentLength) : 0
  if (size && size > maxSize) {
    const err = new Error('FILE_TOO_BIG')
    err.fileTooBig = true
    err.title = info.title
    err.size = size
    throw err
  }

  const result = {
    buffer: null,
    title: info.title,
    author: info.author,
    mime: mode === 'audio' ? 'audio/mpeg' : 'video/mp4',
    ext: mode === 'audio' ? 'mp3' : 'mp4',
    size: 0,
    engine: info.engine
  }

  const isAudioStream = /^audio\//.test(fmt.mimeType || '')
  const needsRemux = mode === 'video' && !isAudioStream && !(fmt.mimeType || '').includes('audio')

  try {
    const buffer = await downloadUrl(fmt.url)
    result.buffer = buffer
    result.size = buffer.length
    result.mime = fmt.mimeType || result.mime
  } catch (e) {
    // direct URL failed (e.g. signature required) → yt-dlp binary
    const buffer = await ytDlpBuffer(urlOrId, mode)
    result.buffer = buffer
    result.size = buffer.length
    result.engine = 'yt-dlp'
  }

  if (mode === 'audio') {
    // m4a/webm → mp3 for reliable WhatsApp playback
    const { toAudio } = await import('./media.js')
    const inExt = (fmt.mimeType || '').includes('webm') ? 'weba' : 'm4a'
    result.buffer = await toAudio(result.buffer, inExt)
    result.mime = 'audio/mpeg'
    result.ext = 'mp3'
    result.size = result.buffer.length
  } else if (needsRemux) {
    const audioFmt = pickFormat(info, 'audio')
    if (audioFmt) {
      const audioBuf = await downloadUrl(audioFmt.url).catch(() => null)
      if (audioBuf) {
        result.buffer = await ffmpegMerge(result.buffer, audioBuf)
        result.mime = 'video/mp4'
        result.size = result.buffer.length
      }
    }
  }
  return result
}

export default { ytGetInfo, ytDownload, parseVideoId, hasYtDlp }
