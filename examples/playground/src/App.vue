<script setup lang="ts">
import { ref } from 'vue'
import {
  DocsEditor,
  HOST_OWNED_ACTIONS,
  toAIStreamFn,
  type AIProvider,
  type AIStreamFn,
} from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import EventLog from './EventLog.vue'
import ReviewPanel from './ReviewPanel.vue'
import AiPlayground from './AiPlayground.vue'
import KbPicker from './KbPicker.vue'
import { useEventLog } from './composables/useEventLog'
import { usePersistedZoom } from './composables/usePersistedZoom'
import { useDocumentSession } from './composables/useDocumentSession'
import { useCommentThreads } from './composables/useCommentThreads'
import { useDocumentSnapshots } from './composables/useDocumentSnapshots'
import { useCitationLibrary } from './composables/useCitationLibrary'

/**
 * The playground plays the role of the host app: it owns the document, the
 * comment threads, the versions and the collaborators, and it reacts to the
 * events the editor emits. The library itself never fetches anything.
 *
 * The host state lives in `composables/*`; this file only wires it to the
 * review rail and to `<DocsEditor>`.
 */

// --- host-owned state -------------------------------------------------------
const { events, log, clear: clearEvents } = useEventLog()
const { zoom } = usePersistedZoom()

const {
  presetId,
  content,
  title,
  pageSize,
  orientation,
  margins,
  headerMarginCm,
  footerMarginCm,
  pageless,
  virtualPages,
  editable,
  mode,
  debug,
  locale,
  userName,
  connectionState,
  collaborators,
  pageCount,
  documentMeta,
  onContentUpdate,
  onHeaderFooterMargins,
} = useDocumentSession({ log })

const { comments, addComment, addReply, resolveComment, deleteComment, addSampleComment } =
  useCommentThreads({ userName, log })
const { snapshots, saveSnapshot, addSampleSnapshot } = useDocumentSnapshots({ userName, log })
const { citation, onStyleImported } = useCitationLibrary({ log })

// Left rail (review controls + event log) collapsed state.
const railCollapsed = ref(false)

// Playground-only: when on, inject a custom references sidebar via the
// `#references-sidebar` slot (#22). Off = the library's built-in sidebar.
const customReferencesSidebar = ref(false)

// AI: the panel builds a provider (BYOK); inject it as `aiStream` so the editor's
// AI sidebar streams through the same provider (#118, end-to-end). The function
// is stable and reads the current provider lazily, because the editor reads
// `aiStream` once at creation (it is an injection port, not a reactive prop).
const aiProvider = ref<AIProvider | null>(null)
const aiStream: AIStreamFn = (req, signal) => {
  const provider = aiProvider.value
  if (!provider) {
    return (async function* () {
      yield '⚠️ No AI provider configured — add a key in the “AI providers” panel.'
    })()
  }
  return toAIStreamFn(provider)(req, signal)
}

function onAiProvider(provider: AIProvider | null): void {
  aiProvider.value = provider
}

// --- host-owned action logging (issue #153) ----------------------------------
// The playground implements no host actions, so every action the library emits
// is flagged in the log with the same derived source of truth the menu item
// dimming uses (`HOST_OWNED_ACTIONS`). What you see dimmed in the header is
// exactly what stays untagged here.
function onMenuClick(action: string): void {
  log('menu-click', action, HOST_OWNED_ACTIONS.includes(action))
}

function onExport(format: string): void {
  log('export', format, HOST_OWNED_ACTIONS.includes(`export:${format}`))
}

function onShare(): void {
  log('share', undefined, HOST_OWNED_ACTIONS.includes('share'))
}

function onToggleStar(): void {
  log('toggle-star', undefined, HOST_OWNED_ACTIONS.includes('add-to-starred'))
}

function onAddSampleComment(): void {
  addSampleComment(title.value)
}

/**
 * Test hook: the showcase e2e specs (e2e/showcase/*) drive the editor through
 * `window.__docsEditor`, the same surface the old `apps/demo` exposed. Keep it
 * — table-resize / page-break specs depend on it.
 *
 * `window.__docsCore` exposes the core DocsEditor (`.pluginActions`), which the
 * demo uses to trigger flows without a toolbar entry — e.g.
 * `__docsCore.pluginActions.insertCitation()` opens the references sidebar in
 * picker mode.
 */
function onReady(docsEditor: { editor: unknown; pluginActions?: unknown }): void {
  const w = window as unknown as { __docsEditor?: unknown; __docsCore?: unknown }
  w.__docsEditor = docsEditor.editor
  w.__docsCore = docsEditor
  log('ready')
}
</script>

