import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertSafeUrl,
  fmtBytes,
  hashPercent,
  isUrl,
  levenshtein,
  mention,
  msToTime,
  parseDuration,
  progressBar,
  randomPick,
  redactSecrets,
  safeFilename,
  safeMath
} from '../src/lib/utils.js'

test('url detection', () => {
  assert.equal(isUrl('https://example.com/x'), true)
  assert.equal(isUrl('http://example.com:3000/x'), true)
  assert.equal(isUrl('ftp://example.com'), false)
  assert.equal(isUrl('not a url'), false)
})

test('duration and byte formatting', () => {
  assert.equal(msToTime(90_000), '1m 30s')
  assert.equal(msToTime(0), '0s')
  assert.equal(parseDuration('1h30m'), 5_400_000)
  assert.equal(parseDuration('2d 5s'), 172_805_000)
  assert.equal(parseDuration('nope'), null)
  assert.equal(fmtBytes(0), '0 B')
  assert.equal(fmtBytes(1024), '1.0 KB')
  assert.equal(fmtBytes(1500), '1.5 KB')
})

test('deterministic helpers', () => {
  assert.equal(hashPercent('hello'), hashPercent('hello'))
  assert.ok(hashPercent('hello') >= 0 && hashPercent('hello') <= 100)
  assert.equal(randomPick(['x']), 'x')
  assert.equal(mention('905000000000@s.whatsapp.net'), '@905000000000')
  assert.equal(safeFilename('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(progressBar(50, 10), '█████░░░░░')
  assert.equal(progressBar(150, 10), '██████████')
})

test('redacts common secret shapes', () => {
  const text = 'token=sk-abcdefghijklmnop Authorization: Bearer abcdefghijklmnop'
  const out = redactSecrets(text)
  assert.ok(out.includes('[REDACTED]'))
  assert.ok(!out.includes('sk-abcdefghijklmnop'))
  assert.ok(!out.includes('abcdefghijklmnop'))
})

test('safeMath uses precedence without eval', () => {
  assert.equal(safeMath('2+3*4'), 14)
  assert.equal(safeMath('(2+3)*4'), 20)
  assert.equal(safeMath('10/4'), 2.5)
  assert.throws(() => safeMath('1/0'), /division by zero/)
  assert.throws(() => safeMath('(1+2'), /mismatched parentheses/)
  assert.throws(() => safeMath(''), /invalid expression/)
})

test('levenshtein gives suggestions', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3)
  assert.equal(levenshtein('ping', 'pong'), 1)
  assert.equal(levenshtein('a', 'abcdefgh'), 99)
})

test('SSRF guard rejects internal literals and bad protocols', async () => {
  await assert.rejects(() => assertSafeUrl('http://127.0.0.1'), /internal addresses/)
  await assert.rejects(() => assertSafeUrl('http://10.0.0.1'), /internal addresses/)
  await assert.rejects(() => assertSafeUrl('http://169.254.169.254'), /internal addresses/)
  await assert.rejects(() => assertSafeUrl('http://[::1]'), /internal addresses/)
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /http\(s\)/)
})
