<script setup lang="ts">
import { PAGE_SIZES } from '@kedata-indonesia/docflow-layout-engine'
import { useDocsEditorPageSurface } from '../composables/useDocsEditorPageSurface.js'
import { useEditorZoom } from '../composables/useEditorZoom.js'
import { useZoomSurface } from '../composables/useZoomSurface.js'
import { useRulerSync } from '../composables/useRulerSync.js'
import { useDocsEditorSession } from '../composables/useDocsEditorSession.js'
import { useDocsEditorHeaderFooterState } from '../composables/useDocsEditorHeaderFooterState.js'
import { useDocsEditorPaging } from '../composables/useDocsEditorPaging.js'
import { useDocsEditorBootstrap } from '../composables/useDocsEditorBootstrap.js'
import { useFootnotes } from '../composables/useFootnotes.js'
import { useSuggestions } from '../composables/useSuggestions.js'
import { useEditCommands } from '../composables/useEditCommands.js'
import { useDocsEditorMenu } from '../composables/useDocsEditorMenu.js'
import { useTableMenu } from '../composables/useTableMenu.js'
import { useDocsEditorLocale } from '../composables/useDocsEditorLocale.js'
import { useDocsEditorMode, useDocsEditorSuggestSync } from '../composables/useDocsEditorMode.js'
import SlashMenuVue from './SlashMenu.vue'
import BubbleMenu from './BubbleMenu.vue'
import TableMenu from './TableMenu.vue'
import StatusBar from './StatusBar.vue'
import RulerBar from './RulerBar.vue'
import TOCSidebar from './sidebars/TOCSidebar.vue'
import DocsEditorSidebars from './DocsEditorSidebars.vue'
import DocsEditorDialogs from './DocsEditorDialogs.vue'
import DocsEditorPaper from './docsEditor/DocsEditorPaper.vue'
import DocsEditorTopBar from './docsEditor/DocsEditorTopBar.vue'
import FindReplaceDialog from './FindReplaceDialog.vue'
import { Menu } from 'lucide-vue-next'
import { provideTheme } from '../composables/useTheme.js'
import { docsEditorPropDefaults, type DocsEditorEmits, type DocsEditorProps } from './docsEditorContracts.js'
import type { ReferencesSidebarSlotProps } from '../types.js'
import type { HeaderFooterValues } from '../composables/useDocumentModel.js'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<DocsEditorProps>(), docsEditorPropDefaults)

const emit = defineEmits<DocsEditorEmits>()

// Issue #375 — an explicit `theme` scopes dark mode to this editor instance and
// classes its root, so it works inside Shadow DOM; without it the legacy
// document-level theme keeps working unchanged.
const theme = provideTheme(() => props.theme)

// Provide locale context for all editor chrome components.
const { t } = useDocsEditorLocale(
  () => props.locale,
  (locale) => emit('update:locale', locale),
)

// ─── Page surface: size / orientation / margins → layout + pagination ────────
const {
  margins, orientation, pageSizeId, isPageless, resolvedLayoutOptions, paperMaxWidth, isDark, useVirtual,
  paginationOptions,
} = useDocsEditorPageSurface({
  getOrientation: () => props.orientation,
  getMargins: () => props.margins,
  getPageSize: () => props.pageSize,
  getPageless: () => props.pageless,
  getVirtualPages: () => props.virtualPages,
  // Header/footer interactions are created further down; read them lazily.
  getStartInlineHeaderEdit: () => startInlineHeaderEdit,
  getStartInlineFooterEdit: () => startInlineFooterEdit,
}, theme)

// ─── Document mode (#27/#28) ─────────────────────────────────────────────────
const { documentMode, effectiveEditable, hasCitationPlugin, setDocumentMode } = useDocsEditorMode({
  getMode: () => props.mode,
  getEditable: () => props.editable,
  getPlugins: () => props.plugins,
  emitMode: (mode) => emit('update:mode', mode),
})