<template>
  <div class="pg" :class="{ 'pg--collapsed': railCollapsed }">
    <aside class="pg-rail">
      <ReviewPanel
        v-model:preset-id="presetId"
        v-model:title="title"
        v-model:page-size="pageSize"
        v-model:orientation="orientation"
        v-model:pageless="pageless"
        v-model:virtual-pages="virtualPages"
        v-model:zoom="zoom"
        v-model:editable="editable"
        v-model:mode="mode"
        v-model:debug="debug"
        v-model:locale="locale"
        v-model:user-name="userName"
        v-model:connection-state="connectionState"
        v-model:custom-references-sidebar="customReferencesSidebar"
        :comment-count="comments.length"
        :snapshot-count="snapshots.length"
        @add-comment-sample="onAddSampleComment"
        @add-snapshot-sample="addSampleSnapshot"
      />

      <AiPlayground @provider="onAiProvider" />

      <EventLog :events="events" @clear="clearEvents" />
    </aside>

    <button
      class="pg-rail-toggle"
      type="button"
      :title="railCollapsed ? 'Show controls' : 'Hide controls'"
      :aria-expanded="!railCollapsed"
      @click="railCollapsed = !railCollapsed"
    >
      {{ railCollapsed ? '›' : '‹' }}
    </button>

    <main class="pg-editor">
      <!--
        The key remounts the editor when a mount-only prop changes. Only two props
        are read once at setup and never watched:
          modelValue  - useDocumentModel parses it in setup(), so a new document
                        (the preset select) needs a fresh mount;
          debug       - core creates the performance monitor together with the
                        editor.
        pageSize and editable are reactive (watched in useDocsEditorPageSurface /
        useEditor), so they must NOT be part of the key: remounting would throw
        away undo history and selection just to re-read a prop the library already
        follows.
      -->
      <DocsEditor
        :key="`${presetId}-${debug}`"
        v-model:mode="mode"
        :model-value="content"
        :plugins="defaultPlugins"
        :citation="citation"
        :editable="editable"
        :ai-stream="aiStream"
        :page-size="pageSize"
        :orientation="orientation"
        :margins="margins"
        :header-margin-cm="headerMarginCm"
        :footer-margin-cm="footerMarginCm"
        :pageless="pageless"
        :virtual-pages="virtualPages"
        :zoom="zoom"
        :title="title"
        :user-name="userName"
        :locale="locale"
        :collaborators="collaborators"
        :connection-state="connectionState"
        :document-meta="documentMeta"
        :comments="comments"
        :snapshots="snapshots"
        :debug="debug"
        :unimplemented-actions="[...HOST_OWNED_ACTIONS]"
        @update:model-value="onContentUpdate"
        @update:title="title = $event; log('update:title', $event)"
        @update:page-size="pageSize = $event; log('update:pageSize', $event)"
        @update:orientation="orientation = $event; log('update:orientation', $event)"
        @update:margins="margins = $event; log('update:margins', JSON.stringify($event))"
        @update:header-footer-margins="onHeaderFooterMargins"
        @update:pageless="pageless = $event; log('update:pageless', String($event))"
        @update:zoom="zoom = $event; log('update:zoom', `${$event}%`)"
        @update:page-count="pageCount = $event; log('update:pageCount', $event)"
        @update:locale="locale = $event; log('update:locale', $event)"
        @citation-style-imported="onStyleImported"
        @menu-click="onMenuClick"
        @export="onExport"
        @ready="onReady"
        @share="onShare"
        @back="log('back')"
        @toggle-star="onToggleStar"
        @add-comment="addComment"
        @add-reply="addReply"
        @resolve-comment="resolveComment"
        @delete-comment="deleteComment"
        @save-snapshot="saveSnapshot"
        @restore-snapshot="log('restore-snapshot', $event)"
        @preview-snapshot="log('preview-snapshot', $event ? $event.versionId : 'clear')"
      >
        <!-- Opt-in (ReviewPanel → Extensions): replace the built-in references
             sidebar with a host component through the `#references-sidebar`
             slot (issue #22). When unchecked the library sidebar is used. -->
        <template
          v-if="customReferencesSidebar"
          #references-sidebar="{ sources, activeStyle, pickerMode, onInsert, onClose, onCreate, onUpdate, onRemove, onStyleChange }"
        >
          <KbPicker
            :sources="sources"
            :active-style="activeStyle"
            :picker-mode="pickerMode"
            @insert="onInsert"
            @close="onClose"
            @create="onCreate"
            @update="onUpdate"
            @remove="onRemove"
            @style-change="onStyleChange"
          />
        </template>
      </DocsEditor>
    </main>
  </div>
</template>
