<script setup lang="ts">
import { type DocsEditor, type DocsEditorPlugin, type EditorOptions, type ImageUploadHandler, type CitationPort, type CslItemData, type AIStreamFn, type AIDraftFn } from '@kedata-indonesia/docflow-core'
import { PAGE_SIZES, getPageSize } from '@kedata-indonesia/docflow-layout-engine'
import { useVirtualPages } from '../composables/useVirtualPages.js'
import VirtualPageOverlay from './VirtualPageOverlay.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEditor } from '../composables/useEditor.js'
import SlashMenuVue from './SlashMenu.vue'
import type { Collaborator, CommentItem, ConnectionState, DocumentMeta, DocumentSnapshot, SavingStatus, SidebarKey } from '../types.js'
import HeaderBar from './HeaderBar.vue'
import EditorToolbar from './EditorToolbar.vue'
import BubbleMenu from './BubbleMenu.vue'
import StatusBar from './StatusBar.vue'
import RulerBar from './RulerBar.vue'
import VerticalRuler from './VerticalRuler.vue'
import TOCSidebar from './sidebars/TOCSidebar.vue'
import ReferencesSidebar from './sidebars/ReferencesSidebar.vue'
import AISidebar from './sidebars/AISidebar.vue'
import CommentsSidebar from './sidebars/CommentsSidebar.vue'
import HistorySidebar from './sidebars/HistorySidebar.vue'
import DetailsDialog from './DetailsDialog.vue'
import EmailDialog from './EmailDialog.vue'
import FindReplaceDialog from './FindReplaceDialog.vue'
import LinkDialog from './LinkDialog.vue'
import { Menu, Minimize2 } from 'lucide-vue-next'
import { useTheme } from '../composables/useTheme.js'
import { provideLocale, type Locale } from '../composables/useLocale.js'
import { writeClipboard, readClipboardHtml, readClipboardText } from '../composables/useClipboard.js'
import { DOMSerializer } from 'prosemirror-model'
import { sanitizePastedHTML } from '@kedata-indonesia/docflow-core'

const props = withDefaults(
  defineProps<{
    modelValue?: object | string
    plugins?: DocsEditorPlugin[]
    editable?: boolean
    collaboration?: NonNullable<EditorOptions['collaboration']>
    pageSize?: string
    pageless?: boolean
    /**
     * Enable virtual page overlay (experimental).
     * When true, only visible pages are rendered in DOM instead of all pages.
     * Uses PageLayout for measurement + viewport-based visibility tracking.
     */
    virtualPages?: boolean
    title?: string
    collaborators?: Collaborator[]
    starred?: boolean
    connectionState?: ConnectionState
    userName?: string
    userAvatar?: string
    locale?: Locale
    documentMeta?: DocumentMeta
    shareUrl?: string
    onImageUpload?: ImageUploadHandler
    citation?: CitationPort
    aiStream?: AIStreamFn
    aiDraft?: AIDraftFn
    // Phase 9 P9-4 — comment threads. The library stays free of REST;
    // the host feeds the threads + handles the events.
    comments?: CommentItem[]
    /** Currently-selected text snippet. */
    selectedTextSnippet?: string
    /** Currently-selected start position (Phase 9 P9-4 anchor). */
    selectedTextIndex?: number
    // Phase 9 — version history. The host feeds the version list +
    // handles save/restore/preview events (it owns the REST surface).
    snapshots?: DocumentSnapshot[]
    activePreviewIndex?: number | null
  }>(),
  {
    editable: true,
    modelValue: undefined,
    plugins: () => [],
    collaboration: undefined,
    pageSize: 'a4',
    pageless: false,
    virtualPages: false,
    title: 'Untitled Document',
    collaborators: () => [],
    starred: false,
    connectionState: 'connected',
    userName: '',
    userAvatar: '',
    locale: undefined,
    documentMeta: undefined,
    shareUrl: '',
    onImageUpload: undefined,
    citation: undefined,
    aiStream: undefined,
    aiDraft: undefined,
    comments: () => [],
    selectedTextSnippet: '',
    selectedTextIndex: undefined,
    snapshots: () => [],
    activePreviewIndex: null,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: object]
  'update:title': [title: string]
  'update:pageSize': [pageSize: string]
  'update:pageless': [pageless: boolean]
  'update:pageCount': [pageCount: number]
  'update:locale': [locale: Locale]
  'citation-sources-change': [sources: CslItemData[]]
  'update:citation-style': [style: string]
  'toggle-star': []
  back: []
  share: []
  'menu-click': [menu: string]
  export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']
  ready: [docsEditor: DocsEditor]
  // Phase 9 P9-4 — comment-thread events. The host owns the REST
  // surface; the editor just re-emits what the CommentsSidebar
  // collects from the user.
  'add-comment': [content: string, anchorText?: string, anchorIndex?: number]
  'add-reply': [threadId: string, content: string]
  'resolve-comment': [threadId: string]
  // Phase 9 — version-history events. The host owns the REST surface;
  // the editor just re-emits what the HistorySidebar collects.
  'save-snapshot': [name: string]
  'restore-snapshot': [versionIndex: number]
  'preview-snapshot': [snapshot: DocumentSnapshot | null]
}>()

// Provide locale context for all editor chrome components.
const { locale: currentLocale, setLocale, t } = provideLocale(props.locale)

watch(
  () => props.locale,
  (next) => {
    if (next && next !== currentLocale.value) {
      setLocale(next)
    }
  },
)

watch(currentLocale, (next) => {
  emit('update:locale', next)
})

// ─── Page Size ────────────────────────────────────────────────────────────────

const margins = ref({ top: 72, bottom: 72, left: 90, right: 90 })
const orientation = ref<'portrait' | 'landscape'>('portrait')

const pageSizeId = ref(props.pageSize ?? 'a4')
const isPageless = ref(props.pageless ?? false)

const resolvedLayoutOptions = computed(() => {
  const size = getPageSize(pageSizeId.value) ?? PAGE_SIZES[0]
  let w = size.pageWidth
  let h = size.pageHeight
  if (orientation.value === 'landscape') {
    ;[w, h] = [h, w]
  }
  return { pageHeight: h, pageWidth: w, margins: { ...margins.value } }
})

const { isDark } = useTheme()

// Experimental: virtual page overlay flag. Must be defined early — referenced
// by paginationOptions computed (below) to disable PaginationPlus when active.
const useVirtual = computed(() => props.virtualPages === true)

const paginationOptions = computed(() => ({
  enabled: !isPageless.value && !useVirtual.value,
  pageHeight: resolvedLayoutOptions.value.pageHeight,
  pageWidth: resolvedLayoutOptions.value.pageWidth,
  marginTop: resolvedLayoutOptions.value.margins.top,
  marginBottom: resolvedLayoutOptions.value.margins.bottom,
  marginLeft: resolvedLayoutOptions.value.margins.left,
  marginRight: resolvedLayoutOptions.value.margins.right,
  contentMarginTop: 10,
  contentMarginBottom: 10,
  pageGap: 40,
  pageBreakBackground: isDark.value ? '#02040a' : '#f1f5f9',
  headerLeft: '',
  headerRight: '',
  footerLeft: '',
  footerRight: '',
  onHeaderClick: (params?: { event?: MouseEvent; pageNumber?: number }) => {
    startInlineHeaderEdit(params?.event)
  },
  onFooterClick: (params?: { event?: MouseEvent; pageNumber?: number }) => {
    if (params?.event && params.event.detail !== 2) return
    openFooterModal()
  },
}))

// ─── Editor ───────────────────────────────────────────────────────────────────

interface TabItem { id: string; label: string; content: object }
interface TabbedDoc {
  type: 'tabbed-doc'
  activeTabId: string
  tabs: TabItem[]
  headerLeft?: string
  headerRight?: string
  footerLeft?: string
  footerRight?: string
}

const parseModelValue = (val: unknown): TabbedDoc => {
  const obj = val as Record<string, unknown> | null
  if (obj && typeof obj === 'object' && obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) return obj as unknown as TabbedDoc
  return { type: 'tabbed-doc', activeTabId: 'tab-1', tabs: [{ id: 'tab-1', label: 'Tab 1', content: val || { type: 'doc', content: [{ type: 'paragraph' }] } }] }
}

const initialDoc = parseModelValue(props.modelValue)
const userHeaderLeft = ref(initialDoc.headerLeft || '')
const userHeaderRight = ref(initialDoc.headerRight || '')
const userFooterLeft = ref(initialDoc.footerLeft || '')
const userFooterRight = ref(initialDoc.footerRight || '')

const tabs = ref<Array<{ id: string; label: string; active: boolean }>>(initialDoc.tabs.map(t => ({ id: t.id, label: t.label, active: t.id === initialDoc.activeTabId })))
const tabContents = ref<Record<string, object>>({})
initialDoc.tabs.forEach(t => { tabContents.value[t.id] = t.content })
const activeTabId = ref(initialDoc.activeTabId)
const activeTabContent = computed(() => tabContents.value[activeTabId.value])

const showBubbleMenu = ref(false)
const bubblePosition = ref<{ top: number; left: number } | null>(null)
const activeSidebar = ref<SidebarKey | null>(null)
// View menu toggles — ruler visibility persists across sessions, focus mode does not.
const showRuler = ref(localStorage.getItem('docflow:view:showRuler') !== 'false')
const focusMode = ref(false)
watch(showRuler, (next) => {
  localStorage.setItem('docflow:view:showRuler', next ? 'true' : 'false')
})
const wordCount = ref(0)
const charCount = ref(0)
const savingStatus = ref<SavingStatus>('saved')
const lastSaved = ref(Date.now())
const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// Collect slash commands from all plugins
const slashCommands = computed(() => {
  const cmds: Array<{ name: string; command: string }> = []
  for (const plugin of props.plugins) {
    for (const sc of plugin.slashCommands || []) {
      cmds.push({ name: sc.name, command: sc.command })
    }
  }
  return cmds
})

