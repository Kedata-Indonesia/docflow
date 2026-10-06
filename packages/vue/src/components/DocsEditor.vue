<script setup lang="ts">
import { type DocsEditor, type DocsEditorPlugin, type EditorOptions, type ImageUploadHandler, type CitationPort, type CslItemData, type AIStreamFn, type AIDraftFn } from '@kedata-indonesia/docflow-core'
import { PAGE_SIZES, getPageSize } from '@kedata-indonesia/docflow-layout-engine'
import { useVirtualPages } from '../composables/useVirtualPages.js'
import { useFootnotes } from '../composables/useFootnotes.js'
import { useEditCommands } from '../composables/useEditCommands.js'
import { usePageSetup } from '../composables/usePageSetup.js'
import { useHeaderFooter } from '../composables/useHeaderFooter.js'
import { useHeaderEdit } from '../composables/useHeaderEdit.js'
import { useDocumentModel } from '../composables/useDocumentModel.js'
import { useCitations } from '../composables/useCitations.js'
import { useCommentAnchors } from '../composables/useCommentAnchors.js'
import { useBubbleMenu } from '../composables/useBubbleMenu.js'
import VirtualPageOverlay from './VirtualPageOverlay.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEditor } from '../composables/useEditor.js'
import SlashMenuVue from './SlashMenu.vue'
import type { Collaborator, CommentItem, ConnectionState, DocumentMeta, DocumentSnapshot, SidebarKey } from '../types.js'
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
    /**
     * Enable the debug overlay (CPU + RAM monitor) pinned to the bottom-right
     * corner of the viewport. Pure debug view — never touches document state.
     * Defaults to `false`, so production consumers are unaffected.
     */
    debug?: boolean
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
    /** Page orientation: 'portrait' or 'landscape'. Persisted by the host. */
    orientation?: 'portrait' | 'landscape'
    /** Page margins in points. Persisted by the host. */
    margins?: { top: number; bottom: number; left: number; right: number }
    /** Distance from the paper edge to the header/footer content, in cm. */
    headerMarginCm?: number
    footerMarginCm?: number
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
    debug: false,
    comments: () => [],
    selectedTextSnippet: '',
    selectedTextIndex: undefined,
    snapshots: () => [],
    activePreviewIndex: null,
    orientation: 'portrait',
    margins: () => ({ top: 94, bottom: 94, left: 94, right: 94 }),
    headerMarginCm: 0.5,
    footerMarginCm: 0.5,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: object]
  'update:title': [title: string]
  'update:pageSize': [pageSize: string]
  'update:orientation': [orientation: 'portrait' | 'landscape']
  'update:margins': [margins: { top: number; bottom: number; left: number; right: number }]
  'update:header-footer-margins': [margins: { headerMarginCm: number; footerMarginCm: number }]
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
  // Issue #133 — orphaned comment threads. The sidebar re-emits a
  // delete request for threads whose anchored text is gone; the host
  // owns the REST surface (the existing DELETE endpoint + the
  // `comment:deleted` WS broadcast handles peer fan-out).
  'delete-comment': [threadId: string]
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

const margins = ref({ top: props.margins?.top ?? 94, bottom: props.margins?.bottom ?? 94, left: props.margins?.left ?? 94, right: props.margins?.right ?? 94 })

const orientation = ref<'portrait' | 'landscape'>(props.orientation ?? 'portrait')

const pageSizeId = ref(props.pageSize ?? 'a4')
const isPageless = ref(props.pageless ?? false)

watch(() => props.orientation, (v) => {
  if (v !== undefined) orientation.value = v
})

watch(() => props.margins, (v) => {
  if (v !== undefined) margins.value = { ...v }
})

const resolvedLayoutOptions = computed(() => {
  const size = getPageSize(pageSizeId.value) ?? PAGE_SIZES[0]
  let w = size.pageWidth
  let h = size.pageHeight
  if (orientation.value === 'landscape') {
    ;[w, h] = [h, w]
  }
  return { pageHeight: h, pageWidth: w, margins: { ...margins.value } }
})

const paperMaxWidth = computed(() => `${resolvedLayoutOptions.value.pageWidth}px`)

const { isDark } = useTheme()

// Experimental: virtual page overlay flag. Must be defined early — referenced
// by paginationOptions computed (below) to disable PaginationPlus when active.
// Pageless wins: a pageless surface has no page frames to overlay.
const useVirtual = computed(() => props.virtualPages === true && !isPageless.value)

