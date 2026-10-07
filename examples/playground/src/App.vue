<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DocsEditor,
  type Collaborator,
  type CommentItem,
  type ConnectionState,
  type DocumentSnapshot,
  type Locale,
} from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import EventLog from './EventLog.vue'
import ReviewPanel from './ReviewPanel.vue'
import { PRESETS, SAMPLE_COLLABORATORS, SAMPLE_COMMENTS, SAMPLE_SNAPSHOTS, type PresetId } from './sampleData'
import type { LogEntry } from './types'

/**
 * The playground plays the role of the host app: it owns the document, the
 * comment threads, the versions and the collaborators, and it reacts to the
 * events the editor emits. The library itself never fetches anything.
 */

// --- host-owned state -------------------------------------------------------
const presetId = ref<PresetId>('surat')
const content = ref<object>(PRESETS.surat.doc)
const title = ref(PRESETS.surat.title)
const pageSize = ref('a4')
const orientation = ref<'portrait' | 'landscape'>('portrait')
const margins = ref({ top: 94, bottom: 94, left: 94, right: 94 })
const headerMarginCm = ref(0.5)
const footerMarginCm = ref(0.5)
const pageless = ref(false)
const virtualPages = ref(false)
const editable = ref(true)
const debug = ref(false)
const locale = ref<Locale>('id')
const userName = ref('Reviewer DocFlow')
const connectionState = ref<ConnectionState>('connected')
const collaborators = ref<Collaborator[]>(SAMPLE_COLLABORATORS)
const comments = ref<CommentItem[]>(SAMPLE_COMMENTS)
const snapshots = ref<DocumentSnapshot[]>(SAMPLE_SNAPSHOTS)
const pageCount = ref(1)

// --- event log --------------------------------------------------------------
const events = ref<LogEntry[]>([])
let eventSeq = 0
/** Monotonic fixture ids — `Date.now()` collides on rapid clicks. */
let commentSeq = 0

function log(name: string, detail?: string | number): void {
  eventSeq += 1
  const text = detail === undefined ? '' : String(detail)
  events.value = [{ id: eventSeq, name, detail: text }, ...events.value].slice(0, 50)
}

const documentMeta = computed(() => ({
  id: 'playground-doc-1',
  title: title.value,
  owner: { userId: 'user-1', name: userName.value, email: 'reviewer@example.com' },
  createdAt: Date.now() - 86_400_000,
  updatedAt: Date.now(),
  wordCount: 0,
  charCount: 0,
  pageCount: pageCount.value,
  folderName: 'Playground',
}))

// --- editor events ----------------------------------------------------------
watch(presetId, (id) => {
  content.value = PRESETS[id].doc
  title.value = PRESETS[id].title
  log('preset', id)
})

/**
 * `update:modelValue` carries a `TabbedDoc` (`{ type, activeTabId, tabs }`), so
 * the node count has to come from the tabs, not from a top-level `content`.
 */
function countNodes(value: object): number {
  const tabs = (value as { tabs?: Array<{ content?: { content?: unknown[] } }> }).tabs
  if (!tabs) return 0
  return tabs.reduce((total, tab) => total + (tab.content?.content?.length ?? 0), 0)
}

function onContentUpdate(value: object): void {
  content.value = value
  log('update:modelValue', `${countNodes(value)} node`)
}

function onAddComment(text: string, anchorText?: string, anchorIndex?: number): void {
  commentSeq += 1
  comments.value = [
    {
      id: `thread-${commentSeq}`,
      authorId: 'user-1',
      authorName: userName.value,
      authorColor: '#059669',
      content: text,
      anchorText,
      anchorIndex,
      createdAt: Date.now(),
      replies: [],
    },
    ...comments.value,
  ]
  log('add-comment', text)
}

function onAddReply(threadId: string, text: string): void {
  commentSeq += 1
  const replyId = `reply-${commentSeq}`
  comments.value = comments.value.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          replies: [
            ...thread.replies,
            {
              id: replyId,
              authorId: 'user-1',
              authorName: userName.value,
              authorColor: '#059669',
              content: text,
              createdAt: Date.now(),
            },
          ],
        }
      : thread,
  )
  log('add-reply', threadId)
}

function onResolveComment(threadId: string): void {
  comments.value = comments.value.map((thread) =>
    thread.id === threadId ? { ...thread, resolved: true, resolvedBy: userName.value } : thread,
  )
  log('resolve-comment', threadId)
}