// Build the full tabbed document from current state and emit it to the host.
// Persistence is the host's job (via update:modelValue / onUpdate) — the
// library deliberately performs no storage writes (LIBRARY_CONTRACT rule 5).
const persistCurrentDoc = () => {
  const fullDoc: TabbedDoc = {
    type: 'tabbed-doc',
    activeTabId: activeTabId.value,
    tabs: tabs.value.map(t => ({ id: t.id, label: t.label, content: tabContents.value[t.id] })),
    headerLeft: userHeaderLeft.value,
    headerRight: userHeaderRight.value,
    footerLeft: userFooterLeft.value,
    footerRight: userFooterRight.value,
  }
  emit('update:modelValue', fullDoc)
  savingStatus.value = 'saving'
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(() => { savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)
}

// ─── References / citations (Phase 6B) ────────────────────────────────────────

// The host seeds the reference library through the CitationPort; the editor
// then owns a live copy so sidebar CRUD re-renders citations immediately.
// Hosts that persist (apps/web) listen to `citation-sources-change`.
const citationSources = ref<CslItemData[]>(
  (() => {
    const s = props.citation?.sources
    if (Array.isArray(s)) return [...s]
    if (typeof s === 'function') return [...s()]
    return []
  })(),
)
const citationStyleId = ref(props.citation?.style || 'chicago-notes-bibliography')

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
  const port = props.citation
  if (!port) return undefined
  return {
    ...port,
    sources: () => citationSources.value,
    onSourceRequest: port.onSourceRequest ?? defaultSourceRequest,
  }
})

const { editorRef, editor, pluginActions, isReady, docsEditor: docEditor } = useEditor({
  content: activeTabContent,
  plugins: props.plugins,
  editable: props.editable,
  collaboration: props.collaboration,
  onImageUpload: props.onImageUpload,
citation: citationPort.value,
    aiStream: props.aiStream,
    aiDraft: props.aiDraft,
  getPageMap: () => new Map(),
  paginationOptions: paginationOptions.value,
  onUpdate: (json) => {
    tabContents.value[activeTabId.value] = json
    persistCurrentDoc()
  },
})

// ─── Reference library CRUD + style switching (Phase 6B-3) ─────────────────

interface CitationEngineLike {
  updateSources: (sources: CslItemData[]) => void
  setStyle: (styleId: string) => void
}

const getCitationEngineLike = (): CitationEngineLike | null =>
  (((editor.value?.storage as Record<string, unknown> | undefined)?.citation) as
    | { engine?: CitationEngineLike | null }
    | undefined)?.engine ?? null

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
    pluginActions.value.insertCitation?.({ sourceId })
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
  Boolean(props.citation?.onImportDoi || props.citation?.onImportBibliography),
)

const handleImportDoi = async (doi: string) => {
  const port = props.citation
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

const handleImportBibliography = async (payload: { format: 'bibtex' | 'ris'; text: string }) => {
  const port = props.citation
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

const updateCounts = () => {
  const text = editor.value?.getText() ?? ''
  charCount.value = text.length
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0
}

const computeBubblePosition = (): { top: number; left: number } | null => {
  if (!editor.value) return null
  const { from, to } = editor.value.state.selection
  if (from === to) return null
  const coords = editor.value.view.coordsAtPos(from)
  if (!coords) return null
  return { top: coords.top - 48, left: coords.left + (coords.right - coords.left) / 2 }
}

const updateBubbleMenu = () => {
  if (!editor.value) { showBubbleMenu.value = false; bubblePosition.value = null; return }
  const { from, to } = editor.value.state.selection
  showBubbleMenu.value = from !== to
  bubblePosition.value = from !== to ? computeBubblePosition() : null
}

const scrollContainerRef = ref<HTMLDivElement | null>(null)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const handleScroll = () => {
  if (!editor.value) return
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    if (editor.value) {
      editor.value.view.dispatch(editor.value.state.tr)
    }
  }, 150)
}

const pageCount = ref(1)
const currentPage = ref(1)

// ─── Virtual Pages (experimental) ──────────────────────────────────────────

const virtualConfig = computed(() => {
  const lo = resolvedLayoutOptions.value
  return {
    pageSize: { id: pageSizeId.value, name: pageSizeId.value.toUpperCase(), pageWidth: lo.pageWidth, pageHeight: lo.pageHeight },
    margins: { top: lo.margins.top, bottom: lo.margins.bottom, left: lo.margins.left, right: lo.margins.right },
    pageGap: 40,
    headerLeft: userHeaderLeft.value,
    headerRight: userHeaderRight.value,
    footerLeft: userFooterLeft.value,
    footerRight: userFooterRight.value,
  }
})

const {
  data: virtualData,
  totalPages: virtualTotalPages,
  isReady: virtualReady,
  refreshData: refreshVirtual,
} = useVirtualPages({
  editorRef: computed(() => editor.value as { view: { dom: HTMLElement } } | null),
  scrollRef: scrollContainerRef,
  config: virtualConfig.value,
  bufferPages: 2,
})

watch([virtualTotalPages, virtualReady], () => {
  if (useVirtual.value && virtualReady.value) {
    pageCount.value = virtualTotalPages.value
  }
})

watch(useVirtual, (enabled) => {
  if (enabled) {
    // When virtual pages toggle on, re-measure
    refreshVirtual()
  }
})

const updatePageStats = () => {
  if (!editor.value || !isReady.value) {
    pageCount.value = 1
    currentPage.value = 1
    return
  }

  const editorDom = editor.value.view.dom
  const paginationElement = editorDom.querySelector("[data-rm-pagination]")
  if (paginationElement) {
    pageCount.value = paginationElement.children.length || 1
  } else {
    pageCount.value = 1
  }

  try {
    const { selection } = editor.value.state
    const coords = editor.value.view.coordsAtPos(selection.head)
    if (coords && paginationElement) {
      const pageBreaks = Array.from(paginationElement.querySelectorAll(".rm-page-break"))
      const editorRect = editorDom.getBoundingClientRect()
      const selectionTopRelativeToEditor = coords.top - editorRect.top + editorDom.scrollTop

      let pageIndex = 1
      let found = false
      for (let i = 0; i < pageBreaks.length; i++) {
        const breaker = pageBreaks[i].querySelector(".breaker")
        if (breaker instanceof HTMLElement) {
          if (selectionTopRelativeToEditor < breaker.offsetTop) {
            currentPage.value = pageIndex
            found = true
            break
          }
        }
        pageIndex++
      }
      if (!found) {
        currentPage.value = pageIndex
      }
    } else {
      currentPage.value = 1
    }
  } catch {
    currentPage.value = 1
  }
}

watch(resolvedLayoutOptions, (newOptions) => {
  if (!editor.value) return
  
  editor.value.commands.updatePageHeight(newOptions.pageHeight)
  editor.value.commands.updatePageWidth(newOptions.pageWidth)
  editor.value.commands.updateMargins({
    top: newOptions.margins.top,
    bottom: newOptions.margins.bottom,
    left: newOptions.margins.left,
    right: newOptions.margins.right,
  })
  
  updatePageStats()
})

/**
 * Switch between paginated (paper) and pageless (continuous) layout.
 * Pageless is view state, not document content: we only flip the pagination
 * extension's runtime `enabled` flag — the ProseMirror document is never
 * touched, so switching back and forth preserves content exactly and is
 * safe in collaborative sessions (nothing flows into Yjs).
 */
const applyPageless = (next: boolean) => {
  if (next === isPageless.value) return
  isPageless.value = next
  emit('update:pageless', next)
  if (!editor.value) return
  if (next) {
    editor.value.commands.disablePagination()
  } else {
    editor.value.commands.enablePagination()
  }
  // Page-break decorations are rebuilt asynchronously by the pagination
  // plugin's view hook — refresh derived stats and footnotes after the
  // DOM settles.
  setTimeout(() => {
    updatePageStats()
    updateFootnotes()
  }, 60)
}

watch(
  () => props.pageless,
  (next) => applyPageless(next ?? false),
)

// Header & footer refs are defined above to support initialization from props

const isDifferentFirstPage = ref(false)
const isDifferentOddEven = ref(false)
const userFirstPageHeaderLeft = ref('')
const userFirstPageHeaderRight = ref('')
const userEvenPageHeaderLeft = ref('')
const userEvenPageHeaderRight = ref('')

const headerMarginCm = ref(1.27)
const footerMarginCm = ref(1.27)

const showHeaderFormatModal = ref(false)
const draftHeaderMarginCm = ref(1.27)
const draftFooterMarginCm = ref(1.27)
const draftDifferentFirstPage = ref(false)
const draftDifferentOddEven = ref(false)

const showPageNumberModal = ref(false)
const pageNumberPosition = ref<'header' | 'footer'>('header')
const showPageNumberOnFirstPage = ref(true)
const pageNumberMode = ref<'startAt' | 'continue'>('startAt')
const pageNumberStartAt = ref(1)

const draftPageNumberPosition = ref<'header' | 'footer'>('header')
const draftShowPageNumberOnFirstPage = ref(true)
const draftPageNumberMode = ref<'startAt' | 'continue'>('startAt')
const draftPageNumberStartAt = ref(1)

