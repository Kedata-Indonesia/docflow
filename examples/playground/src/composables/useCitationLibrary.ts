import { computed, ref } from 'vue'
import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { SAMPLE_INJECTED_STYLE, SAMPLE_SOURCES } from '../sampleData'

/**
 * Issue #251 — imported `.csl` styles are persisted here, the same way a real
 * host would: `citation-style-imported` stores the style object in localStorage
 * and it is fed back through `citation.styles` on the next mount.
 */
const IMPORTED_STYLE_KEY = 'docflow.playground.imported-csl-style'

/**
 * Citation port: seeds the reference library. We deliberately do NOT set
 * `onSourceRequest`, so `DocsEditor` keeps the built-in picker flow (toolbar
 * Citation → sidebar in picker mode). The `#references-sidebar` slot in the
 * playground replaces the built-in sidebar's UI with a knowledge-base picker.
 *
 * `styles` demonstrates the host-injection path of #180: a style the library
 * does not bundle, supplied by the app that embeds the editor. It shows up in
 * the reference sidebar's style picker next to APA/MLA/Chicago.
 */
export function useCitationLibrary(
  log: (name: string, detail?: string | number) => void,
) {
  const importedStyles = ref<CslStyleInfo[]>(loadImportedStyle())

  const citation = computed(() => ({
    sources: SAMPLE_SOURCES,
    style: 'chicago-notes-bibliography',
    styles: [SAMPLE_INJECTED_STYLE, ...importedStyles.value],
  }))

  function onCitationStyleImported(style: CslStyleInfo): void {
    importedStyles.value = [style]
    try {
      window.localStorage.setItem(IMPORTED_STYLE_KEY, JSON.stringify(style))
    } catch {
      // Private mode / storage full — the style still works for this session.
    }
    log('citation-style-imported', `${style.name} (${style.id})`)
  }

  return { citation, onCitationStyleImported }
}

function loadImportedStyle(): CslStyleInfo[] {
  try {
    const raw = window.localStorage.getItem(IMPORTED_STYLE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CslStyleInfo
    return parsed?.id && parsed?.xml ? [parsed] : []
  } catch {
    return []
  }
}
