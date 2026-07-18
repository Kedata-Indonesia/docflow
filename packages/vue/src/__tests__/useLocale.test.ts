import { describe, expect, it, beforeEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import {
  createLocaleContext,
  useLocale,
  provideLocale,
  getLocaleName,
  getSupportedLocales,
} from '../composables/useLocale.js'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => { delete mockStorage[key] })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
    clear: vi.fn(() => { Object.keys(mockStorage).forEach((key) => { delete mockStorage[key] }) }),
  })
})

describe('useLocale', () => {
  it('defaults to English', () => {
    const ctx = createLocaleContext()
    expect(ctx.locale.value).toBe('en')
    expect(ctx.t('header.share')).toBe('Share')
  })

  it('switches locale and returns translated messages', () => {
    const ctx = createLocaleContext()
    ctx.setLocale('id')
    expect(ctx.locale.value).toBe('id')
    expect(ctx.t('header.share')).toBe('Bagikan')
  })

  it('ignores invalid locale values', () => {
    const ctx = createLocaleContext()
    // @ts-expect-error testing invalid input
    ctx.setLocale('fr')
    expect(ctx.locale.value).toBe('en')
  })

  it('returns the key for unknown translations', () => {
    const ctx = createLocaleContext()
    expect(ctx.t('unknown.missing.key')).toBe('unknown.missing.key')
  })

  it('provides and injects locale context through the component tree', async () => {
    const Parent = defineComponent({
      setup() {
        provideLocale('id')
        return () => h(Child)
      },
    })

    const Child = defineComponent({
      setup() {
        const { t, locale } = useLocale()
        return () => h('div', `${locale.value}-${t('header.share')}`)
      },
    })

    const wrapper = mount(Parent)
    await nextTick()
    expect(wrapper.text()).toBe('id-Bagikan')
  })

  it('falls back to a self-contained context when no provider exists', () => {
    const Component = defineComponent({
      setup() {
        const { t, locale } = useLocale()
        return () => h('div', `${locale.value}-${t('header.share')}`)
      },
    })

    const wrapper = mount(Component)
    expect(wrapper.text()).toBe('en-Share')
  })

  it('exposes locale names and supported locales', () => {
    expect(getSupportedLocales()).toEqual(['en', 'id'])
    expect(getLocaleName('en')).toBe('English')
    expect(getLocaleName('id')).toBe('Indonesia')
  })
})