function onDeleteComment(threadId: string): void {
  comments.value = comments.value.filter((thread) => thread.id !== threadId)
  log('delete-comment', threadId)
}

function onSaveSnapshot(name: string): void {
  const nextIndex = snapshots.value.reduce((max, item) => Math.max(max, item.versionIndex), 0) + 1
  snapshots.value = [
    {
      versionId: `ver-${nextIndex}`,
      versionIndex: nextIndex,
      title: name,
      contentPreview: 'Snapshot dibuat dari playground.',
      modifiedBy: userName.value,
      timestamp: Date.now(),
    },
    ...snapshots.value,
  ]
  log('save-snapshot', name)
}

function onHeaderFooterMargins(value: { headerMarginCm: number; footerMarginCm: number }): void {
  headerMarginCm.value = value.headerMarginCm
  footerMarginCm.value = value.footerMarginCm
  log('update:header-footer-margins', `${value.headerMarginCm} / ${value.footerMarginCm} cm`)
}

function addSampleComment(): void {
  onAddComment('Catatan contoh dari panel playground.', title.value)
}

function addSampleSnapshot(): void {
  onSaveSnapshot(`Versi ${snapshots.value.length + 1} dari playground`)
}
</script>

<template>
  <div class="pg">
    <DocsEditor
      :key="`${presetId}-${pageSize}-${editable}-${debug}`"
      :model-value="content"
      :plugins="defaultPlugins"
      :editable="editable"
      :page-size="pageSize"
      :orientation="orientation"
      :margins="margins"
      :header-margin-cm="headerMarginCm"
      :footer-margin-cm="footerMarginCm"
      :pageless="pageless"
      :virtual-pages="virtualPages"
      :title="title"
      :user-name="userName"
      :locale="locale"
      :collaborators="collaborators"
      :connection-state="connectionState"
      :document-meta="documentMeta"
      :comments="comments"
      :snapshots="snapshots"
      :debug="debug"
      @update:model-value="onContentUpdate"
      @update:title="title = $event; log('update:title', $event)"
      @update:page-size="pageSize = $event; log('update:pageSize', $event)"
      @update:orientation="orientation = $event; log('update:orientation', $event)"
      @update:margins="margins = $event; log('update:margins', JSON.stringify($event))"
      @update:header-footer-margins="onHeaderFooterMargins"
      @update:pageless="pageless = $event; log('update:pageless', String($event))"
      @update:page-count="pageCount = $event; log('update:pageCount', $event)"
      @update:locale="locale = $event; log('update:locale', $event)"
      @menu-click="log('menu-click', $event)"
      @export="log('export', $event)"
      @ready="log('ready')"
      @share="log('share')"
      @back="log('back')"
      @toggle-star="log('toggle-star')"
      @add-comment="onAddComment"
      @add-reply="onAddReply"
      @resolve-comment="onResolveComment"
      @delete-comment="onDeleteComment"
      @save-snapshot="onSaveSnapshot"
      @restore-snapshot="log('restore-snapshot', $event)"
      @preview-snapshot="log('preview-snapshot', $event ? $event.versionId : 'bersih')"
    />

    <!--
      The key remounts the editor when a mount-only prop changes. Four props are
      read once at setup and never watched:
        modelValue  - useDocumentModel parses it in setup(), so a new document
                      (the preset select) needs a fresh mount;
        pageSize    - DocsEditor.vue copies it into a plain ref, while
                      orientation, margins, locale and pageless are watched;
        editable    - useEditor({ editable }) receives a frozen options object,
                      so its watch(() => options.editable) never fires;
        debug       - core creates the performance monitor together with the
                      editor.
      Drop the key once the library watches those props.
    -->
    <ReviewPanel
      v-model:preset-id="presetId"
      v-model:title="title"
      v-model:page-size="pageSize"
      v-model:orientation="orientation"
      v-model:pageless="pageless"
      v-model:virtual-pages="virtualPages"
      v-model:editable="editable"
      v-model:debug="debug"
      v-model:locale="locale"
      v-model:user-name="userName"
      v-model:connection-state="connectionState"
      :comment-count="comments.length"
      :snapshot-count="snapshots.length"
      @add-comment-sample="addSampleComment"
      @add-snapshot-sample="addSampleSnapshot"
    />

    <EventLog :events="events" @clear="events = []" />
  </div>
</template>
