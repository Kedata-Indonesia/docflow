import { computed, ref } from 'vue'
import type { CslStyleInfo } from '@kedata-indonesia/docflow-plugins'
import { SAMPLE_INJECTED_STYLE, SAMPLE_SOURCES } from '../fixtures/citations'
import type { LogFn } from '../types'

const IMPORTED_STYLE_KEY = 'docflow.playground.imported-csl-style'

/** Issue #251 — imported `.csl` styles are persisted like a real host would. */
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

export interface CitationLibraryOptions {
  log: LogFn
}

/**
 * Citation port fixture: seeds the reference library and remembers styles the
 * user imports. `onSourceRequest` is deliberately not set, so `<DocsEditor>`
 * keeps the built-in picker flow — the `#references-sidebar` slot is what
 * replaces the sidebar UI in the playground.
 */
export function useCitationLibrary({ log }: CitationLibraryOptions) {
  const importedStyles = ref<CslStyleInfo[]>(loadImportedStyle())

  const citation = computed(() => ({
    sources: SAMPLE_SOURCES,
    style: 'chicago-notes-bibliography',
    styles: [SAMPLE_INJECTED_STYLE, ...importedStyles.value],
  }))

  function onStyleImported(style: CslStyleInfo): void {
    importedStyles.value = [style]
    try {
      window.localStorage.setItem(IMPORTED_STYLE_KEY, JSON.stringify(style))
    } catch {
      // Private mode / storage full — the style still works for this session.
    }
    log('citation-style-imported', `${style.name} (${style.id})`)
  }

  return { citation, onStyleImported }
}
