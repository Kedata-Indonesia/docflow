import { watch } from 'vue'
import { provideLocale, type Locale, type LocaleContext } from './useLocale.js'

/**
 * Locale owner for the editor chrome: provides the injection context every
 * child uses, mirrors the `locale` prop into it, and re-emits local changes so
 * `v-model:locale` keeps working.
 *
 * Must be called from `DocsEditor`'s setup — `provideLocale` uses
 * `provide()`, which only works inside a component instance.
 */
export function useDocsEditorLocale(
  getLocale: () => Locale | undefined,
  emitLocale: (locale: Locale) => void,
): LocaleContext {
  const context = provideLocale(getLocale())

  watch(getLocale, (next) => {
    if (next && next !== context.locale.value) {
      context.setLocale(next)
    }
  })

  watch(context.locale, (next) => emitLocale(next))

  return context
}