const getResolvedPageNumber = (pageIndex: number) => {
  if (!showPageNumberOnFirstPage.value && pageIndex === 0) return ''
  let num = pageIndex + 1
  if (pageNumberMode.value === 'startAt') {
    num = pageIndex + pageNumberStartAt.value
  }
  return String(num)
}

const applyHeaderFooter = () => {
  if (!editor.value || !isReady.value) return
  const totalStr = String(pageCount.value)

  const defaultHLeft = userHeaderLeft.value.replace(/{total}/g, totalStr)
  const defaultHRight = userHeaderRight.value.replace(/{total}/g, totalStr)
  const defaultFLeft = userFooterLeft.value.replace(/{total}/g, totalStr)
  const defaultFRight = userFooterRight.value.replace(/{total}/g, totalStr)
  
  editor.value.commands.updateHeaderContent(defaultHLeft, defaultHRight)
  editor.value.commands.updateFooterContent(defaultFLeft, defaultFRight)

  // Dispatch an empty transaction so PaginationPlus's apply() detects the
  // storage change (headerLeft !== appliedConfig.headerLeft, etc.) and
  // rebuilds its widget decorations with the new content.
  editor.value.view.dispatch(editor.value.state.tr)

  // Wait for the decoration rebuild to settle before applying per-page
  // customizations (Different First Page, Odd/Even, Page Numbers, margins).
  // Use rAF inside setTimeout so DOM updates from the decoration rebuild
  // have been painted before we read/modify elements.
  setTimeout(() => {
    requestAnimationFrame(() => {
      if (!editor.value) return
      // Apply Header/Footer Margins
      const headerMarginPx = `${headerMarginCm.value * 37.795}px`
      const footerMarginPx = `${footerMarginCm.value * 37.795}px`
      document.documentElement.style.setProperty('--rm-header-margin-top', headerMarginPx)
      document.documentElement.style.setProperty('--rm-footer-margin-bottom', footerMarginPx)
      const editorEl = document.querySelector('.rm-with-pagination') as HTMLElement
      if (editorEl) {
        editorEl.style.setProperty('--rm-header-margin-top', headerMarginPx)
        editorEl.style.setProperty('--rm-footer-margin-bottom', footerMarginPx)
      }

      // Process each page element for Different First Page, Different Odd/Even, & Page Numbers
      const pageContainers = Array.from(document.querySelectorAll('.rm-with-pagination .page, .rm-with-pagination .rm-page, .rm-page-break'))
      
      if (pageContainers.length > 0) {
        pageContainers.forEach((pageEl, idx) => {
          const headerEl = pageEl.querySelector('.rm-page-header')
          const footerEl = pageEl.querySelector('.rm-page-footer')
          const isFirst = idx === 0
          const isEven = (idx + 1) % 2 === 0
          const pageNum = getResolvedPageNumber(idx)

          if (headerEl) {
            (headerEl as HTMLElement).style.marginTop = headerMarginPx
            const leftEl = headerEl.querySelector('.rm-page-header-left') as HTMLElement
            const rightEl = headerEl.querySelector('.rm-page-header-right') as HTMLElement

            let targetLeft = defaultHLeft
            let targetRight = defaultHRight

            if (isDifferentFirstPage.value && isFirst) {
              targetLeft = userFirstPageHeaderLeft.value.replace(/{total}/g, totalStr)
              targetRight = userFirstPageHeaderRight.value.replace(/{total}/g, totalStr)
            } else if (isDifferentOddEven.value && isEven) {
              targetLeft = userEvenPageHeaderLeft.value.replace(/{total}/g, totalStr)
              targetRight = userEvenPageHeaderRight.value.replace(/{total}/g, totalStr)
            }

            if (leftEl) leftEl.innerHTML = targetLeft.replace(/{page}/g, pageNum)
            if (rightEl) rightEl.innerHTML = targetRight.replace(/{page}/g, pageNum)
          }

          if (footerEl) {
            (footerEl as HTMLElement).style.marginBottom = footerMarginPx
            const leftEl = footerEl.querySelector('.rm-page-footer-left') as HTMLElement
            const rightEl = footerEl.querySelector('.rm-page-footer-right') as HTMLElement

            if (leftEl) leftEl.innerHTML = defaultFLeft.replace(/{page}/g, pageNum)
            if (rightEl) rightEl.innerHTML = defaultFRight.replace(/{page}/g, pageNum)
          }
        })
      } else {
        const headerElements = document.querySelectorAll('.rm-page-header')
        const footerElements = document.querySelectorAll('.rm-page-footer')

        headerElements.forEach((headerEl, idx) => {
          (headerEl as HTMLElement).style.marginTop = headerMarginPx
          const isFirst = idx === 0
          const isEven = (idx + 1) % 2 === 0
          const pageNum = getResolvedPageNumber(idx)

          const leftEl = headerEl.querySelector('.rm-page-header-left') as HTMLElement
          const rightEl = headerEl.querySelector('.rm-page-header-right') as HTMLElement

          let targetLeft = defaultHLeft
          let targetRight = defaultHRight

          if (isDifferentFirstPage.value && isFirst) {
            targetLeft = userFirstPageHeaderLeft.value.replace(/{total}/g, totalStr)
            targetRight = userFirstPageHeaderRight.value.replace(/{total}/g, totalStr)
          } else if (isDifferentOddEven.value && isEven) {
            targetLeft = userEvenPageHeaderLeft.value.replace(/{total}/g, totalStr)
            targetRight = userEvenPageHeaderRight.value.replace(/{total}/g, totalStr)
          }

          if (leftEl) leftEl.innerHTML = targetLeft.replace(/{page}/g, pageNum)
          if (rightEl) rightEl.innerHTML = targetRight.replace(/{page}/g, pageNum)
        })

        footerElements.forEach((footerEl, idx) => {
          (footerEl as HTMLElement).style.marginBottom = footerMarginPx
          const pageNum = getResolvedPageNumber(idx)
          const leftEl = footerEl.querySelector('.rm-page-footer-left') as HTMLElement
          const rightEl = footerEl.querySelector('.rm-page-footer-right') as HTMLElement

          if (leftEl) leftEl.innerHTML = defaultFLeft.replace(/{page}/g, pageNum)
          if (rightEl) rightEl.innerHTML = defaultFRight.replace(/{page}/g, pageNum)
        })
      }
    })
  }, 50)
}

watch(isDifferentFirstPage, () => {
  applyHeaderFooter()
})

watch([isDifferentOddEven, headerMarginCm, footerMarginCm, pageNumberPosition, showPageNumberOnFirstPage, pageNumberMode, pageNumberStartAt], () => {
  applyHeaderFooter()
})

watch(pageCount, (next) => {
  applyHeaderFooter()
  emit('update:pageCount', next)
})

watch(isDark, (darkVal) => {
  if (editor.value) {
    editor.value.commands.updatePageBreakBackground(darkVal ? '#02040a' : '#f1f5f9')
    // Dispatch transaction to trigger decoration rebuild with new background
    editor.value.view.dispatch(editor.value.state.tr)
  }
})

// Reactively sync layout changes (margins, page size, orientation) to the
// PaginationPlus extension storage so decoration rebuilds use current values.
watch(paginationOptions, (opts) => {
  if (!editor.value || !isReady.value) return
  const storage = editor.value.storage.PaginationPlus
  if (!storage) return

  // Sync page dimensions & margins
  const changed =
    storage.pageHeight !== opts.pageHeight ||
    storage.pageWidth !== opts.pageWidth ||
    storage.marginTop !== opts.marginTop ||
    storage.marginBottom !== opts.marginBottom ||
    storage.marginLeft !== opts.marginLeft ||
    storage.marginRight !== opts.marginRight ||
    storage.pageGap !== opts.pageGap ||
    storage.contentMarginTop !== opts.contentMarginTop ||
    storage.contentMarginBottom !== opts.contentMarginBottom ||
    storage.pageBreakBackground !== opts.pageBreakBackground ||
    storage.enabled !== opts.enabled

  if (!changed) return

  storage.pageHeight = opts.pageHeight
  storage.pageWidth = opts.pageWidth
  storage.marginTop = opts.marginTop
  storage.marginBottom = opts.marginBottom
  storage.marginLeft = opts.marginLeft
  storage.marginRight = opts.marginRight
  storage.pageGap = opts.pageGap
  storage.contentMarginTop = opts.contentMarginTop
  storage.contentMarginBottom = opts.contentMarginBottom
  storage.pageBreakBackground = opts.pageBreakBackground
  storage.enabled = opts.enabled

  // Dispatch empty transaction to trigger decoration rebuild
  editor.value.view.dispatch(editor.value.state.tr)
}, { deep: true })



