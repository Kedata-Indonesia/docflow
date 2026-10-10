<script setup lang="ts">
import { PAGE_SIZES } from '@kedata-indonesia/docflow-layout-engine'
import { useDocsEditorPageSurface } from '../composables/useDocsEditorPageSurface.js'
import { useDocsEditorSession } from '../composables/useDocsEditorSession.js'
import { useDocsEditorHeaderFooterState } from '../composables/useDocsEditorHeaderFooterState.js'
import { useDocsEditorPaging } from '../composables/useDocsEditorPaging.js'
import { useDocsEditorBootstrap } from '../composables/useDocsEditorBootstrap.js'
import { useFootnotes } from '../composables/useFootnotes.js'
import { useSuggestions } from '../composables/useSuggestions.js'
import { useEditCommands } from '../composables/useEditCommands.js'
import { useDocsEditorMenu } from '../composables/useDocsEditorMenu.js'
import VirtualPageOverlay from './VirtualPageOverlay.vue'
import { computed, ref, watch } from 'vue'
import SlashMenuVue from './SlashMenu.vue'
import HeaderBar from './HeaderBar.vue'
import EditorToolbar from './EditorToolbar.vue'
import BubbleMenu from './BubbleMenu.vue'
import StatusBar from './StatusBar.vue'
import RulerBar from './RulerBar.vue'
import VerticalRuler from './VerticalRuler.vue'
import TOCSidebar from './sidebars/TOCSidebar.vue'
import DocsEditorSidebars from './DocsEditorSidebars.vue'
import DocsEditorDialogs from './DocsEditorDialogs.vue'
import FindReplaceDialog from './FindReplaceDialog.vue'
import { Menu, Minimize2 } from 'lucide-vue-next'
import { provideLocale } from '../composables/useLocale.js'
import { docsEditorPropDefaults, type DocsEditorEmits, type DocsEditorProps } from './docsEditorContracts.js'
import type { ReferencesSidebarSlotProps } from '../types.js'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'

const props = withDefaults(defineProps<DocsEditorProps>(), docsEditorPropDefaults)

const emit = defineEmits<DocsEditorEmits>()

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
  getOpenFooterModal: () => openFooterModal,
})

// ─── Editor session: document model → editor → citations → bubble / link ─────
// Document mode (#27/#28). Controlled: an explicit `mode` prop wins. Uncontrolled:
// the View ▸ Document mode menu drives internal state, so the menu works even
// when the host does not bind `v-model:mode`. `editable === false` maps to
// `viewing` for backwards compatibility.
const internalMode = ref<DocumentMode>('editing')
const documentMode = computed<DocumentMode>(
  () => props.mode ?? (props.editable === false ? 'viewing' : internalMode.value),
)
const effectiveEditable = computed(() =>
  documentMode.value === 'viewing' ? false : (props.editable ?? true),
)
const setDocumentMode = (mode: DocumentMode) => {
  internalMode.value = mode
  emit('update:mode', mode)
}

