import { ref, provide, inject, type InjectionKey, type Ref } from 'vue'
import { type Locale, defaultLocale, getLocaleMessages, localeNames, isLocale } from '../locales/index.js'

export type { Locale }

export interface LocaleContext {
  locale: Ref<Locale>
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const localeKey: InjectionKey<LocaleContext> = Symbol('docflow-locale')

const LOCAL_STORAGE_KEY = 'docflow-locale'

function resolveInitialLocale(preferred?: Locale): Locale {
  if (preferred && isLocale(preferred)) return preferred

  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (stored && isLocale(stored)) return stored as Locale
  } catch {
    // localStorage may be unavailable in SSR/test environments.
  }

  return defaultLocale
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let value: unknown = obj
  for (const part of parts) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

export function createLocaleContext(preferred?: Locale): LocaleContext {
  const locale = ref<Locale>(resolveInitialLocale(preferred))

  const setLocale = (next: Locale) => {
    if (!isLocale(next)) return
    locale.value = next
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }

  const t = (key: string): string => {
    const messages = getLocaleMessages(locale.value)
    const value = getValueByPath(messages as Record<string, unknown>, key)
    if (typeof value === 'string') return value
    return key
  }

  return { locale, setLocale, t }
}

export function useLocale(): LocaleContext {
  const context = inject(localeKey, null)
  if (context) return context

  // Fallback: if no provider exists, create a self-contained context.
  // This keeps components usable when they are not wrapped by a provider.
  return createLocaleContext()
}

export function provideLocale(preferred?: Locale): LocaleContext {
  const context = createLocaleContext(preferred)
  provide(localeKey, context)
  return context
}

export function getLocaleName(locale: Locale): string {
  return localeNames[locale] ?? locale
}

export function getSupportedLocales(): Locale[] {
  return ['en', 'id']
}
