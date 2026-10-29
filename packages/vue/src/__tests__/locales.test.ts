import { describe, expect, it } from 'vitest'
import en from '../locales/en.js'
import id from '../locales/id.js'
import { getLocaleMessages, messages } from '../locales/index.js'

/**
 * Locales are composed from one file per namespace
 * (`locales/<lang>/<namespace>.ts`), so these guards keep the two languages in
 * lockstep — a key added to `en` without `id` would silently fall back to the
 * English string at runtime, which reads like a bug in the UI.
 */
function flatten(input: unknown, prefix = '', out: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') flatten(value, path, out)
    else out[path] = value
  }
  return out
}

const enKeys = Object.keys(flatten(en))
const idKeys = Object.keys(flatten(id))

describe('locale messages', () => {
  it('has a non-empty message table per language', () => {
    expect(Object.keys(messages)).toEqual(['en', 'id'])
    expect(enKeys.length).toBeGreaterThan(100)
    expect(idKeys.length).toBeGreaterThan(100)
  })

  it('exposes the same keys in every language', () => {
    expect(enKeys.filter((key) => !idKeys.includes(key))).toEqual([])
    expect(idKeys.filter((key) => !enKeys.includes(key))).toEqual([])
  })

  it('never ships an empty translation', () => {
    for (const [locale, table] of Object.entries({ en, id })) {
      const empty = Object.entries(flatten(table))
        .filter(([, value]) => typeof value === 'string' && !value.trim())
        .map(([key]) => `${locale}.${key}`)
      expect(empty).toEqual([])
    }
  })

  it('resolves messages through the locale accessor', () => {
    expect(getLocaleMessages('id').header.share).toBe('Bagikan')
    expect(getLocaleMessages('en').header.share).toBe('Share')
  })
})