// ─── Editor session: document model → editor → citations → bubble / link ─────
const {
  initialDoc, persistCurrentDoc, updateCounts, saveTimer, slashCommands, wordCount, charCount, savingStatus,
  lastSaved, activeSidebar, showRuler, focusMode, scrollContainerRef, handleScroll, toggleSidebar, handlePrint,
  citationSources, citationStyleId, citationStyles, pendingSourceRequest, handleSourceCreate, handleSourceUpdate,
  handleSourceRemove, handleCitationStyleChange, handleStyleRemove, handleReferenceInsert, importBusy, importMessage,
  canImportSources, handleImportDoi, handleImportBibliography, styleImportMessage, handleStyleImport,
  editorRef, editor, pluginActions, isReady,
  docEditor, orphanedCommentIds, scheduleCommentAnchorScan, showBubbleMenu, bubblePosition, updateBubbleMenu,
  computeBubblePosition, showLinkDialog, linkDialogInitialText, linkDialogInitialUrl, linkDialogIsEditing,
  openLinkDialog, applyLinkDialog, removeLink,
} = useDocsEditorSession({
  emit,
  t,
  getModelValue: () => props.modelValue,
  // Header/footer slots are applied by the composable created below; the
  // closure only runs when the host writes a tabbed document.
  applyHeaderFooter: (values) => applyHeaderFooterValues(values),
  getPlugins: () => props.plugins,
  // A computed ref so `useEditor`'s editable watch stays live — passing the
  // plain `props.editable` snapshot froze the editor's editable state at mount.
  editable: effectiveEditable,
  collaboration: props.collaboration, onImageUpload: props.onImageUpload, getCitation: () => props.citation,
  aiStream: props.aiStream, aiDraft: props.aiDraft, debug: props.debug,
  getComments: () => props.comments ?? [], getCollaboration: () => props.collaboration,
  paginationOptions: paginationOptions.value,
  // Header/footer slots are created below; read lazily so persistence always
  // snapshots the current values.
  getHeaderFooter: () => ({
    headerLeft: userHeaderLeft.value, headerRight: userHeaderRight.value,
    footerLeft: userFooterLeft.value, footerRight: userFooterRight.value,
  }),
})

// Push the mode + author into the suggestChanges plugin once the editor exists.
useDocsEditorSuggestSync({
  isReady,
  getDocumentMode: () => documentMode.value,
  getEditor: () => editor.value,
  getUserName: () => props.userName,
})

const pageCount = ref(1)
const currentPage = ref(1)

// ─── Zoom (issue #144) ───────────────────────────────────────────────────────
// Visual scale on a wrapper around the paper: the layout (and pagination) stays
// at 100 %, `--docflow-zoom` lets the pagination patch normalize its rect math.
const { zoom, scale, disabled: zoomDisabled, setZoom } = useEditorZoom({
  getZoom: () => props.zoom,
  isVirtual: () => useVirtual.value,
  emit: (value) => emit('update:zoom', value),
})
const {
  surfaceRef: zoomSurfaceRef,
  outerStyle: zoomOuterStyle,
  innerStyle: zoomInnerStyle,
} = useZoomSurface(scale)
const rulerRef = ref<HTMLElement | null>(null)
const { pageLeft: rulerPageLeft, pageWidth: rulerPageWidth } = useRulerSync({
  rulerRef,
  paperRef: zoomSurfaceRef,
  scrollRef: scrollContainerRef,
  watchSource: () => `${zoom.value}:${pageSizeId.value}:${orientation.value}:${isPageless.value}`,
})

/**
 * Element refs handed to the page surface. A plain bundle object: refs passed
 * directly from a template are unwrapped, which would leave the child with
 * `null` instead of the shared `Ref` the composables above read.
 */
const paperRefs = {
  scroll: scrollContainerRef,
  surface: zoomSurfaceRef,
  editor: editorRef,
}

// Document details must reflect the document currently open in the editor.
// Word/char/page counts already live in the editor (the same values the status
// bar uses); the host-supplied meta still provides title/owner/folder/dates.
const detailsMeta = computed(() => {
  if (!props.documentMeta) return undefined
  return {
    ...props.documentMeta,
    wordCount: wordCount.value,
    charCount: charCount.value,
    pageCount: pageCount.value,
  }
})

