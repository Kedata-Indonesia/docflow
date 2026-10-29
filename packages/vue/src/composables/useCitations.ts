import { computed, ref, watch } from 'vue'
import type { CitationPort, CslItemData } from '@kedata-indonesia/docflow-core'
import { DEFAULT_CSL_STYLE } from '@kedata-indonesia/docflow-plugins'
import { useCitationImporters } from './citationImporters.js'
import { useCitationStyleImport } from './citationStyleImport.js'
import {
  BUNDLED_STYLE_IDS,
  bundledStyleOptions,
  type CitationEngineLike,
  type CitationStyleOption,
  type UseCitationsOptions,
} from './citationTypes.js'

export {
  BUNDLED_REFERENCE_STYLES,
  type CitationStyleOption,
  type CitationsEmit,
  type UseCitationsOptions,
} from './citationTypes.js'

/**
 * Reference library + CSL citation state (Phase 6B/6C). The host seeds the
 * library through the CitationPort; the editor then owns a live copy so sidebar
 * CRUD re-renders citations immediately. Hosts that persist listen to
 * `citation-sources-change`.
 *
 * This is the composition root: picker state and CRUD live here, DOI/format
 * importers in `./citationImporters` and `.csl` import in `./citationStyleImport`.
 */
export function useCitations(options: UseCitationsOptions) {
  const { getEditor, getPluginActions, getCitation, emit, t, activeSidebar } = options

  const citationSources = ref<CslItemData[]>(
    (() => {
      const s = getCitation()?.sources
      if (Array.isArray(s)) return [...s]
      if (typeof s === 'function') return [...s()]
      return []
    })(),
  )
  const citationStyleId = ref(getCitation()?.style || 'chicago-notes-bibliography')

  // Pending source pick (toolbar Citation → the references sidebar acts as the
  // picker). Resolved with a sourceId by the sidebar's Cite button, or with
  // null when the sidebar is closed without picking.
  let pendingSourceResolve: ((id: string | null) => void) | null = null
  const pendingSourceRequest = ref(false)

  const resolvePendingSource = (id: string | null) => {
    pendingSourceResolve?.(id)
    pendingSourceResolve = null
    pendingSourceRequest.value = false
  }

  const defaultSourceRequest = (): Promise<string | null> =>
    new Promise((resolve) => {
      resolvePendingSource(null)
      pendingSourceResolve = resolve
      pendingSourceRequest.value = true
      activeSidebar.value = 'references'
    })

  // The port handed to the editor: live source getter (sidebar CRUD is always
  // reflected) + the sidebar picker as the default onSourceRequest when the
  // host does not provide its own.
  const citationPort = computed<CitationPort | undefined>(() => {
    const port = getCitation()
    if (!port) return undefined
    return {
      ...port,
      sources: () => citationSources.value,
      onSourceRequest: port.onSourceRequest ?? defaultSourceRequest,
    }
  })

  // ─── Reference library CRUD + style switching (Phase 6B-3) ─────────────────

  const getCitationEngineLike = (): CitationEngineLike | null =>
    (((getEditor()?.storage as unknown as Record<string, unknown> | undefined)?.citationEngine) as
      | { engine?: CitationEngineLike | null }
      | undefined)?.engine ?? null

  /**
   * Styles the picker offers (issue #180): the engine's registry — bundled
   * styles plus whatever the host injected through `CitationPort.styles` — so an
   * institutional/Harvard style appears without editing the library. Before the
   * engine exists (it mounts with the editor, after the first render) this is
   * the bundled four.
   *
   * A `watch` rather than a `computed` on purpose: the engine is not reactive,
   * so the list is refreshed on the events that actually change it — the sidebar
   * opening, and the live source list being synced into the engine. Deliberately
   * not `immediate`: at setup time the editor (and therefore the engine) does
   * not exist yet, and the fallback is already the right answer then.
   */
  const citationStyles = ref<CitationStyleOption[]>(bundledStyleOptions())
  const refreshCitationStyles = () => {
    const available = getCitationEngineLike()?.getAvailableStyles?.()
    citationStyles.value =
      available && available.length > 0
        ? // Anything that is not one of the bundled four was imported by the
          // user, so it is theirs to remove (issue #361).
          available.map(({ id, name }) => ({ id, name, removable: !BUNDLED_STYLE_IDS.has(id) }))
        : bundledStyleOptions()
  }
  watch([activeSidebar, citationSources], refreshCitationStyles)

  /** Push the live library into the engine (re-renders every citation) and let the host persist. */
  const syncCitationEngine = () => {
    getCitationEngineLike()?.updateSources(citationSources.value)
    emit('citation-sources-change', citationSources.value)
  }

  const handleSourceCreate = (source: CslItemData) => {
    citationSources.value = [...citationSources.value, source]
    syncCitationEngine()
  }

  const handleSourceUpdate = (source: CslItemData) => {
    citationSources.value = citationSources.value.map((s) => (s.id === source.id ? source : s))
    syncCitationEngine()
  }

  const handleSourceRemove = (id: string) => {
    citationSources.value = citationSources.value.filter((s) => s.id !== id)
    syncCitationEngine()
  }

  const handleCitationStyleChange = (styleId: string) => {
    citationStyleId.value = styleId
    getCitationEngineLike()?.setStyle(styleId)
    emit('update:citation-style', styleId)
  }

  /**
   * Issue #361 — drop an imported style. The engine refuses bundled ids itself,
   * so a stale button can never remove the offline fallback; when the removed
   * style was active the engine has already fallen back, and the picker plus
   * the host are told so the document does not keep naming it.
   */
  const handleStyleRemove = (styleId: string) => {
    const engine = getCitationEngineLike()
    if (!engine?.removeStyle) return
    const wasActive = citationStyleId.value === styleId
    if (!engine.removeStyle(styleId)) return

    refreshCitationStyles()
    if (wasActive) handleCitationStyleChange(DEFAULT_CSL_STYLE)
    emit('citation-style-removed', styleId)
  }

  const handleReferenceInsert = (sourceId: string) => {
    if (pendingSourceResolve) {
      // Picker flow: the citation command performs the insertion on resolve.
      resolvePendingSource(sourceId)
      activeSidebar.value = null
    } else {
      getPluginActions().insertCitation?.({ sourceId })
    }
  }

  // Closing the references sidebar mid-pick cancels the pending citation insert.
  watch(activeSidebar, (key, prev) => {
    if (prev === 'references' && key !== 'references') resolvePendingSource(null)
  })

  // ─── Host-port importers + `.csl` style import ─────────────────────────────

  const { importBusy, importMessage, canImportSources, handleImportDoi, handleImportBibliography } =
    useCitationImporters({ sources: citationSources, getCitation, syncEngine: syncCitationEngine, t })

  const { styleImportMessage, handleStyleImport } = useCitationStyleImport({
    t,
    emit,
    getEngine: getCitationEngineLike,
    refreshStyles: refreshCitationStyles,
    selectStyle: handleCitationStyleChange,
  })

  return {
    citationSources,
    citationStyleId,
    citationStyles,
    pendingSourceRequest,
    citationPort,
    handleSourceCreate,
    handleSourceUpdate,
    handleSourceRemove,
    handleCitationStyleChange,
    handleStyleRemove,
    handleReferenceInsert,
    importBusy,
    importMessage,
    canImportSources,
    handleImportDoi,
    handleImportBibliography,
    styleImportMessage,
    handleStyleImport,
  }
}
