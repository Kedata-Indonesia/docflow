import { computed, ref, watch, type Ref } from 'vue'
import type {
  BibliographyFormat,
  CitationPort,
  CslItemData,
  CslStyleInfo,
  DocsEditor,
} from '@kedata-indonesia/docflow-core'
import { parseCslStyle } from '@kedata-indonesia/docflow-plugins'
import type { SidebarKey } from '../types.js'
import type { LocaleContext } from './useLocale.js'

interface CitationEngineLike {
  updateSources: (sources: CslItemData[]) => void
  setStyle: (styleId: string) => void
  /**
   * Styles this engine can render with — bundled + host-injected (issue #180).
   * Optional: older/minimal engines only need the two methods above.
   */
  getAvailableStyles?: () => { id: string; name: string }[]
  /**
   * Register a style at runtime (issue #251, the `.csl` import path). Optional:
   * minimal/older engines can still render, they just cannot import files.
   */
  registerStyle?: (style: CslStyleInfo) => CslStyleInfo
}

/**
 * The four styles the library bundles. Used as the picker's fallback before an
 * engine exists; once one does, the list comes from `getAvailableStyles()` so a
 * host-injected style shows up without touching the library (issue #180).
 */
export const BUNDLED_REFERENCE_STYLES: { id: string; name: string }[] = [
  { id: 'chicago-notes-bibliography', name: 'Chicago (notes & bibliography)' },
  { id: 'chicago-author-date', name: 'Chicago (author-date)' },
  { id: 'apa', name: 'APA' },
  { id: 'modern-language-association', name: 'MLA' },
]

/** Events emitted by the citation surface. */
export interface CitationsEmit {
  (event: 'citation-sources-change', sources: CslItemData[]): void
  (event: 'update:citation-style', style: string): void
  /** Issue #251 — a `.csl` file was imported; hosts persist + re-supply `citation.styles`. */
  (event: 'citation-style-imported', style: CslStyleInfo): void
}

export interface UseCitationsOptions {
  /** The editor is created after this composable; read it lazily. */
  getEditor: () => DocsEditor['editor'] | null
  /** Plugin actions are read lazily for the fallback citation insert. */
  getPluginActions: () => DocsEditor['pluginActions']
  /** The host citation port is read lazily so the port stays current. */
  getCitation: () => CitationPort | undefined
  emit: CitationsEmit
  t: LocaleContext['t']
  activeSidebar: Ref<SidebarKey | null>
}

/**
 * Reference library + CSL citation state (Phase 6B/6C). The host seeds the
 * library through the CitationPort; the editor then owns a live copy so sidebar
 * CRUD re-renders citations immediately. Hosts that persist listen to
 * `citation-sources-change`.
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
  const citationStyles = ref<{ id: string; name: string }[]>(BUNDLED_REFERENCE_STYLES)
  const refreshCitationStyles = () => {
    const available = getCitationEngineLike()?.getAvailableStyles?.()
    citationStyles.value =
      available && available.length > 0
        ? available.map(({ id, name }) => ({ id, name }))
        : BUNDLED_REFERENCE_STYLES
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

  // ─── Importers (Phase 6C) ────────────────────────────────────────────────────
  // The library never calls CrossRef or parses files itself — the host's import
  // ports (CitationPort.onImportDoi / onImportBibliography) do that and return
  // persisted sources; we just merge them into the live list and re-render.

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
      const exists = citationSources.value.some((s) => s.id === source.id)
      citationSources.value = exists
        ? citationSources.value.map((s) => (s.id === source.id ? source : s))
        : [...citationSources.value, source]
      syncCitationEngine()
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
        const byId = new Map(citationSources.value.map((s) => [s.id, s]))
        for (const s of imported) byId.set(s.id, s)
        citationSources.value = [...byId.values()]
        syncCitationEngine()
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

  // ─── Import a CSL style file (issue #251) ───────────────────────────────────
  // This one is a library capability, not a host port: the browser reads the
  // `.csl` file, `parseCslStyle` derives the metadata, and the engine registers
  // it for this session. The host only hears `citation-style-imported` so it
  // can persist the XML and re-supply it through `CitationPort.styles`.

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
      const engine = getCitationEngineLike()
      if (!engine?.registerStyle) {
        styleImportMessage.value = t('sidebars.references.styleImport.unavailable')
        return
      }
      const registered = engine.registerStyle(info)
      refreshCitationStyles()
      // The user just imported it — select it so the effect is visible at once.
      handleCitationStyleChange(registered.id)
      emit('citation-style-imported', registered)
      styleImportMessage.value = t('sidebars.references.styleImport.success')
        .replace('{name}', registered.name)
    } catch (err) {
      console.error('Failed to import citation style:', err)
      styleImportMessage.value = t('sidebars.references.styleImport.invalid')
    }
  }

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