// Host-supplied `#references-sidebar` slot (issue #22). Evaluated inline in the
// template (`$slots`) rather than cached: `useSlots()` does not invalidate a
// computed, so a plain `computed(() => slots['references-sidebar'])` would keep
// the mount-time value and ignore a host that adds the slot later.

// Public slot surface — typed so hosts get `vue-tsc`/IDE completion and the
// scoped props of `#references-sidebar` (ReferencesSidebarSlotProps) are
// checked. These are the only slots `DocsEditor` forwards.
defineSlots<{
  'header-actions'?: () => unknown
  'overflow-actions'?: (props: { close: () => void }) => unknown
  'user-menu'?: (props: { close: () => void }) => unknown
  'references-sidebar'?: (props: ReferencesSidebarSlotProps) => unknown
}>()

// ─── Page numbering + header / footer ────────────────────────────────────────
// Page-numbering settings live on the component (tests read them through
// `wrapper.vm`); the composable mutates them through this bundle so the
// document view stays the single source of truth.
const pageNumberPosition = ref<'header' | 'footer'>('header')
const showPageNumberOnFirstPage = ref(true)
const pageNumberMode = ref<'startAt' | 'continue'>('startAt')
const pageNumberStartAt = ref(1)

const {
  userHeaderLeft, userHeaderRight, userFooterLeft, userFooterRight, isDifferentFirstPage, isDifferentOddEven,
  userFirstPageHeaderLeft, userEvenPageHeaderLeft,
  headerMarginCm, footerMarginCm, showHeaderFormatModal,
  draftHeaderMarginCm, draftFooterMarginCm, draftDifferentFirstPage, draftDifferentOddEven, showPageNumberModal,
  draftPageNumberPosition, draftShowPageNumberOnFirstPage, draftPageNumberMode, draftPageNumberStartAt,
  HEADER_MARGIN_CM_MIN, HEADER_MARGIN_CM_MAX,
  HEADER_MARGIN_CM_STEP, applyHeaderFooter, openHeaderFormatModal, applyHeaderFormat, openPageNumberModal,
  applyPageNumberSettings, startInlineHeaderEdit, startInlineFooterEdit, finishHeaderEdit,
} = useDocsEditorHeaderFooterState({
  editor, isReady, pageCount, isDark, initialDoc, persistCurrentDoc, emit, scrollContainerRef, t,
  getHeaderMarginCm: () => props.headerMarginCm, getFooterMarginCm: () => props.footerMarginCm,
  pageNumber: {
    position: pageNumberPosition, showOnFirstPage: showPageNumberOnFirstPage,
    mode: pageNumberMode, startAt: pageNumberStartAt,
  },
})

/**
 * Paint the header/footer slots carried by a host-written tabbed document
 * (issue #370). Wired lazily into the model sync, which runs after mount.
 */
const applyHeaderFooterValues = (values: HeaderFooterValues) => {
  userHeaderLeft.value = values.headerLeft
  userHeaderRight.value = values.headerRight
  userFooterLeft.value = values.footerLeft
  userFooterRight.value = values.footerRight
  applyHeaderFooter()
}

// ─── Page setup + virtual pages + page statistics ────────────────────────────
const {
  showPageSetupModal, pageSetupSize, pageSetupOrientation, pageSetupMarginsCm, PAGE_MARGIN_CM_MIN,
  PAGE_MARGIN_CM_MAX, openPageSetupModal, applyPageSetup, virtualData, virtualReady, updatePageStats,
  applyPageless,
} = useDocsEditorPaging({
  emit, pageSizeId, orientation, margins, resolvedLayoutOptions, useVirtual, paginationOptions, isPageless,
  pageCount, currentPage, editor, isReady, scrollContainerRef, userHeaderLeft, userHeaderRight,
  userFooterLeft, userFooterRight,
  // Footnotes are created last; read lazily.
  getUpdateFootnotes: () => updateFootnotes(),
  getPagelessProp: () => props.pageless,
  getZoomScale: () => scale.value,
})