watch(isReady, (ready) => {
  if (ready && editor.value) {
    // Populate raw inputs from stored/loaded configuration if not already set by props
    if (!userHeaderLeft.value && !userHeaderRight.value && !userFooterLeft.value && !userFooterRight.value) {
      userHeaderLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerLeft || ''
      userHeaderRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerRight || ''
      userFooterLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
      userFooterRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
    }

    // Apply header & footer with correct page stats
    applyHeaderFooter()

    if (docEditor.value) {
      emit('ready', docEditor.value)
    }
    editor.value.on('selectionUpdate', () => {
      updateBubbleMenu()
      updatePageStats()
    })
    editor.value.on('transaction', () => {
      updatePageStats()
      updateCounts()
    })
    updateBubbleMenu()
    updateCounts()
    updatePageStats()
    setTimeout(() => editor.value?.commands.focus('start'), 50)

    // Run layout adjustments after intervals to support async collaboration content loads
    const intervals = [100, 300, 600, 1200, 2500]
    intervals.forEach((delay) => {
      setTimeout(() => {
        if (editor.value) {
          editor.value.view.dispatch(editor.value.state.tr)
        }
      }, delay)
    })

    // Register ⌘K to open the link dialog (Google Docs shortcut).
    editor.value.view.dom.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openLinkDialog()
      }
    })

    // Handle clicks on top margin / page header area to activate header inline editing
    editor.value.view.dom.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // Ignore clicks on options dropdown, active bar tools, or active editable header
      if (target.closest('.rm-google-docs-header-bar, .rm-options-dropdown, [contenteditable="true"]')) return

      // Direct click on header or its children
      const headerEl = target.closest<HTMLElement>('.rm-page-header, .rm-first-page-header')
      if (headerEl) {
        startInlineHeaderEdit(e)
        return
      }

      // Click on top margin boundary area of editor or page
      const pageWrap = target.closest<HTMLElement>('.rm-with-pagination, .rm-page-break, .page, .docs-editor-page')
      if (pageWrap) {
        const rect = pageWrap.getBoundingClientRect()
        const relativeY = e.clientY - rect.top
        const topMarginPx = headerMarginCm.value * 37.795
        if (relativeY >= 0 && relativeY <= Math.max(topMarginPx, 40) + 15) {
          let targetHeader: HTMLElement | null = null
          if (pageWrap.classList.contains('rm-page-break')) {
            targetHeader = pageWrap.querySelector<HTMLElement>('.rm-page-header')
          }
          if (!targetHeader) {
            targetHeader = document.querySelector<HTMLElement>('.rm-page-header, .rm-first-page-header')
          }
          if (targetHeader) {
            startInlineHeaderEdit(e)
          }
        }
      }
    })

    // Handle double clicks on bottom margin / footer area to open footer modal
    editor.value.view.dom.addEventListener('dblclick', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      const footerEl = target.closest<HTMLElement>('.rm-page-footer')
      if (footerEl) {
        openFooterModal()
        return
      }

      const pageWrap = target.closest<HTMLElement>('.rm-with-pagination, .rm-page-break, .page, .docs-editor-page')
      if (pageWrap) {
        const rect = pageWrap.getBoundingClientRect()
        const relativeY = rect.bottom - e.clientY
        const bottomMarginPx = footerMarginCm.value * 37.795
        if (relativeY >= 0 && relativeY <= Math.max(bottomMarginPx, 40) + 15) {
          openFooterModal()
        }
      }
    })
  }
})

watch(() => props.collaboration, () => {}, { deep: true })
onUnmounted(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (scrollTimeout) clearTimeout(scrollTimeout)
})

const showFooterModal = ref(false)
const footerLeftInput = ref('')
const footerRightInput = ref('')

const showPageSetupModal = ref(false)
const showDetailsModal = ref(false)
const showEmailModal = ref(false)
const showFindReplace = ref(false)
const showLinkDialog = ref(false)
const linkDialogInitialText = ref('')
const linkDialogInitialUrl = ref('')
const linkDialogIsEditing = ref(false)

function openLinkDialog() {
  if (!editor.value) return
  const { state } = editor.value
  const { from, to, empty } = state.selection
  const attrs = editor.value.getAttributes('link')

  if (attrs.href) {
    linkDialogIsEditing.value = true
    linkDialogInitialUrl.value = attrs.href
    if (!empty) {
      linkDialogInitialText.value = state.doc.textBetween(from, to, ' ')
    } else {
      linkDialogInitialText.value = ''
    }
  } else {
    linkDialogIsEditing.value = false
    linkDialogInitialUrl.value = 'https://'
    linkDialogInitialText.value = empty ? '' : state.doc.textBetween(from, to, ' ')
  }

  showLinkDialog.value = true
}

function applyLinkDialog(payload: { text: string; url: string }) {
  if (!editor.value) return
  const { state } = editor.value
  const { from, to, empty } = state.selection
  const displayText = payload.text.trim()

  const chain = editor.value.chain().focus() as unknown as {
    setLink: (attrs: { href: string; target: string }) => { run: () => boolean }
    unsetLink: () => { run: () => boolean }
    insertContentAt: (range: { from: number; to: number }, content: unknown) => { run: () => boolean }
    insertContent: (content: unknown) => { run: () => boolean }
  }

  if (linkDialogIsEditing.value || editor.value.isActive('link')) {
    // Update existing link
    chain.setLink({ href: payload.url, target: '_blank' }).run()
    if (displayText && !empty) {
      chain.insertContentAt({ from, to }, displayText).run()
    }
  } else if (displayText) {
    // Replace selection with linked text
    chain.insertContentAt({ from, to }, {
      type: 'text',
      text: displayText,
      marks: [{ type: 'link', attrs: { href: payload.url, target: '_blank' } }],
    }).run()
  } else if (!empty) {
    // Apply link to current selection
    chain.setLink({ href: payload.url, target: '_blank' }).run()
  } else {
    // Insert link with URL as text
    chain.insertContent({
      type: 'text',
      text: payload.url,
      marks: [{ type: 'link', attrs: { href: payload.url, target: '_blank' } }],
    }).run()
  }

  showLinkDialog.value = false
}

function removeLink() {
  if (!editor.value) return
  const chain = editor.value.chain().focus() as unknown as { unsetLink: () => { run: () => boolean } }
  chain.unsetLink().run()
  showLinkDialog.value = false
}
const pageSetupSize = ref(pageSizeId.value)
const pageSetupOrientation = ref(orientation.value)
const pageSetupMargins = ref({ ...margins.value })

const openPageSetupModal = () => {
  pageSetupSize.value = pageSizeId.value
  pageSetupOrientation.value = orientation.value
  pageSetupMargins.value = { ...margins.value }
  showPageSetupModal.value = true
}

const applyPageSetup = () => {
  pageSizeId.value = pageSetupSize.value
  orientation.value = pageSetupOrientation.value
  margins.value = { ...pageSetupMargins.value }
  emit('update:pageSize', pageSizeId.value)
  showPageSetupModal.value = false
}

const isHeaderActive = ref(false)
const openHeaderFormatModal = () => {
  draftHeaderMarginCm.value = headerMarginCm.value
  draftFooterMarginCm.value = footerMarginCm.value
  draftDifferentFirstPage.value = isDifferentFirstPage.value
  draftDifferentOddEven.value = isDifferentOddEven.value
  showHeaderFormatModal.value = true
}

const applyHeaderFormat = () => {
  headerMarginCm.value = draftHeaderMarginCm.value
  footerMarginCm.value = draftFooterMarginCm.value
  isDifferentFirstPage.value = draftDifferentFirstPage.value
  isDifferentOddEven.value = draftDifferentOddEven.value
  showHeaderFormatModal.value = false
  applyHeaderFooter()
  persistCurrentDoc()
}

const openPageNumberModal = () => {
  draftPageNumberPosition.value = pageNumberPosition.value
  draftShowPageNumberOnFirstPage.value = showPageNumberOnFirstPage.value
  draftPageNumberMode.value = pageNumberMode.value
  draftPageNumberStartAt.value = pageNumberStartAt.value
  showPageNumberModal.value = true
}

const applyPageNumberSettings = () => {
  pageNumberPosition.value = draftPageNumberPosition.value
  showPageNumberOnFirstPage.value = draftShowPageNumberOnFirstPage.value
  pageNumberMode.value = draftPageNumberMode.value
  pageNumberStartAt.value = draftPageNumberStartAt.value
  showPageNumberModal.value = false

  const pageToken = '{page}'

  if (pageNumberPosition.value === 'footer') {
    // If moving page numbers to footer, clear page token from header
    if (userHeaderRight.value.includes(pageToken)) {
      userHeaderRight.value = userHeaderRight.value.replace(/{page}/g, '').trim()
    }
    userFooterRight.value = pageToken
  } else {
    // If moving page numbers to header, clear page token from footer
    if (userFooterRight.value.includes(pageToken)) {
      userFooterRight.value = userFooterRight.value.replace(/{page}/g, '').trim()
    }
    userHeaderRight.value = pageToken
  }

  applyHeaderFooter()
  persistCurrentDoc()
}

const clearHeaderContent = () => {
  userHeaderLeft.value = ''
  userHeaderRight.value = ''
  applyHeaderFooter()
  persistCurrentDoc()
  isHeaderActive.value = false
}