const {
  initialDoc, persistCurrentDoc, updateCounts, saveTimer, slashCommands, wordCount, charCount, savingStatus,
  lastSaved, activeSidebar, showRuler, focusMode, scrollContainerRef, handleScroll, toggleSidebar, handlePrint,
  citationSources, citationStyleId, pendingSourceRequest, handleSourceCreate, handleSourceUpdate,
  handleSourceRemove, handleCitationStyleChange, handleReferenceInsert, importBusy, importMessage,
  canImportSources, handleImportDoi, handleImportBibliography, editorRef, editor, pluginActions, isReady,
  docEditor, orphanedCommentIds, scheduleCommentAnchorScan, showBubbleMenu, bubblePosition, updateBubbleMenu,
  computeBubblePosition, showLinkDialog, linkDialogInitialText, linkDialogInitialUrl, linkDialogIsEditing,
  openLinkDialog, applyLinkDialog, removeLink,
} = useDocsEditorSession({
  emit, t, modelValue: props.modelValue, getPlugins: () => props.plugins,   // A computed ref so `useEditor`'s editable watch stays live — passing the
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

const pageCount = ref(1)
const currentPage = ref(1)

// Push the mode + author into the suggestChanges plugin (issues #27/#28). The
// plugin is inert in `editing` mode, so this is a no-op for existing hosts.
watch([isReady, documentMode], ([ready, mode]) => {
  if (!ready) return
  editor.value?.commands.setDocumentMode?.(mode)
})
watch([isReady, () => props.userName], ([ready, name]) => {
  if (!ready) return
  editor.value?.commands.setSuggestionAuthor?.({ name: name ?? null })
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
  userFirstPageHeaderLeft, userEvenPageHeaderLeft, headerMarginCm, footerMarginCm, showHeaderFormatModal,
  draftHeaderMarginCm, draftFooterMarginCm, draftDifferentFirstPage, draftDifferentOddEven, showPageNumberModal,
  draftPageNumberPosition, draftShowPageNumberOnFirstPage, draftPageNumberMode, draftPageNumberStartAt,
  showFooterModal, footerLeftInput, footerRightInput, HEADER_MARGIN_CM_MIN, HEADER_MARGIN_CM_MAX,
  HEADER_MARGIN_CM_STEP, applyHeaderFooter, openHeaderFormatModal, applyHeaderFormat, openPageNumberModal,
  applyPageNumberSettings, openFooterModal, saveFooter, startInlineHeaderEdit, finishHeaderEdit,
} = useDocsEditorHeaderFooterState({
  editor, isReady, pageCount, isDark, initialDoc, persistCurrentDoc, emit, scrollContainerRef, t,
  getHeaderMarginCm: () => props.headerMarginCm, getFooterMarginCm: () => props.footerMarginCm,
  pageNumber: {
    position: pageNumberPosition, showOnFirstPage: showPageNumberOnFirstPage,
    mode: pageNumberMode, startAt: pageNumberStartAt,
  },
})

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
})

// ─── Ready hook + lifecycle cleanup ──────────────────────────────────────────
useDocsEditorBootstrap({
  isReady, editor, docEditor, userHeaderLeft, userHeaderRight, userFooterLeft, userFooterRight, headerMarginCm,
  footerMarginCm, applyHeaderFooter, openFooterModal, startInlineHeaderEdit, updateBubbleMenu, updatePageStats,
  updateCounts, scheduleCommentAnchorScan, openLinkDialog, emit, finishHeaderEdit, saveTimer,
  getCollaboration: () => props.collaboration,
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
  startInlineHeaderEdit, openFooterModal, openLinkDialog, applyPageless, showDetailsModal, showEmailModal,
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
  <div class="docs-editor flex h-screen w-full flex-col overflow-hidden bg-slate-50 transition-colors dark:bg-[#02040a]">
    <HeaderBar
      v-if="!focusMode"
      :title="title" :editable="editable" :collaborators="collaborators" :starred="starred" :user-name="userName" :user-avatar="userAvatar"
      :pageless="isPageless" :outline-open="activeSidebar === 'toc'" :show-ruler="showRuler" :focus-mode="focusMode" :mode="documentMode"
      @menu-click="menuClick" @back="$emit('back')" @update:title="$emit('update:title', $event)" @toggle-star="$emit('toggle-star')"
      @export="$emit('export', $event)" @share="$emit('share')"><template #actions><slot name="header-actions" /></template><template #overflow-actions="slotProps"><slot name="overflow-actions" v-bind="slotProps" /></template><template #user-menu="slotProps"><slot name="user-menu" v-bind="slotProps" /></template></HeaderBar>
    <EditorToolbar
      v-if="!focusMode"
      :actions="pluginActions" :plugins="plugins" :editor="editor" :active-sidebar="activeSidebar"
      @toggle-sidebar="toggleSidebar" @print="handlePrint" />
    <RulerBar v-if="showRuler && !focusMode" :layout-options="resolvedLayoutOptions" />
    <!-- Floating exit button shown only while focus mode is active -->
    <button
      v-if="focusMode" type="button"
      class="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#0e1525] dark:text-slate-300 dark:hover:bg-white/5"
      :title="t('header.focusMode')" :aria-label="t('header.focusMode')"
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
        v-else type="button"
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
            <!-- Virtual Page Overlay (experimental) — renders only visible pages,
                 absolutely positioned over the editor, behind content (z-index: 0) -->
            <VirtualPageOverlay v-if="useVirtual" :data="virtualData" :is-ready="virtualReady" />
            <!-- Loading Indicator Overlay -->
            <div v-if="!isReady" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-[#0e1525]/60 backdrop-blur-[2px] gap-3 rounded-lg" :aria-label="t('editor.loadingDocument')"></div>

            <!-- Editor -->
            <div ref="editorRef" class="docs-editor__paper outline-none text-slate-800 dark:text-[#e2e8f0]" :class="{ 'opacity-40': !isReady }" />
          </div>
        </div>
      </div>

      <!-- Right-hand sidebar stack: references / comments / history / AI chat.
           The child gates each sidebar with a v-if, so the rendered node list
           matches the pre-extraction component tree. -->
      <DocsEditorSidebars
        :active-sidebar="activeSidebar" :editor="editor" :citation-sources="citationSources"
        :citation-style-id="citationStyleId" :pending-source-request="pendingSourceRequest"
        :can-import-sources="canImportSources" :import-busy="importBusy" :import-message="importMessage"
        :has-references-sidebar-slot="Boolean($slots['references-sidebar'])"
        :comments="props.comments" :selected-text-snippet="props.selectedTextSnippet"
        :selected-text-index="props.selectedTextIndex" :orphaned-comment-ids="orphanedCommentIds"
        :snapshots="props.snapshots" :active-preview-index="props.activePreviewIndex"
        :ai-stream="props.aiStream" :ai-draft="props.aiDraft"
        :suggestions="suggestions" :can-review-suggestions="props.canReviewSuggestions"
        @close="activeSidebar = null" @insert="handleReferenceInsert" @create="handleSourceCreate"
        @update="handleSourceUpdate" @remove="handleSourceRemove"
        @update:style="handleCitationStyleChange" @import-doi="handleImportDoi"
        @import-bibliography="handleImportBibliography"
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
      v-model:footer-left="footerLeftInput" v-model:footer-right="footerRightInput"
      v-model:header-margin-cm="draftHeaderMarginCm" v-model:footer-margin-cm="draftFooterMarginCm"
      v-model:different-first-page="draftDifferentFirstPage" v-model:different-odd-even="draftDifferentOddEven"
      v-model:page-number-position="draftPageNumberPosition"
      v-model:show-page-number-on-first-page="draftShowPageNumberOnFirstPage"
      v-model:page-number-mode="draftPageNumberMode" v-model:page-number-start-at="draftPageNumberStartAt"
      v-model:paper-size="pageSetupSize" v-model:orientation="pageSetupOrientation"
      v-model:margin-top="pageSetupMarginsCm.top" v-model:margin-bottom="pageSetupMarginsCm.bottom"
      v-model:margin-left="pageSetupMarginsCm.left" v-model:margin-right="pageSetupMarginsCm.right"
      :show-footer-modal="showFooterModal" :show-header-format-modal="showHeaderFormatModal"
      :show-page-number-modal="showPageNumberModal" :show-email-modal="showEmailModal"
      :show-details-modal="showDetailsModal" :show-link-dialog="showLinkDialog"
      :show-page-setup-modal="showPageSetupModal"
      :header-margin-min="HEADER_MARGIN_CM_MIN" :header-margin-max="HEADER_MARGIN_CM_MAX"
      :header-margin-step="HEADER_MARGIN_CM_STEP" :page-margin-min="PAGE_MARGIN_CM_MIN"
      :page-margin-max="PAGE_MARGIN_CM_MAX"
      :document-title="props.title" :share-url="props.shareUrl" :document-meta="props.documentMeta"
      :link-dialog-initial-text="linkDialogInitialText" :link-dialog-initial-url="linkDialogInitialUrl"
      :link-dialog-is-editing="linkDialogIsEditing"
      @close-footer="showFooterModal = false" @close-header-format="showHeaderFormatModal = false"
      @close-page-number="showPageNumberModal = false" @close-email="showEmailModal = false"
      @close-details="showDetailsModal = false" @close-link="showLinkDialog = false"
      @close-page-setup="showPageSetupModal = false"
      @save="saveFooter" @apply-header-format="applyHeaderFormat" @apply-page-number="applyPageNumberSettings"
      @apply-link="applyLinkDialog" @remove-link="removeLink" @apply-page-setup="applyPageSetup"
      @share="emit('share')"
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