/**
 * Issue #295 — the ruler's margin markers write the same `margins` ref the Page Setup
 * dialog uses, so the paper re-lays out live (usePageStats watches
 * `resolvedLayoutOptions`) and the two controls cannot disagree.
 */
function applyRulerMargins(next: { top: number; bottom: number; left: number; right: number }) {
  margins.value = { ...next }
  emit('update:margins', { ...next })
}

// ─── Table edit menu (#146) ──────────────────────────────────────────────────
const { showTableMenu, tableMenuPosition, updateTableMenu } = useTableMenu({ editor, scrollContainerRef })

// ─── Ready hook + lifecycle cleanup ──────────────────────────────────────────
useDocsEditorBootstrap({
  isReady, editor, docEditor, userHeaderLeft, userHeaderRight, userFooterLeft, userFooterRight, headerMarginCm,
  footerMarginCm, applyHeaderFooter, startInlineHeaderEdit, startInlineFooterEdit, updateBubbleMenu, updateTableMenu, updatePageStats,
  updateCounts, scheduleCommentAnchorScan, openLinkDialog, emit, finishHeaderEdit, saveTimer,
  getCollaboration: () => props.collaboration,
  getZoomScale: () => scale.value,
})

const showDetailsModal = ref(false)
const showEmailModal = ref(false)
const showFindReplace = ref(false)

// ─── Edit / Format menu commands ─────────────────────────────────────────────
const { editFormatMenuCommands } = useEditCommands({
  editor, pluginActions, focusMode, showFindReplace, userHeaderRight, userFooterRight,
  applyHeaderFooter, persistCurrentDoc,
})

const { menuClick } = useDocsEditorMenu({
  editor, focusMode, showFindReplace, editFormatMenuCommands, isPageless, showRuler, activeSidebar,
  getUpdateFootnotes: () => updateFootnotes(), openPageSetupModal, handlePrint, toggleSidebar,
  startInlineHeaderEdit, startInlineFooterEdit, openLinkDialog, applyPageless, showDetailsModal, showEmailModal,
  documentMode, onDocumentMode: setDocumentMode,
  onShare: () => emit('share'), onMenuClick: (action) => emit('menu-click', action),
})

// ─── Footnote (Catatan Kaki) ──────────────────────────────────────────────────
const { updateFootnotes } = useFootnotes({
  editor,
  editorRef,
  isReady,
  pageCount,
})

// Track-changes suggestions (issues #27/#28, P2) — review sidebar state.
const {
  suggestions,
  accept: acceptSuggestion,
  reject: rejectSuggestion,
  acceptAll: acceptAllSuggestions,
  rejectAll: rejectAllSuggestions,
} = useSuggestions({ getEditor: () => editor.value, isReady })

// Test-facing bindings: the DocsEditor tests drive these directly through
// `wrapper.vm`, so they stay top-level even though the component itself only
// reaches them through the composables above.
void computeBubblePosition
void [isDifferentFirstPage, isDifferentOddEven, userFirstPageHeaderLeft, userEvenPageHeaderLeft]
void [openHeaderFormatModal, openPageNumberModal]
</script>