const paginationOptions = computed(() => ({
  enabled: !isPageless.value && !useVirtual.value,
  pageHeight: resolvedLayoutOptions.value.pageHeight,
  pageWidth: resolvedLayoutOptions.value.pageWidth,
  marginTop: resolvedLayoutOptions.value.margins.top,
  marginBottom: resolvedLayoutOptions.value.margins.bottom,
  marginLeft: resolvedLayoutOptions.value.margins.left,
  marginRight: resolvedLayoutOptions.value.margins.right,
  contentMarginTop: 0,
  contentMarginBottom: 0,
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

// ─── Document model ───────────────────────────────────────────────────────────
// Created first: the editor, header/footer and edit-command composables all
// consume the active tab content / persistence port it owns. Header/footer
// slots live on a composable created later, so they are read lazily.
const {
  initialDoc,
  tabContents,
  activeTabId,
  activeTabContent,
  wordCount,
  charCount,
  savingStatus,
  lastSaved,
  saveTimer,
  persistCurrentDoc,
  updateCounts,
  slashCommands,
} = useDocumentModel({
  modelValue: props.modelValue,
  getPlugins: () => props.plugins,
  emit,
  getHeaderFooter: () => ({
    headerLeft: userHeaderLeft.value,
    headerRight: userHeaderRight.value,
    footerLeft: userFooterLeft.value,
    footerRight: userFooterRight.value,
  }),
  getEditor: () => editor.value,
})

const activeSidebar = ref<SidebarKey | null>(null)
// View menu toggles — ruler visibility persists across sessions, focus mode does not.
// Guarded for SSR / environments without Web Storage (Node >= 26 exposes no
// `localStorage` unless started with `--localstorage-file`).
const showRuler = ref(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('docflow:view:showRuler') !== 'false'
    : true,
)
const focusMode = ref(false)
watch(showRuler, (next) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('docflow:view:showRuler', next ? 'true' : 'false')
  }
})
// ─── References / citations (Phase 6B) ────────────────────────────────────────
// The host seeds the reference library through the CitationPort; the editor
// then owns a live copy so sidebar CRUD re-renders citations immediately.
// Hosts that persist (apps/web) listen to `citation-sources-change`. The
// editor and plugin actions are created below, so they are read lazily.
const {
  citationSources,
  citationStyleId,
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
} = useCitations({
  getEditor: () => editor.value,
  getPluginActions: () => pluginActions.value,
  getCitation: () => props.citation,
  emit,
  t,
  activeSidebar,
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
    debug: props.debug,
  getPageMap: () => new Map(),
  paginationOptions: paginationOptions.value,
  onUpdate: (json) => {
    tabContents.value[activeTabId.value] = json
    persistCurrentDoc()
  },
})

// ─── Comment anchors (Issue #133) ─────────────────────────────────────────────
// The scan walks ProseMirror `comment` marks, so it is wired here and triggered
// from the `transaction` listener further down.
const { orphanedCommentIds, scheduleCommentAnchorScan } = useCommentAnchors({
  editor,
  isReady,
  getCollaboration: () => props.collaboration,
  getComments: () => props.comments ?? [],
})

// ─── Bubble menu ──────────────────────────────────────────────────────────────
const {
  showBubbleMenu,
  bubblePosition,
  updateBubbleMenu,
  computeBubblePosition,
} = useBubbleMenu({ editor })
// Kept as a top-level binding: the DocsEditor tests drive the anchor math
// directly through `wrapper.vm.computeBubblePosition()`.
void computeBubblePosition

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

// ─── Page Setup ───────────────────────────────────────────────────────────────

const {
  showPageSetupModal,
  pageSetupSize,
  pageSetupOrientation,
  pageSetupMarginsCm,
  PAGE_MARGIN_CM_MIN,
  PAGE_MARGIN_CM_MAX,
  openPageSetupModal,
  applyPageSetup,
} = usePageSetup({
  pageSizeId,
  orientation,
  margins,
  onUpdatePageSize: (value) => emit('update:pageSize', value),
  onUpdateOrientation: (value) => emit('update:orientation', value),
  onUpdateMargins: (value) => emit('update:margins', value),
})

// ─── Header / footer ──────────────────────────────────────────────────────────
// Page-numbering settings live on the component (tests read them through
// `wrapper.vm`); the composable mutates them through this bundle so the
// document view stays the single source of truth.
const pageNumberPosition = ref<'header' | 'footer'>('header')
const showPageNumberOnFirstPage = ref(true)
const pageNumberMode = ref<'startAt' | 'continue'>('startAt')
const pageNumberStartAt = ref(1)

const {
  userHeaderLeft,
  userHeaderRight,
  userFooterLeft,
  userFooterRight,
  isDifferentFirstPage,
  isDifferentOddEven,
  userFirstPageHeaderLeft,
  userFirstPageHeaderRight,
  userEvenPageHeaderLeft,
  headerMarginCm,
  footerMarginCm,
  showHeaderFormatModal,
  draftHeaderMarginCm,
  draftFooterMarginCm,
  draftDifferentFirstPage,
  draftDifferentOddEven,
  showPageNumberModal,
  draftPageNumberPosition,
  draftShowPageNumberOnFirstPage,
  draftPageNumberMode,
  draftPageNumberStartAt,
  showFooterModal,
  footerLeftInput,
  footerRightInput,
  HEADER_MARGIN_CM_MIN,
  HEADER_MARGIN_CM_MAX,
  HEADER_MARGIN_CM_STEP,
  applyHeaderFooter,
  openHeaderFormatModal,
  applyHeaderFormat,
  openPageNumberModal,
  applyPageNumberSettings,
  openFooterModal,
  saveFooter,
} = useHeaderFooter({
  editor,
  isReady,
  pageCount,
  isDark,
  initialContent: {
    headerLeft: initialDoc.headerLeft ?? '',
    headerRight: initialDoc.headerRight ?? '',
    footerLeft: initialDoc.footerLeft ?? '',
    footerRight: initialDoc.footerRight ?? '',
  },
  headerMarginCmProp: computed(() => props.headerMarginCm),
  footerMarginCmProp: computed(() => props.footerMarginCm),
  pageNumber: {
    position: pageNumberPosition,
    showOnFirstPage: showPageNumberOnFirstPage,
    mode: pageNumberMode,
    startAt: pageNumberStartAt,
  },
  persistCurrentDoc,
  onUpdatePageCount: (value) => emit('update:pageCount', value),
  onUpdateHeaderFooterMargins: (value) => emit('update:header-footer-margins', value),
})

// ─── Inline header editing ────────────────────────────────────────────────────

const { startInlineHeaderEdit, finishHeaderEdit } = useHeaderEdit({
  editor,
  scrollContainerRef,
  t,
  isDifferentFirstPage,
  isDifferentOddEven,
  userHeaderLeft,
  userHeaderRight,
  userFirstPageHeaderLeft,
  userFirstPageHeaderRight,
  userEvenPageHeaderLeft,
  applyHeaderFooter,
  persistCurrentDoc,
  openHeaderFormatModal,
  openPageNumberModal,
})

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
      // Issue #133 — re-scan the doc for `comment` marks so threads
      // whose anchored text was deleted are flagged orphaned. Debounced
      // (~200 ms) so rapid keystrokes/merges don't thrash the walk.
      scheduleCommentAnchorScan()
    })
    updateBubbleMenu()
    updateCounts()
    updatePageStats()
    // Initial scan once the editor is ready. In collab mode this is a
    // no-op (guarded) until the Yjs doc has synced; in local mode it
    // flags orphans immediately against the seeded content.
    scheduleCommentAnchorScan()
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
  finishHeaderEdit(false)
  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (scrollTimeout) clearTimeout(scrollTimeout)
})


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
// ─── Edit / Format menu commands ─────────────────────────────────────────────

