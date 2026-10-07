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
import { useEditorReady } from '../composables/useEditorReady.js'
import { useEditorChrome } from '../composables/useEditorChrome.js'
import { useLinkDialog } from '../composables/useLinkDialog.js'
import { usePageStats } from '../composables/usePageStats.js'
import VirtualPageOverlay from './VirtualPageOverlay.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEditor } from '../composables/useEditor.js'
import SlashMenuVue from './SlashMenu.vue'
import type { Collaborator, CommentItem, ConnectionState, DocumentMeta, DocumentSnapshot } from '../types.js'
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
import FooterDialog from './FooterDialog.vue'
import HeaderFormatDialog from './HeaderFormatDialog.vue'
import PageNumberDialog from './PageNumberDialog.vue'
import PageSetupDialog from './PageSetupDialog.vue'
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

// Chrome state is created before `useCitations` (activeSidebar) and
// `useEditCommands` (focusMode). The editor instance is created later, so it is
// passed as a lazy getter.
const {
  activeSidebar,
  showRuler,
  focusMode,
  scrollContainerRef,
  handleScroll,
  toggleSidebar,
  handlePrint,
} = useEditorChrome({
  getEditor: () => editor.value,
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

const { updatePageStats, applyPageless } = usePageStats({
  editor,
  isReady,
  resolvedLayoutOptions,
  isPageless,
  paginationOptions,
  pageCount,
  currentPage,
  getUpdateFootnotes: () => updateFootnotes(),
  getPagelessProp: () => props.pageless,
  emit,
})

// Consumed by `useEditorReady` below (the ⌘K binding) and the insert-link menu
// action, so it must be created before the ready hook.
const {
  showLinkDialog,
  linkDialogInitialText,
  linkDialogInitialUrl,
  linkDialogIsEditing,
  openLinkDialog,
  applyLinkDialog,
  removeLink,
} = useLinkDialog({ editor })

useEditorReady({
  isReady,
  editor,
  docEditor,
  userHeaderLeft,
  userHeaderRight,
  userFooterLeft,
  userFooterRight,
  headerMarginCm,
  footerMarginCm,
  applyHeaderFooter,
  openFooterModal,
  startInlineHeaderEdit,
  updateBubbleMenu,
  updatePageStats,
  updateCounts,
  scheduleCommentAnchorScan,
  openLinkDialog,
  emit,
})

watch(() => props.collaboration, () => {}, { deep: true })
onUnmounted(() => {
  finishHeaderEdit(false)
  if (saveTimer.value) clearTimeout(saveTimer.value)
})

const showDetailsModal = ref(false)
const showEmailModal = ref(false)
const showFindReplace = ref(false)

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
    <FooterDialog
      v-model:left="footerLeftInput"
      v-model:right="footerRightInput"
      :is-open="showFooterModal"
      @clear="footerLeftInput = ''; footerRightInput = ''"
      @close="showFooterModal = false"
      @save="saveFooter"
    />

    <!-- Dialog Header & Footer Format (Google Docs Style) -->
    <HeaderFormatDialog
      v-model:header-margin-cm="draftHeaderMarginCm"
      v-model:footer-margin-cm="draftFooterMarginCm"
      v-model:different-first-page="draftDifferentFirstPage"
      v-model:different-odd-even="draftDifferentOddEven"
      :is-open="showHeaderFormatModal"
      :margin-min="HEADER_MARGIN_CM_MIN"
      :margin-max="HEADER_MARGIN_CM_MAX"
      :margin-step="HEADER_MARGIN_CM_STEP"
      @close="showHeaderFormatModal = false"
      @apply="applyHeaderFormat"
    />

    <!-- Dialog Nomor Halaman (Google Docs Style) -->
    <PageNumberDialog
      v-model:position="draftPageNumberPosition"
      v-model:show-on-first-page="draftShowPageNumberOnFirstPage"
      v-model:mode="draftPageNumberMode"
      v-model:start-at="draftPageNumberStartAt"
      :is-open="showPageNumberModal"
      @close="showPageNumberModal = false"
      @apply="applyPageNumberSettings"
    />

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
    <PageSetupDialog
      v-model:paper-size="pageSetupSize"
      v-model:orientation="pageSetupOrientation"
      v-model:margin-top="pageSetupMarginsCm.top"
      v-model:margin-bottom="pageSetupMarginsCm.bottom"
      v-model:margin-left="pageSetupMarginsCm.left"
      v-model:margin-right="pageSetupMarginsCm.right"
      :is-open="showPageSetupModal"
      :margin-min="PAGE_MARGIN_CM_MIN"
      :margin-max="PAGE_MARGIN_CM_MAX"
      @close="showPageSetupModal = false"
      @apply="applyPageSetup"
    />
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