<template>
  <div
    class="docs-editor flex h-screen w-full flex-col overflow-hidden bg-slate-50 transition-colors dark:bg-[#02040a]"
    :class="{ dark: isDark }"
  >
    <DocsEditorTopBar
      v-model:focus-mode="focusMode"
      :title="title" :editable="editable" :collaborators="collaborators" :starred="starred"
      :user-name="userName" :user-avatar="userAvatar"
      :pageless="isPageless" :outline-open="activeSidebar === 'toc'" :show-ruler="showRuler"
      :mode="documentMode" :has-citation-plugin="hasCitationPlugin"
      :unimplemented-actions="unimplementedActions"
      :actions="pluginActions" :plugins="plugins" :editor="editor"
      :active-sidebar="activeSidebar" :zoom="zoom" :zoom-disabled="zoomDisabled"
      @menu-click="menuClick" @back="$emit('back')" @update:title="$emit('update:title', $event)"
      @toggle-star="$emit('toggle-star')" @export="$emit('export', $event)" @share="$emit('share')"
      @toggle-sidebar="toggleSidebar" @print="handlePrint" @update:zoom="setZoom"
    >
      <template #header-actions><slot name="header-actions" /></template>
      <template #overflow-actions="slotProps"><slot name="overflow-actions" v-bind="slotProps" /></template>
      <template #user-menu="slotProps"><slot name="user-menu" v-bind="slotProps" /></template>
    </DocsEditorTopBar>
    <div v-if="showRuler && !focusMode" ref="rulerRef" class="w-full flex-shrink-0">
      <RulerBar
        :layout-options="resolvedLayoutOptions"
        :zoom="zoom"
        :page-left-px="rulerPageLeft"
        :page-width-px="rulerPageWidth"
        @update:margins="applyRulerMargins"
      />
    </div>
    <BubbleMenu :visible="showBubbleMenu" :actions="pluginActions" :position="bubblePosition" :editor="editor" />
    <TableMenu :editor="editor" :position="showTableMenu ? tableMenuPosition : null" />
    <SlashMenuVue :editor="editor" :commands="slashCommands" />
    <div class="docs-editor__body relative flex flex-1 overflow-hidden">
      <!-- Find & replace floating panel (Edit menu / ⌘⇧H) -->
      <FindReplaceDialog :is-open="showFindReplace" :editor="editor" @close="showFindReplace = false" />

      <!-- Document outline (heading map) — toggled by the floating button -->
      <TOCSidebar v-if="activeSidebar === 'toc'" :editor="editor" @close="activeSidebar = null" />

      <!-- Floating toggle shown when the outline is collapsed -->
      <button
        v-else type="button"
        class="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#0e1525] dark:text-slate-300 dark:hover:bg-white/5"
        :title="t('editor.showOutline')"
        :aria-label="t('editor.showOutline')"
        @click="toggleSidebar('toc')"
      >
        <Menu class="h-5 w-5" />
      </button>

      <DocsEditorPaper
        :element-refs="paperRefs"
        :outer-style="zoomOuterStyle" :inner-style="zoomInnerStyle"
        :paper-max-width="paperMaxWidth"
        :show-ruler="showRuler" :focus-mode="focusMode"
        :layout-options="resolvedLayoutOptions" :zoom="zoom"
        :use-virtual="useVirtual" :virtual-data="virtualData" :virtual-ready="virtualReady"
        :is-ready="isReady"
        @scroll="handleScroll"
      />

      <!-- Right-hand sidebar stack: references / comments / history / AI chat.
           The child gates each sidebar with a v-if, so the rendered node list
           matches the pre-extraction component tree. -->
      <DocsEditorSidebars
        :active-sidebar="activeSidebar" :editor="editor" :citation-sources="citationSources"
        :citation-style-id="citationStyleId" :citation-styles="citationStyles" :pending-source-request="pendingSourceRequest"
        :can-import-sources="canImportSources" :import-busy="importBusy" :import-message="importMessage"
        :style-import-message="styleImportMessage"
        :has-references-sidebar-slot="Boolean($slots['references-sidebar'])"
        :comments="props.comments" :selected-text-snippet="props.selectedTextSnippet"
        :selected-text-index="props.selectedTextIndex" :orphaned-comment-ids="orphanedCommentIds"
        :snapshots="props.snapshots" :active-preview-index="props.activePreviewIndex"
        :ai-stream="props.aiStream" :ai-draft="props.aiDraft"
        :suggestions="suggestions" :can-review-suggestions="props.canReviewSuggestions"
        :confirm-destructive="props.confirmDestructive"
        @close="activeSidebar = null" @insert="handleReferenceInsert" @create="handleSourceCreate"
        @update="handleSourceUpdate" @remove="handleSourceRemove"
        @update:style="handleCitationStyleChange" @remove-style="handleStyleRemove" @import-doi="handleImportDoi"
        @import-bibliography="handleImportBibliography" @import-style="handleStyleImport"
        @add-comment="(c, t, i) => $emit('add-comment', c, t, i)"
        @add-reply="(id, c) => $emit('add-reply', id, c)" @resolve-comment="(id) => $emit('resolve-comment', id)"
        @delete-comment="(id) => $emit('delete-comment', id)"
        @save-snapshot="(name) => $emit('save-snapshot', name)"
        @restore-snapshot="(idx) => $emit('restore-snapshot', idx)"
        @preview-snapshot="(s) => $emit('preview-snapshot', s)"
        @accept-suggestion="acceptSuggestion"
        @reject-suggestion="rejectSuggestion"
        @accept-all-suggestions="acceptAllSuggestions"
        @reject-all-suggestions="rejectAllSuggestions"
      ><template #references-sidebar="slotProps"><slot name="references-sidebar" v-bind="slotProps" /></template></DocsEditorSidebars>
    </div>
    <StatusBar
      v-if="!focusMode"
      :connection-state="connectionState" :saving-status="savingStatus" :last-saved="lastSaved"
      :word-count="wordCount" :char-count="charCount" :page-count="pageCount" :current-page="currentPage"
      :page-size="pageSizeId" :page-sizes="PAGE_SIZES" :pageless="isPageless"
      @update:page-size="pageSizeId = $event; emit('update:pageSize', $event)" />

    <!-- Modal dialogs: footer / header-format / page-number / email / details / link / page-setup -->
    <DocsEditorDialogs
      v-model:header-margin-cm="draftHeaderMarginCm" v-model:footer-margin-cm="draftFooterMarginCm"
      v-model:different-first-page="draftDifferentFirstPage" v-model:different-odd-even="draftDifferentOddEven"
      v-model:page-number-position="draftPageNumberPosition"
      v-model:show-page-number-on-first-page="draftShowPageNumberOnFirstPage"
      v-model:page-number-mode="draftPageNumberMode" v-model:page-number-start-at="draftPageNumberStartAt"
      v-model:paper-size="pageSetupSize" v-model:orientation="pageSetupOrientation"
      v-model:margin-top="pageSetupMarginsCm.top" v-model:margin-bottom="pageSetupMarginsCm.bottom"
      v-model:margin-left="pageSetupMarginsCm.left" v-model:margin-right="pageSetupMarginsCm.right"
      :show-header-format-modal="showHeaderFormatModal"
      :show-page-number-modal="showPageNumberModal" :show-email-modal="showEmailModal"
      :show-details-modal="showDetailsModal" :show-link-dialog="showLinkDialog"
      :show-page-setup-modal="showPageSetupModal"
      :header-margin-min="HEADER_MARGIN_CM_MIN" :header-margin-max="HEADER_MARGIN_CM_MAX"
      :header-margin-step="HEADER_MARGIN_CM_STEP" :page-margin-min="PAGE_MARGIN_CM_MIN"
      :page-margin-max="PAGE_MARGIN_CM_MAX"
      :document-title="props.title" :share-url="props.shareUrl" :document-meta="detailsMeta"
      :link-dialog-initial-text="linkDialogInitialText" :link-dialog-initial-url="linkDialogInitialUrl"
      :link-dialog-is-editing="linkDialogIsEditing"
      @close-header-format="showHeaderFormatModal = false"
      @close-page-number="showPageNumberModal = false" @close-email="showEmailModal = false"
      @close-details="showDetailsModal = false" @close-link="showLinkDialog = false"
      @close-page-setup="showPageSetupModal = false"
      @apply-header-format="applyHeaderFormat" @apply-page-number="applyPageNumberSettings"
      @apply-link="applyLinkDialog" @remove-link="removeLink" @apply-page-setup="applyPageSetup"
      @share="emit('share')"
    />
  </div>
</template>
