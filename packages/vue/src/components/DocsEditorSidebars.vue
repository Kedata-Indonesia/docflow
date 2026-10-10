<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import type { AIDraftFn, AIStreamFn, CslItemData } from '@kedata-indonesia/docflow-core'
import type { CommentItem, DocumentSnapshot, SidebarKey, SuggestionSummary } from '../types.js'
import ReferencesSidebar from './sidebars/ReferencesSidebar.vue'
import CommentsSidebar from './sidebars/CommentsSidebar.vue'
import HistorySidebar from './sidebars/HistorySidebar.vue'
import AISidebar from './sidebars/AISidebar.vue'
import SuggestionsSidebar from './sidebars/SuggestionsSidebar.vue'

/**
 * Right-hand sidebar stack for DocsEditor: reference manager, comment
 * threads, version history and the doc-aware AI chat.
 *
 * Presentational only — it owns no document state and no persistence.
 * Everything arrives as props; every user intent leaves as an event, and
 * DocsEditor (or the host behind it) wires those events to storage.
 */
const props = defineProps<{
  activeSidebar: SidebarKey | null
  editor: Editor | null
  citationSources: CslItemData[]
  citationStyleId: string
  pendingSourceRequest: boolean
  canImportSources: boolean
  importBusy: boolean
  importMessage: string
  /** True when the host supplied the `#references-sidebar` slot (issue #22). */
  hasReferencesSidebarSlot?: boolean
  comments?: CommentItem[]
  selectedTextSnippet?: string
  selectedTextIndex?: number
  orphanedCommentIds: string[]
  snapshots?: DocumentSnapshot[]
  activePreviewIndex?: number | null
  aiStream?: AIStreamFn
  aiDraft?: AIDraftFn
  /** Pending tracked-change suggestions (issues #27/#28). */
  suggestions?: SuggestionSummary[]
  /** Host gate for accept/reject (viewer roles get false). */
  canReviewSuggestions?: boolean
}>()

const emit = defineEmits<{
  close: []
  insert: [sourceId: string]
  create: [source: CslItemData]
  update: [source: CslItemData]
  remove: [id: string]
  'update:style': [styleId: string]
  'import-doi': [doi: string]
  'import-bibliography': [payload: { format: 'bibtex' | 'ris'; text: string }]
  'add-comment': [content: string, anchorText?: string, anchorIndex?: number]
  'add-reply': [commentId: string, content: string]
  'resolve-comment': [commentId: string]
  'delete-comment': [commentId: string]
  'save-snapshot': [name: string]
  'restore-snapshot': [versionIndex: number]
  'preview-snapshot': [snapshot: DocumentSnapshot | null]
  'accept-suggestion': [id: string]
  'reject-suggestion': [id: string]
  'accept-all-suggestions': []
  'reject-all-suggestions': []
}>()

/**
 * Everything a custom `#references-sidebar` host needs to render a picker
 * (issue #22): the live library + picker state, and the actions it must call —
 * `onInsert(sourceId)` completes a pending citation, `onClose()` closes the
 * sidebar, and the CRUD/import actions mirror the built-in sidebar's emits.
 */
const referencesSidebarProps = computed(() => ({
  sources: props.citationSources,
  activeStyle: props.citationStyleId,
  pickerMode: props.pendingSourceRequest,
  canImport: props.canImportSources,
  importing: props.importBusy,
  importMessage: props.importMessage,
  onInsert: (sourceId: string) => emit('insert', sourceId),
  onClose: () => emit('close'),
  onCreate: (source: CslItemData) => emit('create', source),
  onUpdate: (source: CslItemData) => emit('update', source),
  onRemove: (id: string) => emit('remove', id),
  onStyleChange: (styleId: string) => emit('update:style', styleId),
  onImportDoi: (doi: string) => emit('import-doi', doi),
  onImportBibliography: (payload: { format: 'bibtex' | 'ris'; text: string }) =>
    emit('import-bibliography', payload),
}))
</script>

<template>
  <!-- Reference manager — also acts as the source picker while a citation
       insert is pending. Hosts may replace it entirely via DocsEditor's
       `#references-sidebar` slot (issue #22); the built-in sidebar is the
       fallback and is used whenever the slot is absent. -->
  <template v-if="activeSidebar === 'references'">
    <slot v-if="hasReferencesSidebarSlot" name="references-sidebar" v-bind="referencesSidebarProps" />
    <ReferencesSidebar
      v-else
      :sources="citationSources"
      :active-style="citationStyleId"
      :picker-mode="pendingSourceRequest"
      :can-import="canImportSources"
      :importing="importBusy"
      :import-message="importMessage"
      @close="emit('close')"
      @insert="(sourceId) => emit('insert', sourceId)"
      @create="(source) => emit('create', source)"
      @update="(source) => emit('update', source)"
      @remove="(id) => emit('remove', id)"
      @update:style="(styleId) => emit('update:style', styleId)"
      @import-doi="(doi) => emit('import-doi', doi)"
      @import-bibliography="(payload) => emit('import-bibliography', payload)"
    />
  </template>

  <!-- Comment threads — library-only stub that forwards user intent to the
       host (which owns the REST surface and sets the `comment` mark). -->
  <CommentsSidebar
    v-if="activeSidebar === 'comments'"
    :comments="comments"
    :selected-text-snippet="selectedTextSnippet"
    :selected-text-index="selectedTextIndex"
    :orphaned-ids="orphanedCommentIds"
    @close="emit('close')"
    @add-comment="(content, anchorText, anchorIndex) => emit('add-comment', content, anchorText, anchorIndex)"
    @add-reply="(commentId, content) => emit('add-reply', commentId, content)"
    @resolve-comment="(commentId) => emit('resolve-comment', commentId)"
    @delete-comment="(commentId) => emit('delete-comment', commentId)"
  />

  <!-- Version history — no close emit; toggled via the toolbar History button. -->
  <HistorySidebar
    v-if="activeSidebar === 'history'"
    :snapshots="snapshots"
    :active-preview-index="activePreviewIndex"
    @save-snapshot="(name) => emit('save-snapshot', name)"
    @restore-snapshot="(versionIndex) => emit('restore-snapshot', versionIndex)"
    @preview-snapshot="(snapshot) => emit('preview-snapshot', snapshot)"
  />

  <!-- Doc-aware AI chat — rendered when the sidebar slot is switched to it;
       it stays inert unless the host injects an `aiStream` transport. -->
  <AISidebar
    v-if="activeSidebar === 'ai'"
    :editor="editor"
    :ai-stream="aiStream"
    :ai-draft="aiDraft"
    @close="emit('close')"
  />

  <!-- Track-changes review (issues #27/#28). -->
  <SuggestionsSidebar
    v-if="activeSidebar === 'review'"
    :suggestions="suggestions ?? []"
    :can-review="canReviewSuggestions !== false"
    @accept="(id) => emit('accept-suggestion', id)"
    @reject="(id) => emit('reject-suggestion', id)"
    @accept-all="emit('accept-all-suggestions')"
    @reject-all="emit('reject-all-suggestions')"
    @close="emit('close')"
  />
</template>