const { editFormatMenuCommands } = useEditCommands({
  editor,
  pluginActions,
  focusMode,
  showFindReplace,
  userHeaderRight,
  userFooterRight,
  applyHeaderFooter,
  persistCurrentDoc,
})

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
  } else if (action === 'new-help-me-create') {
    toggleSidebar('ai')
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

const { updateFootnotes } = useFootnotes({
  editor,
  editorRef,
  isReady,
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
          <div class="relative w-full" :style="{ maxWidth: paperMaxWidth }">
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
        :orphaned-ids="orphanedCommentIds"
        @close="activeSidebar = null"
        @add-comment="(c, t, i) => $emit('add-comment', c, t, i)"
        @add-reply="(id, c) => $emit('add-reply', id, c)"
        @resolve-comment="(id) => $emit('resolve-comment', id)"
        @delete-comment="(id) => $emit('delete-comment', id)"
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
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
                {{ t('editor.headerFooter.headerTopMargin') }} (cm)
              </label>
              <input v-model.number="draftHeaderMarginCm" type="number" :min="HEADER_MARGIN_CM_MIN" :max="HEADER_MARGIN_CM_MAX" :step="HEADER_MARGIN_CM_STEP" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
            </div>
            <div>
              <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
                {{ t('editor.headerFooter.footerBottomMargin') }} (cm)
              </label>
              <input v-model.number="draftFooterMarginCm" type="number" :min="HEADER_MARGIN_CM_MIN" :max="HEADER_MARGIN_CM_MAX" :step="HEADER_MARGIN_CM_STEP" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
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
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.margins') }} (cm)</label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.top') }}</label>
              <input v-model.number="pageSetupMarginsCm.top" type="number" :min="PAGE_MARGIN_CM_MIN" :max="PAGE_MARGIN_CM_MAX" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.bottom') }}</label>
              <input v-model.number="pageSetupMarginsCm.bottom" type="number" :min="PAGE_MARGIN_CM_MIN" :max="PAGE_MARGIN_CM_MAX" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.left') }}</label>
              <input v-model.number="pageSetupMarginsCm.left" type="number" :min="PAGE_MARGIN_CM_MIN" :max="PAGE_MARGIN_CM_MAX" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
            </div>
            <div>
              <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.right') }}</label>
              <input v-model.number="pageSetupMarginsCm.right" type="number" :min="PAGE_MARGIN_CM_MIN" :max="PAGE_MARGIN_CM_MAX" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
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
