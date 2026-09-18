/**
 * Media pipeline: ffmpeg wrapper, sticker creation (sharp + node-webpmux),
 * webp/mp3/mp4 conversions. Modern replacement for the old lib/converter.js
 * and lib/sticker.js — fewer binaries required (ffmpeg + sharp only).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import webpmux from 'node-webpmux'

const { Image: WebPImage } = webpmux

const TMP = process.env.WABOT_TMPDIR || path.join(process.cwd(), 'tmp')

function tmpFile (ext) {
  fs.mkdirSync(TMP, { recursive: true })
  return path.join(TMP, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`)
}

/** Run ffmpeg over a buffer, resolve with the output buffer. */
export function ffmpeg (buffer, args = [], ext = 'bin', outExt = 'bin') {
  return new Promise((resolve, reject) => {
    const input = tmpFile(ext)
    const output = `${input}.${outExt}`
    fs.writeFileSync(input, buffer)
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...args, output])
    let err = ''
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', () => reject(new Error('ffmpeg not found. Install it: apt install ffmpeg')))
    proc.on('close', code => {
      fs.promises.unlink(input).catch(() => {})
      if (code !== 0) {
        fs.promises.unlink(output).catch(() => {})
        return reject(new Error('ffmpeg failed: ' + err.slice(0, 200)))
      }
      fs.promises.readFile(output)
        .then(buf => { fs.promises.unlink(output).catch(() => {}); resolve(buf) })
        .catch(reject)
    })
  })
}

/** Check ffmpeg availability (and animated webp support). */
export async function checkFfmpeg () {
  const result = { ffmpeg: false, webp: false }
  const probe = (args) => new Promise(resolve => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args])
    p.on('error', () => resolve(false))
    p.on('close', code => resolve(code === 0))
  })
  result.ffmpeg = await probe(['-version'])
  result.webp = await probe(['-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', '-f', 'webp', '-'])
  return result
}

// ---------------------------------------------------------------------------
// Sticker
// ---------------------------------------------------------------------------

/** Build the WhatsApp sticker EXIF (pack name / author). */
export function stickerExif (packname, author) {
  const json = JSON.stringify({
    'sticker-pack-id': 'wabot-aq',
    'sticker-pack-name': String(packname || '').slice(0, 64),
    'sticker-author-name': String(author || '').slice(0, 64)
  })
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, // II* (little endian TIFF)
    0x08, 0x00, 0x00, 0x00, // offset of first IFD
    0x01, 0x00, // 1 entry
    0x41, 0x57, 0x07, 0x00, // tag 0x5741 ("WA"), type: undefined
    0x00, 0x00, 0x00, 0x00, // (JSON length is written here)
    0x16, 0x00, 0x00, 0x00 // value offset: 22
  ])
  const jsonBuf = Buffer.from(json, 'utf8')
  tiff.writeUIntLE(jsonBuf.length, 14, 4)
  return Buffer.concat([Buffer.from('Exif\0\0'), tiff, jsonBuf])
}

/** Attach sticker EXIF to a webp buffer. */
export async function addExif (webpBuffer, packname, author) {
  const img = new WebPImage()
  await img.load(webpBuffer)
  img.exif = stickerExif(packname, author)
  return img.save(null)
}

/** Image → 512x512 webp (sticker size). */
export async function imageToWebp (buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer()
}

/** Video/GIF → animated webp sticker (max 10 seconds). */
export function videoToWebp (buffer, ext, duration) {
  const t = Math.min(Math.max(duration || 10, 1), 10)
  return ffmpeg(buffer, [
    '-t', String(t),
    '-vf', [
      'fps=12',
      'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease',
      'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0',
      'setsar=1',
      'format=rgba'
    ].join(','),
    '-c:v', 'libwebp',
    '-quality', '80',
    '-loop', '0',
    '-an'
  ], ext, 'webp')
}

/** Sticker pipeline: image/video/webp buffer → EXIF-tagged sticker. */
export async function toSticker (buffer, mime, { packname = 'Sticker', author = '', duration } = {}) {
  let webp
  if (/webp/i.test(mime)) {
    webp = buffer
  } else if (/image|gif|png|jpe?g|tiff/i.test(mime)) {
    webp = await imageToWebp(buffer)
  } else if (/video|mp4|mkv|mov|webm|3gp/i.test(mime)) {
    webp = await videoToWebp(buffer, mime.split('/')[1]?.split(';')[0] || 'mp4', duration)
  } else {
    throw new Error(`unsupported media type: ${mime}`)
  }
  return addExif(webp, packname, author)
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Sticker (webp) → PNG image. */
export const webpToImage = (buffer) => sharp(buffer).png().toBuffer()

/** Animated sticker (webp) → MP4 video. */
export function webpToVideo (buffer) {
  return ffmpeg(buffer, [
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,setsar=1',
    '-c:v', 'libx264',
    '-crf', '30',
    '-preset', 'medium'
  ], 'webp', 'mp4')
}

/** Any audio/video → playable MP3. */
export function toAudio (buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac', '2',
    '-b:a', '128k',
    '-ar', '44100',
    '-c:a', 'libmp3lame',
    '-f', 'mp3'
  ], ext, 'mp3')
}

/** Any audio/video → WhatsApp voice note (opus). */
export function toPTT (buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '96k',
    '-vbr', 'on',
    '-compression_level', '10',
    '-ar', '48000',
    '-f', 'ogg'
  ], ext, 'ogg')
}

/** Audio/video → WhatsApp-compatible MP4. */
export function toVideo (buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1'
  ], ext, 'mp4')
}