const startInlineHeaderEdit = (event?: MouseEvent) => {
  let headerEl: HTMLElement | null = null
  if (event) {
    const target = event.target as HTMLElement | null
    headerEl = target?.closest('.rm-page-header, .rm-first-page-header') as HTMLElement | null
  }
  if (!headerEl) {
    headerEl = document.querySelector('.rm-page-header, .rm-first-page-header') as HTMLElement | null
  }
  if (!headerEl) return

  const targetHeader = headerEl
  isHeaderActive.value = true
  targetHeader.classList.add('rm-header-active')
  let editableEl = targetHeader.querySelector('.rm-page-header-left') as HTMLElement | null
  if (!editableEl) {
    editableEl = document.createElement('div')
    editableEl.className = 'rm-page-header-left'
    targetHeader.prepend(editableEl)
  }

  editableEl.contentEditable = 'true'
  editableEl.setAttribute('tabindex', '0')
  editableEl.dataset.placeholder = t('editor.headerFooter.headerPlaceholder') || 'Header'

  // Prevent ProseMirror from intercepting keyboard events (backspace,
  // delete, arrows, etc.) while editing header content.
  editableEl.addEventListener('keydown', (e: KeyboardEvent) => {
    e.stopPropagation()
  })

  editableEl.focus()

  setTimeout(() => {
    if (editableEl) {
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(editableEl)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, 10)

  // Render Google Docs Header active bar at bottom edge of header
  let activeBar = targetHeader.querySelector('.rm-google-docs-header-bar') as HTMLElement
  if (!activeBar) {
    activeBar = document.createElement('div')
    activeBar.className = 'rm-google-docs-header-bar'
    activeBar.innerHTML = `
      <span class="rm-header-label">Header</span>
      <div class="rm-header-right-tools">
        <label class="rm-diff-label">
          <input type="checkbox" class="rm-diff-cb" ${isDifferentFirstPage.value ? 'checked' : ''}>
          <span>${t('editor.headerFooter.differentFirstPage') || 'Halaman pertama berbeda'}</span>
        </label>
        <div class="rm-options-wrapper">
          <button type="button" class="rm-options-btn">
            <span>${t('editor.headerFooter.options') || 'Opsi'}</span>
            <span class="rm-arrow-icon" style="font-size: 8px;">▼</span>
          </button>
          <div class="rm-options-dropdown">
            <button type="button" class="rm-opt-format">${t('editor.headerFooter.formatHeader') || 'Format header'}</button>
            <button type="button" class="rm-opt-page-num">${t('editor.headerFooter.pageNumber') || 'Nomor halaman'}</button>
            <button type="button" class="rm-opt-remove">${t('editor.headerFooter.removeHeader') || 'Hapus header'}</button>
          </div>
        </div>
      </div>
    `
    targetHeader.appendChild(activeBar)

    activeBar.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    const cb = activeBar.querySelector('.rm-diff-cb') as HTMLInputElement
    cb?.addEventListener('change', (e) => {
      e.stopPropagation()
      const isChecked = (e.target as HTMLInputElement).checked
      if (isChecked) {
        userFirstPageHeaderLeft.value = ''
        userFirstPageHeaderRight.value = ''
      }
      isDifferentFirstPage.value = isChecked
      applyHeaderFooter()
    })

    const optBtn = activeBar.querySelector('.rm-options-btn') as HTMLButtonElement
    const dropdown = activeBar.querySelector('.rm-options-dropdown') as HTMLElement
    const arrowIcon = activeBar.querySelector('.rm-arrow-icon') as HTMLElement

    optBtn?.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })

    optBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      const isOpen = dropdown.classList.toggle('is-open')
      if (arrowIcon) arrowIcon.textContent = isOpen ? '▲' : '▼'
    })

    const optFormat = activeBar.querySelector('.rm-opt-format') as HTMLButtonElement
    optFormat?.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })
    optFormat?.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.classList.remove('is-open')
      if (arrowIcon) arrowIcon.textContent = '▼'
      openHeaderFormatModal()
    })

    const optPageNum = activeBar.querySelector('.rm-opt-page-num') as HTMLButtonElement
    optPageNum?.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })
    optPageNum?.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.classList.remove('is-open')
      if (arrowIcon) arrowIcon.textContent = '▼'
      openPageNumberModal()
    })

    const optRemove = activeBar.querySelector('.rm-opt-remove') as HTMLButtonElement
    optRemove?.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })
    optRemove?.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.classList.remove('is-open')
      if (arrowIcon) arrowIcon.textContent = '▼'
      clearHeaderContent()
    })
  }

  const handleOutsideClick = (e: MouseEvent) => {
    const targetNode = e.target as Node | null
    if (!targetNode) return
    if (targetHeader.contains(targetNode)) return
    if (activeBar && activeBar.contains(targetNode)) return
    if ((targetNode as HTMLElement).closest('.rm-google-docs-header-bar, .rm-options-dropdown, .fixed.z-50')) return
    // Don't deactivate header while a modal triggered from the header bar is open
    if (showHeaderFormatModal.value || showPageNumberModal.value) return

    editableEl.contentEditable = 'false'
    targetHeader.classList.remove('rm-header-active')
    if (activeBar) activeBar.remove()
    isHeaderActive.value = false

    const allHeaders = Array.from(document.querySelectorAll('.rm-page-header'))
    const pageIndex = allHeaders.indexOf(targetHeader)
    const isFirstPage = pageIndex === 0
    const isEvenPage = (pageIndex + 1) % 2 === 0

    if (isDifferentFirstPage.value && isFirstPage) {
      userFirstPageHeaderLeft.value = editableEl.innerHTML
    } else if (isDifferentOddEven.value && isEvenPage) {
      userEvenPageHeaderLeft.value = editableEl.innerHTML
    } else {
      userHeaderLeft.value = editableEl.innerHTML
    }

    applyHeaderFooter()
    persistCurrentDoc()
    document.removeEventListener('mousedown', handleOutsideClick)
  }

  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick)
  }, 50)

  const stopEditing = (e: FocusEvent) => {
    const rel = e.relatedTarget as HTMLElement | null
    if (activeBar && (activeBar.contains(rel) || rel?.closest('.rm-google-docs-header-bar, .rm-options-dropdown'))) return
    // Don't deactivate header while a modal triggered from the header bar is open
    if (showHeaderFormatModal.value || showPageNumberModal.value) return
    editableEl.contentEditable = 'false'
    targetHeader.classList.remove('rm-header-active')
    if (activeBar) activeBar.remove()
    isHeaderActive.value = false

    const allHeaders = Array.from(document.querySelectorAll('.rm-page-header'))
    const pageIndex = allHeaders.indexOf(targetHeader)
    const isFirstPage = pageIndex === 0
    const isEvenPage = (pageIndex + 1) % 2 === 0

    if (isDifferentFirstPage.value && isFirstPage) {
      userFirstPageHeaderLeft.value = editableEl.innerHTML
    } else if (isDifferentOddEven.value && isEvenPage) {
      userEvenPageHeaderLeft.value = editableEl.innerHTML
    } else {
      userHeaderLeft.value = editableEl.innerHTML
    }

    applyHeaderFooter()
    persistCurrentDoc()
    editableEl.removeEventListener('blur', stopEditing)
    document.removeEventListener('mousedown', handleOutsideClick)
  }

  editableEl.addEventListener('blur', stopEditing)
}

const openFooterModal = () => {
  if (!editor.value) return
  footerLeftInput.value = userFooterLeft.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
  footerRightInput.value = userFooterRight.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
  showFooterModal.value = true
}

const saveFooter = () => {
  if (!editor.value) return
  userFooterLeft.value = footerLeftInput.value
  userFooterRight.value = footerRightInput.value

  applyHeaderFooter()
  persistCurrentDoc()

  showFooterModal.value = false
}

// ─── Edit / Format menu commands ─────────────────────────────────────────────
// Editor-scoped menu actions are executed in-library (the library owns command
// execution); they are never emitted to the host app. All dispatch is defensive:
// a missing command (e.g. undo in collab mode where StarterKit history is off,
// or a plugin the host didn't load) is a no-op, never a crash.

// Call a native TipTap command by name, then refocus the editor.
const runMenuEditorCommand = (name: string, ...args: unknown[]) => {
  if (!editor.value) return
  const command = (editor.value.commands as Record<string, ((...a: unknown[]) => unknown) | undefined>)[name]
  if (typeof command === 'function') command(...args)
  editor.value.commands.focus()
}

// Plugin-backed actions (alignment, task list) go through pluginActions first so
// custom plugin commands win; fall back to a native command of the same name.
const runPluginMenuAction = (action: string, ...args: unknown[]) => {
  if (!editor.value) return
  const fn = pluginActions.value[action]
  if (typeof fn === 'function') {
    fn(...args)
  } else {
    runMenuEditorCommand(action, ...args)
    return
  }
  editor.value.commands.focus()
}

// Insert the {page} placeholder into the header or footer (right slot, Google
// Docs style). tiptap-pagination-plus renders {page} per page; {total} is
// resolved by applyHeaderFooter. Persisted via the shared doc pipeline.
const insertPageNumber = (slot: 'header' | 'footer') => {
  const target = slot === 'header' ? userHeaderRight : userFooterRight
  if (!target.value.includes('{page}')) {
    target.value = target.value ? `${target.value} {page}` : '{page}'
  }
  applyHeaderFooter()
  persistCurrentDoc()
}

// ─── Clipboard operations (Edit menu) ────────────────────────────────────────
// Selection is serialized from ProseMirror state (not the DOM), so menu clicks
// that blurred the editor still cut/copy the right content.

const serializeSelection = (): { html: string; text: string } | null => {
  if (!editor.value) return null
  const { state } = editor.value
  if (state.selection.empty) return null
  const slice = state.selection.content()
  const div = document.createElement('div')
  div.appendChild(DOMSerializer.fromSchema(state.schema).serializeFragment(slice.content))
  return {
    html: div.innerHTML,
    text: slice.content.textBetween(0, slice.content.size, '\n\n', ' '),
  }
}

const handleCut = async () => {
  const sel = serializeSelection()
  if (!sel || !editor.value) return
  const ok = await writeClipboard(sel.text, sel.html)
  if (ok) editor.value.chain().focus().deleteSelection().run()
}

const handleCopy = async () => {
  const sel = serializeSelection()
  if (!sel) return
  await writeClipboard(sel.text, sel.html)
  editor.value?.commands.focus()
}

