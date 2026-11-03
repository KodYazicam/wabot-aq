import test from 'node:test'
import assert from 'node:assert/strict'

import { MAX_TEXT_LENGTH, textStickerSvg, textToSticker, wrapText } from '../src/lib/textsticker.js'
import { commands } from '../src/commands/sticker.js'
import { initI18n, t } from '../src/i18n/index.js'

initI18n({ locale: 'en' })

test('text wrapping respects the line limit and splits long words', () => {
  assert.deepEqual(wrapText('one two three', 8), ['one two', 'three'])
  assert.deepEqual(wrapText('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
  assert.deepEqual(wrapText('   ', 8), [])
})

test('SVG output escapes text and applies the requested style', () => {
  const ttp = textStickerSvg('a & <b>', 'ttp')
  assert.match(ttp, /a &amp; &lt;b&gt;/)
  assert.doesNotMatch(ttp, /<rect/)

  const brat = textStickerSvg('hello', 'brat')
  assert.match(brat, /<rect[^>]+fill="#ffffff"/)
  assert.match(brat, /fill="#111111"/)
})

test('text stickers are valid EXIF-tagged WebP files', async () => {
  const buf = await textToSticker('hello sticker', {
    style: 'ttp',
    packname: 'Test pack',
    author: 'Tester'
  })
  assert.equal(buf.subarray(0, 4).toString(), 'RIFF')
  assert.equal(buf.subarray(8, 12).toString(), 'WEBP')
  assert.ok(buf.length > 500)
})

test('ttp and brat validate missing and oversized text', async () => {
  const replies = []
  const ctx = {
    text: '',
    m: { quoted: null },
    usedPrefix: '.',
    t: (key, params) => t('en', key, params),
    reply: async (text) => replies.push(text)
  }
  const ttp = commands.find(def => def.name === 'ttp')
  await ttp.run(ctx)
  assert.match(replies.at(-1), /Usage/)

  await ttp.run({ ...ctx, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })
  assert.match(replies.at(-1), /too long/)
})

test('ttp sends a rendered sticker', async () => {
  const sent = []
  const reactions = []
  const ctx = {
    text: 'hello',
    m: {
      chat: '123@g.us',
      quoted: null,
      react: async (emoji) => reactions.push(emoji)
    },
    usedPrefix: '.',
    config: { sticker: { packname: 'Test', author: 'Bot' } },
    t: (key, params) => t('en', key, params),
    reply: async () => {},
    sock: { sendMessage: async (...args) => sent.push(args) }
  }
  const ttp = commands.find(def => def.name === 'ttp')
  await ttp.run(ctx)

  assert.equal(sent.length, 1)
  assert.equal(sent[0][0], '123@g.us')
  assert.equal(sent[0][1].sticker.subarray(0, 4).toString(), 'RIFF')
  assert.deepEqual(reactions, ['⏳', '✅'])
})
