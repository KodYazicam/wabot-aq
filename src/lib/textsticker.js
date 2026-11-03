/**
 * Text-to-sticker renderer: SVG → 512×512 WebP with sticker EXIF.
 *
 * Two looks:
 *  - ttp  — bold white text with a black outline on transparency
 *  - brat — black text on a white background
 */
import sharp from 'sharp'
import { addExif } from './media.js'

export const MAX_TEXT_LENGTH = 120
const CANVAS = 512
const PADDING = 44
const MAX_WIDTH = CANVAS - PADDING * 2
const MAX_HEIGHT = CANVAS - PADDING * 2

function escapeXml (text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Wrap text into lines of at most `maxChars` characters. Very long words are
 * split instead of overflowing the sticker.
 */
export function wrapText (text, maxChars) {
  const limit = Math.max(1, Math.floor(maxChars))
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines = []
  let line = ''

  const pushWord = (word) => {
    if (word.length > limit) {
      if (line) {
        lines.push(line)
        line = ''
      }
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit))
      return
    }
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= limit) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }

  for (const word of words) pushWord(word)
  if (line) lines.push(line)
  return lines
}

/** Pick the largest font size whose wrapped text fits the canvas. */
function layoutText (text) {
  let fallback = null
  for (const size of [76, 66, 58, 50, 44, 38, 32, 27, 23]) {
    const lineHeight = Math.round(size * 1.16)
    const maxChars = Math.max(6, Math.floor(MAX_WIDTH / (size * 0.58)))
    const lines = wrapText(text, maxChars)
    const height = Math.max(1, lines.length) * lineHeight
    fallback = { size, lineHeight, lines }
    if (height <= MAX_HEIGHT) return fallback
  }
  return fallback
}

/** Build the SVG source for a text sticker. */
export function textStickerSvg (text, style = 'ttp') {
  const { size, lineHeight, lines } = layoutText(text)
  const startY = CANVAS / 2 - ((lines.length - 1) * lineHeight) / 2
  const brat = style === 'brat'
  const fill = brat ? '#111111' : '#ffffff'
  const stroke = brat ? 'none' : '#000000'
  const strokeWidth = Math.max(4, Math.round(size * 0.1))
  const background = brat ? `<rect width="${CANVAS}" height="${CANVAS}" fill="#ffffff"/>` : ''
  const tspans = lines.map((line, index) =>
    `<tspan x="${CANVAS / 2}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    background,
    `<text x="${CANVAS / 2}" y="${startY}" text-anchor="middle" dominant-baseline="middle"`,
    ` font-family="'DejaVu Sans', 'Noto Sans', Arial, Helvetica, sans-serif"`,
    ` font-size="${size}" font-weight="${brat ? 500 : 800}" fill="${fill}"`,
    ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">`,
    tspans,
    '</text>',
    '</svg>'
  ].join('')
}

/** Render text to an EXIF-tagged WhatsApp sticker. */
export async function textToSticker (text, {
  style = 'ttp',
  packname = 'Sticker',
  author = ''
} = {}) {
  const svg = textStickerSvg(text, style)
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer()
  return addExif(webp, packname, author)
}

export default { MAX_TEXT_LENGTH, wrapText, textStickerSvg, textToSticker }
