import en from './en.js'
import id from './id.js'

export type Locale = 'en' | 'id'

export const messages: Record<Locale, Record<string, unknown>> = {
  en,
  id,
}

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: en.language.en,
  id: id.language.id,
}

export type Messages = typeof en
export type TranslationKey = keyof Flatten<Messages>

// Helper type to flatten nested message objects into dot-notation keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Flatten<T extends Record<string, any>, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? Flatten<T[K], `${Prefix extends '' ? '' : `${Prefix}.`}${K & string}`>
    : { [P in `${Prefix extends '' ? '' : `${Prefix}.`}${K & string}`]: T[K] }
}[keyof T] extends infer O
  ? O extends Record<string, unknown>
    ? { [K in keyof O]: O[K] }
    : never
  : never

export function getLocaleMessages(locale: Locale): typeof en {
  return (messages[locale] ?? messages[defaultLocale]) as typeof en
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in messages
}
