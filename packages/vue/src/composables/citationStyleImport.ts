import { ref } from 'vue'
import { parseCslStyle } from '@kedata-indonesia/docflow-plugins'
import type { CitationEngineLike, CitationsEmit } from './citationTypes.js'
import type { LocaleContext } from './useLocale.js'

export interface UseCitationStyleImportOptions {
  t: LocaleContext['t']
  emit: CitationsEmit
  /** The engine is read lazily — it mounts with the editor, after setup. */
  getEngine: () => CitationEngineLike | null
  /** Re-read the engine's style registry into the picker. */
  refreshStyles: () => void
  /** Select a style (updates the picker, the engine and the host). */
  selectStyle: (styleId: string) => void
}

/**
 * Import a `.csl` style file (issue #251). This is a library capability, not a
 * host port: the browser reads the file, `parseCslStyle` derives the metadata,
 * and the engine registers it for this session. The host only hears
 * `citation-style-imported` so it can persist the XML and re-supply it through
 * `CitationPort.styles`.
 */
export function useCitationStyleImport(options: UseCitationStyleImportOptions) {
  const { t, emit, getEngine, refreshStyles, selectStyle } = options

  const styleImportMessage = ref('')

  const handleStyleImport = (payload: { text: string; filename?: string }) => {
    styleImportMessage.value = ''
    // `.bst` (BibTeX) and `.ens` (EndNote) are not CSL — citeproc cannot render
    // them directly. Fail loudly with a next step instead of silently ignoring.
    if (/\.(bst|ens)$/i.test(payload.filename ?? '')) {
      styleImportMessage.value = t('sidebars.references.styleImport.unsupported')
      return
    }
    try {
      const info = parseCslStyle(payload.text)
      const engine = getEngine()
      if (!engine?.registerStyle) {
        styleImportMessage.value = t('sidebars.references.styleImport.unavailable')
        return
      }
      const registered = engine.registerStyle(info)
      refreshStyles()
      // The user just imported it — select it so the effect is visible at once.
      selectStyle(registered.id)
      emit('citation-style-imported', registered)
      styleImportMessage.value = t('sidebars.references.styleImport.success')
        .replace('{name}', registered.name)
    } catch (err) {
      console.error('Failed to import citation style:', err)
      styleImportMessage.value = t('sidebars.references.styleImport.invalid')
    }
  }

  return { styleImportMessage, handleStyleImport }
}
