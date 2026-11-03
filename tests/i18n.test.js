import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ROLE_THRESHOLDS,
  availableLocales,
  getRoleName,
  initI18n,
  resolveLocale,
  t,
  tArray
} from '../src/i18n/index.js'

const LOCALES_DIR = fileURLToPath(new URL('../src/i18n/locales/', import.meta.url))

function flatten (obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out)
    else out[full] = value
  }
  return out
}

initI18n({ locale: 'en' })

test('every locale has the same keys and role tiers', () => {
  const en = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8')))
  const enKeys = Object.keys(en).sort()

  for (const code of availableLocales()) {
    const locale = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8')))
    assert.deepEqual(Object.keys(locale).sort(), enKeys, `${code} keys differ from en`)
    for (const key of enKeys) {
      assert.equal(
        Array.isArray(locale[key]),
        Array.isArray(en[key]),
        `${code}:${key} has a different value type`
      )
      if (Array.isArray(en[key])) {
        assert.equal(locale[key].length, en[key].length, `${code}:${key} has a different array length`)
      }
    }
    assert.equal(tArray(code, 'rpg.roles').length, ROLE_THRESHOLDS.length, `${code} role count`)
  }
})

test('loads every bundled locale', () => {
  const locales = availableLocales()
  for (const code of ['en', 'tr', 'es', 'id', 'de', 'fr']) {
    assert.ok(locales.includes(code), `missing locale ${code}`)
  }
  assert.deepEqual(locales, [...locales].sort())
})

test('interpolates parameters and falls back to english', () => {
  assert.match(t('tr', 'general.error', { msg: 'boom' }), /boom/)
  assert.match(t('xx', 'general.error', { msg: 'boom' }), /boom/)
  assert.equal(t('en', 'this.key.does.not.exist'), 'this.key.does.not.exist')
})

test('resolveLocale picks the first loaded preference', () => {
  assert.equal(resolveLocale(['xx', 'tr', 'en']), 'tr')
  assert.equal(resolveLocale(['xx']), 'en')
  assert.equal(resolveLocale([]), 'en')
})

test('array keys and role tiers work', () => {
  const roles = tArray('en', 'rpg.roles')
  assert.equal(roles.length, 8)
  assert.equal(getRoleName('en', 0), roles[0])
  assert.equal(getRoleName('en', 3), roles[1])
  assert.equal(getRoleName('en', 999), roles[roles.length - 1])
})

test('array helper returns an empty list for strings', () => {
  assert.deepEqual(tArray('en', 'general.error'), [])
})

test('plugin locales are namespaced and only merge into core locales', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-plugin-locales-'))
  const hello = path.join(dir, 'hello')
  fs.mkdirSync(hello)
  fs.writeFileSync(
    path.join(hello, 'en.json'),
    JSON.stringify({ greeting: 'Hello {name}', nested: { line: 'Nested line' } })
  )
  fs.writeFileSync(
    path.join(hello, 'tr.json'),
    JSON.stringify({ greeting: 'Merhaba {name}' })
  )
  fs.writeFileSync(path.join(hello, 'xx.json'), JSON.stringify({ greeting: 'Nope' }))

  const broken = path.join(dir, 'broken')
  fs.mkdirSync(broken)
  fs.writeFileSync(path.join(broken, 'en.json'), '{not json')

  for (const name of ['a.b', 'a_b']) {
    const collision = path.join(dir, name)
    fs.mkdirSync(collision)
    fs.writeFileSync(path.join(collision, 'en.json'), JSON.stringify({ greeting: name }))
  }

  const warnings = []
  initI18n({
    locale: 'en',
    pluginLocaleDir: dir,
    logger: { warn: (message) => warnings.push(String(message)) }
  })

  assert.equal(t('en', 'plugin.hello.greeting', { name: 'Ada' }), 'Hello Ada')
  assert.equal(t('tr', 'plugin.hello.greeting', { name: 'Ada' }), 'Merhaba Ada')
  assert.equal(t('en', 'plugin.hello.nested.line'), 'Nested line')
  assert.equal(t('de', 'plugin.hello.greeting', { name: 'Ada' }), 'Hello Ada')
  assert.equal(t('en', 'plugin.hello.xx'), 'plugin.hello.xx')
  assert.equal(t('en', 'plugin.broken.greeting'), 'plugin.broken.greeting')
  assert.ok(warnings.some((warning) => warning.includes('unsupported locale')))
  assert.ok(warnings.some((warning) => warning.includes('failed to load')))
  assert.ok(warnings.some((warning) => warning.includes('already exists')))
  assert.deepEqual(availableLocales(), ['de', 'en', 'es', 'fr', 'id', 'tr'])
})

