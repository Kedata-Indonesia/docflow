import { computed, ref, type Ref } from 'vue'
import type { BibliographyFormat, CitationPort, CslItemData } from '@kedata-indonesia/docflow-core'
import type { LocaleContext } from './useLocale.js'

export interface UseCitationImportersOptions {
  /** The live library; importers merge into it and then re-render citations. */
  sources: Ref<CslItemData[]>
  getCitation: () => CitationPort | undefined
  /** Push the library into the engine and let the host persist it. */
  syncEngine: () => void
  t: LocaleContext['t']
}

/**
 * Host-port importers (Phase 6C). The library never calls CrossRef or parses
 * files itself — `CitationPort.onImportDoi` / `onImportBibliography` do that and
 * return persisted sources; this only merges them and reports the outcome.
 */
export function useCitationImporters(options: UseCitationImportersOptions) {
  const { sources, getCitation, syncEngine, t } = options

  const importBusy = ref(false)
  const importMessage = ref('')
  const canImportSources = computed(() =>
    Boolean(getCitation()?.onImportDoi || getCitation()?.onImportBibliography),
  )

  const handleImportDoi = async (doi: string) => {
    const port = getCitation()
    if (!port?.onImportDoi || importBusy.value) return
    importBusy.value = true
    importMessage.value = ''
    try {
      const source = await port.onImportDoi(doi)
      if (!source) {
        importMessage.value = t('sidebars.references.import.doiFailed')
        return
      }
      const exists = sources.value.some((s) => s.id === source.id)
      sources.value = exists
        ? sources.value.map((s) => (s.id === source.id ? source : s))
        : [...sources.value, source]
      syncEngine()
      importMessage.value = t('sidebars.references.import.doiSuccess')
    } catch {
      importMessage.value = t('sidebars.references.import.doiFailed')
    } finally {
      importBusy.value = false
    }
  }

  const handleImportBibliography = async (payload: { format: BibliographyFormat; text: string }) => {
    const port = getCitation()
    if (!port?.onImportBibliography || importBusy.value) return
    importBusy.value = true
    importMessage.value = ''
    try {
      const { imported, failed } = await port.onImportBibliography(payload)
      if (imported.length > 0) {
        const byId = new Map(sources.value.map((s) => [s.id, s]))
        for (const s of imported) byId.set(s.id, s)
        sources.value = [...byId.values()]
        syncEngine()
      }
      importMessage.value =
        failed > 0
          ? t('sidebars.references.import.partial')
              .replace('{ok}', String(imported.length))
              .replace('{failed}', String(failed))
          : t('sidebars.references.import.batchSuccess').replace('{count}', String(imported.length))
    } catch {
      importMessage.value = t('sidebars.references.import.failed')
    } finally {
      importBusy.value = false
    }
  }

  return {
    importBusy,
    importMessage,
    canImportSources,
    handleImportDoi,
    handleImportBibliography,
  }
}