const handlePaste = async () => {
  if (!editor.value) return
  // Rich first (keeps formatting); falls back to plain text inside the helper.
  // Sanitize pasted HTML (strip <meta>, <style>, etc.) to prevent crashes
  // from non-content tags commonly produced by Google Docs.
  const html = await readClipboardHtml()
  if (html) {
    const sanitized = sanitizePastedHTML(html)
    try {
      editor.value.chain().focus().insertContent(sanitized).run()
    } catch (err) {
      console.error('[DocsEditor] paste HTML failed, falling back to plain text:', err)
      const text = await readClipboardText()
      if (text) {
        try {
          editor.value.chain().focus().insertContent(text).run()
        } catch (fallbackErr) {
          console.error('[DocsEditor] paste plain text also failed:', fallbackErr)
        }
      }
    }
    return
  }
  const text = await readClipboardText()
  if (text) {
    try {
      editor.value.chain().focus().insertContent(text).run()
    } catch (err) {
      console.error('[DocsEditor] paste plain text failed:', err)
    }
  }
}

const handlePastePlain = async () => {
  if (!editor.value) return
  const text = await readClipboardText()
  if (text) editor.value.chain().focus().insertContent(text).run()
}

const handleDeleteSelection = () => {
  if (!editor.value) return
  const { state } = editor.value
  if (state.selection.empty) {
    // Google Docs behavior: with no selection, Delete removes the next character.
    const { from, to } = state.selection
    if (to < state.doc.content.size) {
      editor.value.chain().focus().deleteRange({ from, to: to + 1 }).run()
    }
  } else {
    editor.value.chain().focus().deleteSelection().run()
  }
}

// ⌘⇧V pastes plain text (native in some browsers; registered here for parity);
// ⌘⇧H opens find & replace (Google Docs parity).
const handleEditKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && focusMode.value) {
    focusMode.value = false
    return
  }
  if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
  if (!editor.value?.view.dom.contains(e.target as Node)) return
  if (e.key.toLowerCase() === 'v') {
    e.preventDefault()
    void handlePastePlain()
  } else if (e.key.toLowerCase() === 'h') {
    e.preventDefault()
    showFindReplace.value = true
  }
}

onMounted(() => document.addEventListener('keydown', handleEditKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleEditKeydown))

const editFormatMenuCommands: Record<string, () => void> = {
  // Edit menu
  undo: () => runMenuEditorCommand('undo'),
  redo: () => runMenuEditorCommand('redo'),
  'select-all': () => runMenuEditorCommand('selectAll'),
  cut: () => { void handleCut() },
  copy: () => { void handleCopy() },
  paste: () => { void handlePaste() },
  'paste-without-formatting': () => { void handlePastePlain() },
  delete: () => handleDeleteSelection(),
  // Format menu — text styles
  bold: () => runMenuEditorCommand('toggleBold'),
  italic: () => runMenuEditorCommand('toggleItalic'),
  underline: () => runMenuEditorCommand('toggleUnderline'),
  heading1: () => runMenuEditorCommand('toggleHeading', { level: 1 }),
  heading2: () => runMenuEditorCommand('toggleHeading', { level: 2 }),
  heading3: () => runMenuEditorCommand('toggleHeading', { level: 3 }),
  // Format menu — align & indent (alignment plugin)
  'align-left': () => runPluginMenuAction('alignLeft'),
  'align-center': () => runPluginMenuAction('alignCenter'),
  'align-right': () => runPluginMenuAction('alignRight'),
  'align-justify': () => runPluginMenuAction('alignJustify'),
  // Format menu — bullets & numbering (StarterKit lists + lists plugin)
  'bullet-list': () => runMenuEditorCommand('toggleBulletList'),
  'numbered-list': () => runMenuEditorCommand('toggleOrderedList'),
  'task-list': () => runPluginMenuAction('toggleTaskList'),
  // Format menu — extras
  'horizontal-line': () => runMenuEditorCommand('setHorizontalRule'),
  'page-numbers-header': () => insertPageNumber('header'),
  'page-numbers-footer': () => insertPageNumber('footer'),
  'clear-formatting': () => {
    if (!editor.value) return
    editor.value.chain().unsetAllMarks().clearNodes().run()
    // clearNodes keeps node attributes — also reset text alignment when the
    // alignment plugin's command is available.
    runMenuEditorCommand('setTextAlign', 'left')
  },
  // Insert menu — editor-scoped inserts (template actions like meeting-notes /
  // email-draft stay host-level and are still emitted).
  'insert-image': () => runPluginMenuAction('insertImage'),
  'insert-table': () => runPluginMenuAction('insertTable', { rows: 3, cols: 3, withHeaderRow: true }),
  'insert-code': () => runPluginMenuAction('toggleCodeBlock'),
  'insert-toc': () => runPluginMenuAction('insertToc'),
}

let menuClick = (action: string) => {
  if (action === 'page-setup') {
    openPageSetupModal()
  } else if (action === 'print') {
    handlePrint()
  } else if (action === 'version-history') {
    toggleSidebar('history')
  } else if (action === 'details') {
    showDetailsModal.value = true
  } else if (action === 'email') {
    showEmailModal.value = true
  } else if (action === 'find-replace') {
    showFindReplace.value = true
  } else if (action === 'insert-link') {
    openLinkDialog()
  } else if (action === 'security') {
    emit('share')
  } else if (action === 'insert-header') {
    startInlineHeaderEdit()
  } else if (action === 'insert-footer') {
    openFooterModal()
  } else if (action === 'toggle-pageless') {
    applyPageless(!isPageless.value)
  } else if (action === 'toggle-left-sidebar') {
    toggleSidebar('toc')
  } else if (action === 'toggle-ruler') {
    showRuler.value = !showRuler.value
  } else if (action === 'toggle-focus-mode') {
    focusMode.value = !focusMode.value
    if (focusMode.value) activeSidebar.value = null
  } else if (action === 'insert-footnote') {
    // Use ProseMirror's transaction API directly — more reliable than chain()
    // because chain().focus() can fail when focus has left the editor via menu click.
    if (!editor.value) return
    const { state, view } = editor.value
    const footnoteType = state.schema.nodes['footnote']
    if (!footnoteType) {
      console.error('[DocsEditor] footnote node type not registered in schema')
      return
    }
    // Insert at the last known cursor position
    const insertPos = state.selection.head
    const footnoteNode = footnoteType.create({ content: '' })
    const tr = state.tr.insert(insertPos, footnoteNode)
    view.dispatch(tr)
    view.focus()

    // After DOM settles: build footnote list and focus the new text area
    setTimeout(() => {
      updateFootnotes()
      const items = document.querySelectorAll<HTMLElement>('.docs-footnote-item-text')
      const last = items[items.length - 1]
      if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        last.focus()
      }
    }, 160)
  } else if (editFormatMenuCommands[action]) {
    editFormatMenuCommands[action]()
  } else {
    emit('menu-click', action)
  }
}
let toggleSidebar = (key: SidebarKey) => { activeSidebar.value = activeSidebar.value === key ? null : key }
let handlePrint = () => window.print()

// ─── Footnote (Catatan Kaki) ──────────────────────────────────────────────────

/**
 * Save edited footnote content from a contenteditable div back to the
 * ProseMirror node attribute when the user blurs the item.
 */
const saveFootnoteItemContent = (refEl: HTMLElement, newContent: string) => {
  if (!editor.value) return
  const view = editor.value.view
  view.state.doc.descendants((node, pos): boolean | undefined | void => {
    if (node.type.name === 'footnote') {
      if (view.nodeDOM(pos) === refEl) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { content: newContent }))
        return false
      }
    }
    return undefined
  })
}

/**
 * Build / refresh the inline footnote area at the bottom of each page.
 * ─ Numbers the inline <sup> refs CONTINUOUSLY through the document (Word /
 *   Google Docs behavior): page N continues from the last number on page
 *   N-1. This also matches the citation engine's sequential noteIndex.
 * ─ Creates contenteditable footnote items that sync back to ProseMirror on blur.
 * ─ Skips rebuilding any page whose footnote area is currently focused.
 */
const updateFootnotes = () => {
  if (!editor.value || !isReady.value) return
  const editorDom = editor.value.view.dom

  const paginationEl = editorDom.querySelector('[data-rm-pagination]')
  if (!paginationEl) return

  /**
   * Build one footnote row body. Free-text footnotes stay editable and sync
   * back to the PM node on blur (existing behavior). Citation-backed
   * footnotes (Phase 6, `data-footnote-source-id`) are citeproc-rendered and
   * read-only — their text is derived, never typed.
   */
  const buildFootnoteTextDiv = (ref: HTMLElement): HTMLDivElement => {
    const textDiv = document.createElement('div')
    textDiv.className = 'docs-footnote-item-text'

    if (ref.hasAttribute('data-footnote-source-id')) {
      const citationId = ref.getAttribute('data-citation-id') ?? ''
      const engine = (editor.value?.storage as Record<string, unknown> | undefined)?.citation as
        { engine?: { renderCluster: (id: string) => string } | null } | undefined
      const html = engine?.engine?.renderCluster(citationId) ?? ''
      textDiv.classList.add('docs-footnote-item-text--citation')
      if (html) {
        textDiv.innerHTML = html
      } else {
        textDiv.setAttribute('data-empty', 'true')
      }
      return textDiv
    }

    const content = ref.getAttribute('data-footnote-content') ?? ''
    textDiv.contentEditable = 'true'
    textDiv.textContent = content
    if (!content) textDiv.setAttribute('data-empty', 'true')

    textDiv.addEventListener('input', () => {
      textDiv.removeAttribute('data-empty')
      if (!textDiv.textContent) textDiv.setAttribute('data-empty', 'true')
    })

    textDiv.addEventListener('blur', () => {
      const newContent = textDiv.textContent?.trim() ?? ''
      saveFootnoteItemContent(ref, newContent)
    })
    return textDiv
  }

  const pageBreaks = Array.from(paginationEl.querySelectorAll<HTMLElement>('.rm-page-break'))
  const allRefs = Array.from(editorDom.querySelectorAll<HTMLElement>('.docs-footnote-ref'))

  if (pageBreaks.length === 0) {
    // Pageless mode or layout not computed yet: render footnotes at the very bottom of the paper
    allRefs.forEach((ref, i) => { ref.textContent = String(i + 1) })

    // Find paper container
    const paper = editorRef.value
    if (!paper) return

    // Remove existing pageless container
    paper.querySelector('.docs-pageless-footnotes')?.remove()

    if (allRefs.length === 0) return

    // Skip if a footnote text input inside this container is currently focused
    const existing = paper.querySelector<HTMLElement>('.docs-pageless-footnotes')
    if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

    const container = document.createElement('div')
    container.className = 'docs-page-footnotes docs-pageless-footnotes'

    const sep = document.createElement('div')
    sep.className = 'docs-footnotes-sep'
    container.appendChild(sep)

    allRefs.forEach((ref, n) => {
      const row = document.createElement('div')
      row.className = 'docs-footnote-item'

      const num = document.createElement('sup')
      num.className = 'docs-footnote-item-num'
      num.textContent = String(n + 1)

      const textDiv = buildFootnoteTextDiv(ref)

      ref.dataset.footnoteItemId = `fn-pageless-${n}`
      row.id = `fn-pageless-${n}`

      row.appendChild(num)
      row.appendChild(textDiv)
      container.appendChild(row)
    })

    paper.appendChild(container)
    return
  }


  // Map page index → footnote refs on that page
  const pageRefs = new Map<number, HTMLElement[]>()
  pageBreaks.forEach((_, i) => pageRefs.set(i, []))

  allRefs.forEach(ref => {
    const top = ref.getBoundingClientRect().top
    let assigned = pageBreaks.length - 1
    for (let i = 0; i < pageBreaks.length - 1; i++) {
      const breaker = pageBreaks[i].querySelector<HTMLElement>('.breaker')
      if (breaker && top < breaker.getBoundingClientRect().top) { assigned = i; break }
    }
    pageRefs.get(assigned)!.push(ref)
  })

  // Footnotes are numbered continuously through the document — the first
  // footnote on a page continues from the last number of the previous page.
  let nextFootnoteNumber = 1
  pageBreaks.forEach((pb, pageIdx) => {
    const refs = pageRefs.get(pageIdx) ?? []
    const pageStartNumber = nextFootnoteNumber
    nextFootnoteNumber += refs.length

    // Number inline refs (continuous across pages)
    refs.forEach((ref, n) => { ref.textContent = String(pageStartNumber + n) })

    // Skip rebuild if a footnote item on this page has focus
    const existing = pb.querySelector<HTMLElement>('.docs-page-footnotes')
    if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

    existing?.remove()
    if (refs.length === 0) return

    // Build inline footnote area
    const container = document.createElement('div')
    container.className = 'docs-page-footnotes'

    // Separator line
    const sep = document.createElement('div')
    sep.className = 'docs-footnotes-sep'
    container.appendChild(sep)

    refs.forEach((ref, n) => {
      const row = document.createElement('div')
      row.className = 'docs-footnote-item'

      const num = document.createElement('sup')
      num.className = 'docs-footnote-item-num'
      num.textContent = String(pageStartNumber + n)

      const textDiv = buildFootnoteTextDiv(ref)

      // Clicking the sup ref in the text jumps here
      ref.dataset.footnoteItemId = `fn-${pageIdx}-${n}`
      row.id = `fn-${pageIdx}-${n}`

      row.appendChild(num)
      row.appendChild(textDiv)
      container.appendChild(row)
    })

    // Find the page breaker (the layout divider which contains the footer)
    const breaker = pb.querySelector('.breaker')
    if (breaker) {
      // Prepend so it sits exactly above the footer content inside the breaker
      breaker.insertBefore(container, breaker.firstChild)
    } else {
      pb.appendChild(container)
    }
  })
}


// Click on sup ref → scroll to + focus corresponding footnote item
watch(isReady, (ready) => {
  if (!ready || !editor.value) return
  editor.value.view.dom.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('.docs-footnote-ref')
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    const id = target.dataset.footnoteItemId
    if (!id) return
    const itemRow = document.getElementById(id)
    const textEl = itemRow?.querySelector<HTMLElement>('.docs-footnote-item-text')
    if (textEl) {
      textEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      textEl.focus()
      // Place cursor at end
      const range = document.createRange()
      range.selectNodeContents(textEl)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  })
})

// Re-render footnotes after each editor update & lifecycle changes
watch(isReady, (ready) => {
  if (!ready || !editor.value) return

  // Run immediately
  setTimeout(updateFootnotes, 150)

  // Run on update & selection changes
  editor.value.on('update', () => { setTimeout(updateFootnotes, 60) })
  editor.value.on('selectionUpdate', () => { setTimeout(updateFootnotes, 100) })

  // Citation-backed footnotes repaint when the engine emits change
  // (source edit, style switch, citation add/remove).
  const citationStorage = (editor.value.storage as Record<string, unknown>).citation as
    { engine?: { onChange: (cb: () => void) => () => void } | null } | undefined
  citationStorage?.engine?.onChange(() => { setTimeout(updateFootnotes, 30) })

  // Listen to window resize because pagination calculations layout can shift
  window.addEventListener('resize', updateFootnotes)
})
</script>

<template>
  <div class="docs-editor flex h-screen w-full flex-col overflow-hidden bg-slate-50 transition-colors dark:bg-[#02040a]">
    <HeaderBar
v-if="!focusMode"
:title="title" :editable="editable" :collaborators="collaborators" :starred="starred" :user-name="userName" :user-avatar="userAvatar"
      :pageless="isPageless" :outline-open="activeSidebar === 'toc'" :show-ruler="showRuler" :focus-mode="focusMode"
      @menu-click="menuClick" @back="$emit('back')" @update:title="$emit('update:title', $event)" @toggle-star="$emit('toggle-star')"
      @export="$emit('export', $event)" @share="$emit('share')"><template #actions><slot name="header-actions" /></template><template #overflow-actions="slotProps"><slot name="overflow-actions" v-bind="slotProps" /></template><template #user-menu="slotProps"><slot name="user-menu" v-bind="slotProps" /></template></HeaderBar>
    <EditorToolbar
v-if="!focusMode"
:actions="pluginActions" :plugins="plugins" :editor="editor" :active-sidebar="activeSidebar"
      @toggle-sidebar="toggleSidebar"       @print="handlePrint" />
    <RulerBar v-if="showRuler && !focusMode" :layout-options="resolvedLayoutOptions" />
    <!-- Floating exit button shown only while focus mode is active -->
    <button
      v-if="focusMode"
      type="button"
      class="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#0e1525] dark:text-slate-300 dark:hover:bg-white/5"
      :title="t('header.focusMode')"
      :aria-label="t('header.focusMode')"
      @click="focusMode = false"
    >
      <Minimize2 class="h-5 w-5" />
    </button>
    <BubbleMenu :visible="showBubbleMenu" :actions="pluginActions" :position="bubblePosition" :editor="editor" />
    <SlashMenuVue :editor="editor" :commands="slashCommands" />
    <div class="docs-editor__body relative flex flex-1 overflow-hidden">
      <!-- Find & replace floating panel (Edit menu / ⌘⇧H) -->
      <FindReplaceDialog :is-open="showFindReplace" :editor="editor" @close="showFindReplace = false" />

      <!-- Document outline (heading map) — toggled by the floating button -->
      <TOCSidebar v-if="activeSidebar === 'toc'" :editor="editor" @close="activeSidebar = null" />

      <!-- Floating toggle shown when the outline is collapsed -->
      <button
        v-else
        type="button"
        class="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#0e1525] dark:text-slate-300 dark:hover:bg-white/5"
        :title="t('editor.showOutline')"
        @click="toggleSidebar('toc')"
      >
        <Menu class="h-5 w-5" />
      </button>

      <div ref="scrollContainerRef" class="docs-editor-scroll relative flex flex-1 overflow-auto px-4 py-6 bg-slate-100 dark:bg-[#02040a]" @scroll="handleScroll">
        <VerticalRuler v-if="showRuler && !focusMode" :layout-options="resolvedLayoutOptions" />
        <div class="flex flex-1 flex-col items-center gap-4 w-full relative">
          <div class="relative w-full max-w-[794px]">
            <!-- Virtual Page Overlay (experimental) — renders only visible pages.
                 Positioned absolutely over the editor, behind content (z-index: 0) -->
            <VirtualPageOverlay
              v-if="useVirtual"
              :data="virtualData"
              :is-ready="virtualReady"
            />
            <!-- Loading Indicator Overlay -->
            <div v-if="!isReady" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-[#0e1525]/60 backdrop-blur-[2px] gap-3 rounded-lg" :aria-label="t('editor.loadingDocument')">
            </div>

            <!-- Editor -->
            <div ref="editorRef" class="docs-editor__paper outline-none text-slate-800 dark:text-[#e2e8f0]" :class="{ 'opacity-40': !isReady }" />
          </div>
        </div>
      </div>

      <!-- Reference manager (Phase 6B) — right sidebar; also acts as the
           source picker while a citation insert is pending -->
      <ReferencesSidebar
        v-if="activeSidebar === 'references'"
        :sources="citationSources"
        :active-style="citationStyleId"
        :picker-mode="pendingSourceRequest"
        :can-import="canImportSources"
        :importing="importBusy"
        :import-message="importMessage"
        @close="activeSidebar = null"
        @insert="handleReferenceInsert"
        @create="handleSourceCreate"
        @update="handleSourceUpdate"
        @remove="handleSourceRemove"
        @update:style="handleCitationStyleChange"
        @import-doi="handleImportDoi"
        @import-bibliography="handleImportBibliography"
      />

      <!-- Phase 9 P9-4 — comment threads; library-only stub that
           forwards user intent to the host (which owns the REST
           surface). The host resolves selections + sets the
           \`comment\` mark on the anchored range. -->
      <CommentsSidebar
        v-if="activeSidebar === 'comments'"
        :comments="props.comments"
        :selected-text-snippet="props.selectedTextSnippet"
        :selected-text-index="props.selectedTextIndex"
        @close="activeSidebar = null"
        @add-comment="(c, t, i) => $emit('add-comment', c, t, i)"
        @add-reply="(id, c) => $emit('add-reply', id, c)"
        @resolve-comment="(id) => $emit('resolve-comment', id)"
      />

      <!-- Phase 9 — version history; library-only stub that forwards
           user intent to the host (which owns the REST surface). No
           close emit — toggled via the toolbar History button. -->
      <HistorySidebar
        v-if="activeSidebar === 'history'"
        :snapshots="props.snapshots"
        :active-preview-index="props.activePreviewIndex"
        @save-snapshot="(name) => $emit('save-snapshot', name)"
        @restore-snapshot="(idx) => $emit('restore-snapshot', idx)"
        @preview-snapshot="(s) => $emit('preview-snapshot', s)"
      />

      <!-- Doc-aware AI chat (Phase 7D) — right sidebar; only mounts when the
           host injects an aiStream transport -->
      <AISidebar
        v-if="activeSidebar === 'ai'"
        :editor="editor"
        :ai-stream="props.aiStream"
        :ai-draft="props.aiDraft"
        @close="activeSidebar = null"
      />
    </div>
    <StatusBar
v-if="!focusMode"
:connection-state="connectionState" :saving-status="savingStatus" :last-saved="lastSaved"
      :word-count="wordCount" :char-count="charCount" :page-count="pageCount" :current-page="currentPage"
      :page-size="pageSizeId" :page-sizes="PAGE_SIZES" :pageless="isPageless"
      @update:page-size="pageSizeId = $event; emit('update:pageSize', $event)" />

    <!-- Dialog Footer Customization -->
    <div v-if="showFooterModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
        <h2 class="text-lg font-bold mb-4">{{ t('editor.headerFooter.footer') }}</h2>
        
        <!-- Footer Section -->
        <div class="mb-6">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">{{ t('editor.headerFooter.footer') }}</h3>
            <button type="button" class="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors" @click="footerLeftInput = ''; footerRightInput = ''">{{ t('editor.headerFooter.clear') }}</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-medium block mb-1">{{ t('editor.headerFooter.left') }}</label>
              <input v-model="footerLeftInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" :placeholder="t('editor.headerFooter.footerLeftPlaceholder')">
            </div>
            <div>
              <label class="text-[11px] font-medium block mb-1">{{ t('editor.headerFooter.right') }}</label>
              <input v-model="footerRightInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" :placeholder="t('editor.headerFooter.footerRightPlaceholder')">
            </div>
          </div>
        </div>

        <!-- Variables Info -->
        <div class="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400 mb-6">
          {{ t('editor.headerFooter.variableInfo') }}
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5" @click="showFooterModal = false">
            {{ t('editor.headerFooter.cancel') }}
          </button>
          <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" @click="saveFooter">
            {{ t('editor.headerFooter.save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Dialog Header & Footer Format (Google Docs Style) -->
    <div v-if="showHeaderFormatModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 select-none">
      <div class="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
        <h2 class="text-xl font-medium mb-6 text-slate-900 dark:text-white">{{ t('editor.headerFooter.headerFooterFormatTitle') }}</h2>
        
        <!-- Margin Section -->
        <div class="mb-6">
          <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.marginSection') }}</h3>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">{{ t('editor.headerFooter.headerTopMargin') }}</label>
              <input v-model="draftHeaderMarginCm" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
            </div>
            <div>
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">{{ t('editor.headerFooter.footerBottomMargin') }}</label>
              <input v-model="draftFooterMarginCm" type="number" step="0.01" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
            </div>
          </div>
        </div>

        <!-- Tata Letak Section -->
        <div class="mb-8">
          <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.layoutSection') }}</h3>
          <div class="space-y-3">
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="draftDifferentFirstPage" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.differentFirstPage') }}</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="draftDifferentOddEven" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.differentOddEven') }}</span>
            </label>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end items-center gap-3">
          <button type="button" class="rounded-full px-5 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" @click="showHeaderFormatModal = false">
            {{ t('editor.headerFooter.cancel') }}
          </button>
          <button type="button" class="rounded-full bg-blue-600 hover:bg-blue-700 px-6 py-2 text-xs font-semibold text-white shadow-md transition-colors" @click="applyHeaderFormat">
            {{ t('editor.headerFooter.apply') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Dialog Nomor Halaman (Google Docs Style) -->
    <div v-if="showPageNumberModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 select-none">
      <div class="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
        <h2 class="text-xl font-medium mb-6 text-slate-900 dark:text-white">{{ t('editor.headerFooter.pageNumberTitle') }}</h2>
        
        <!-- Posisi Section -->
        <div class="mb-6">
          <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.positionSection') }}</h3>
          <div class="space-y-3">
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="draftPageNumberPosition" type="radio" value="header" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.positionHeader') }}</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="draftPageNumberPosition" type="radio" value="footer" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.positionFooter') }}</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none pt-1">
              <input v-model="draftShowPageNumberOnFirstPage" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.showOnFirstPage') }}</span>
            </label>
          </div>
        </div>

        <!-- Penomoran Section -->
        <div class="mb-8">
          <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.numberingSection') }}</h3>
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                <input v-model="draftPageNumberMode" type="radio" value="startAt" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                <span>{{ t('editor.headerFooter.startAt') }}</span>
              </label>
              <input v-model="draftPageNumberStartAt" type="number" min="1" class="w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:outline-none" />
            </div>
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="draftPageNumberMode" type="radio" value="continue" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.continueFromPrevious') }}</span>
            </label>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end items-center gap-3">
          <button type="button" class="rounded-full px-5 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" @click="showPageNumberModal = false">
            {{ t('editor.headerFooter.cancel') }}
          </button>
          <button type="button" class="rounded-full bg-blue-600 hover:bg-blue-700 px-6 py-2 text-xs font-semibold text-white shadow-md transition-colors" @click="applyPageNumberSettings">
            {{ t('editor.headerFooter.apply') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Dialog Email -->
    <EmailDialog
      :is-open="showEmailModal"
      :document-title="props.title"
      :share-url="props.shareUrl"
      @close="showEmailModal = false"
      @copy-link="emit('share')"
    />

    <!-- Dialog Details -->
    <DetailsDialog :is-open="showDetailsModal" :meta="props.documentMeta" @close="showDetailsModal = false" />

    <!-- Dialog Link -->
    <LinkDialog
      :is-open="showLinkDialog"
      :initial-text="linkDialogInitialText"
      :initial-url="linkDialogInitialUrl"
      :is-editing="linkDialogIsEditing"
      @apply="applyLinkDialog"
      @remove="removeLink"
      @close="showLinkDialog = false"
    />

    <!-- Dialog Page Setup -->
    <div v-if="showPageSetupModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
        <h2 class="text-lg font-bold mb-4">{{ t('editor.pageSetup.title') }}</h2>

        <!-- Paper size -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.paperSize') }}</label>
          <select v-model="pageSetupSize" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs focus:outline-none dark:border-slate-700">
            <option v-for="size in PAGE_SIZES" :key="size.id" :value="size.id">{{ size.name }}</option>
          </select>
        </div>

        <!-- Orientation -->
        <div class="mb-4">
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.orientation') }}</label>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
              :class="pageSetupOrientation === 'portrait' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5'"
              @click="pageSetupOrientation = 'portrait'"
            >
              {{ t('editor.pageSetup.portrait') }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
              :class="pageSetupOrientation === 'landscape' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5'"
              @click="pageSetupOrientation = 'landscape'"
            >
              {{ t('editor.pageSetup.landscape') }}
            </button>
          </div>
        </div>

        <!-- Margins -->
        <div class="mb-6">
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.margins') }}</label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.top') }}</label>
              <input v-model.number="pageSetupMargins.top" type="number" min="0" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.bottom') }}</label>
              <input v-model.number="pageSetupMargins.bottom" type="number" min="0" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.left') }}</label>
              <input v-model.number="pageSetupMargins.left" type="number" min="0" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.right') }}</label>
              <input v-model.number="pageSetupMargins.right" type="number" min="0" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5" @click="showPageSetupModal = false">
            {{ t('editor.pageSetup.cancel') }}
          </button>
          <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" @click="applyPageSetup">
            {{ t('editor.pageSetup.apply') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-editor__paper {
  background-color: #ffffff !important;
  border-radius: 4px;
}
:global(.dark) .docs-editor__paper {
  background-color: #1e293b !important;
}
</style>
