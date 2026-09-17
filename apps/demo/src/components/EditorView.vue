<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import {
  createCollaboration,
  type CollaborationSetup,
  type DocsEditor as DocsEditorInstance,
  type CitationPort,
  type CslItemData,
} from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import { exportDocument, type ExportFormat } from '../utils/export.js'

/**
 * Backend-free showcase host. Renders <DocsEditor> with defaultPlugins and
 * webrtc (P2P/local) collaboration — deliberately using the library's
 * localhost-only signaling default (Phase 2); same-browser tabs sync via
 * BroadcastChannel. No auth, no API, no server persistence: the document lives
 * in this component's parent (in-memory).
 *
 * Library consumers: this file is the reference for mounting the editor.
 */
const props = defineProps<{
  title: string
  content: object
  starred?: boolean
}>()

const emit = defineEmits<{
  'update:title': [title: string]
  'update:content': [content: object]
  'toggle-star': []
}>()

// webrtc P2P collab for the two-tabs demo; no server involved. The library
// logs its one-time localhost-only signaling notice — intentional here.
//
// Built asynchronously via createCollaboration (issue fe-aktifai#230): the
// API is async because y-webrtc is lazy-imported only when the webrtc
// provider is actually requested — keeping the collab stack out of bundles
// where collaboration is disabled. DocsEditor accepts the resulting
// CollaborationSetup (raw options are no longer auto-created by the editor).
const collabSetup = shallowRef<CollaborationSetup | null>(null)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
// Host-owned setup: the editor no longer destroys it on unmount (see
// EditorOptions.collaboration), so release the room here — after the child
// editor has been unmounted.
onUnmounted(() => {
  collabSetup.value?.destroy()
  collabSetup.value = null
})

onMounted(async () => {
  const setup = await createCollaboration({
    room: 'docflow-demo',
    provider: 'webrtc',
    user: { name: 'Demo User', color: '#06b6d4' },
  })
  // Guard against resolving after this host already unmounted. The setup is
  // host-owned: a setup that never reached the editor must be cleaned up here.
  if (disposed) {
    setup.destroy()
    return
  }
  collabSetup.value = setup
})

// ─── Citations demo (Phase 6A) ────────────────────────────────────────────
// Hardcoded CSL-JSON sources + a minimal prompt picker — proves the library
// citation engine end-to-end with no backend. The real reference library,
// CRUD, and importers are app-side work (Phase 6B).
const DEMO_SOURCES: CslItemData[] = [
  {
    id: 'oetomo-2020',
    type: 'book',
    title: 'Arsitektur Kolaborasi Perangkat Lunak',
    author: [{ family: 'Oetomo', given: 'Budi' }],
    issued: { 'date-parts': [[2020]] },
    publisher: 'Penerbit Andi',
    'publisher-place': 'Yogyakarta',
  },
  {
    id: 'smith-2021',
    type: 'article-journal',
    title: 'Conflict-free Replicated Data Types in Collaborative Editors',
    author: [{ family: 'Smith', given: 'Jane' }, { family: 'Lee', given: 'Kevin' }],
    issued: { 'date-parts': [[2021]] },
    'container-title': 'Journal of Distributed Systems',
    volume: '12',
    issue: '3',
    page: '45-61',
    DOI: '10.1000/jds.2021.1234',
  },
  {
    id: 'who-2023',
    type: 'webpage',
    title: 'The State of Open Source Editors',
    author: [{ literal: 'Open Docs Foundation' }],
    issued: { 'date-parts': [[2023, 5, 14]] },
    URL: 'https://example.org/open-editors-2023',
  },
]

const citationPort: CitationPort = {
  sources: DEMO_SOURCES,
  style: 'chicago-notes-bibliography',
  // No onSourceRequest here: the editor falls back to its built-in picker —
  // the references sidebar — which is exactly what we want to showcase.
}

const editorInstance = ref<DocsEditorInstance | null>(null)

function handleEditorReady(docsEditor: DocsEditorInstance) {
  editorInstance.value = docsEditor
  // Expose the editor instance for Playwright e2e (apps/web does the same at
  // EditorView.vue:1425). Lets specs drive the editor via commands instead of
  // fragile toolbar-DN selectors. No-op for library consumers — demo only.
  ;(window as unknown as { __docsEditor?: DocsEditorInstance['editor'] }).__docsEditor = docsEditor.editor
}

/** Live-engine citation renderer for the DOCX export (Phase 6D). */
function getCitationExportPort(): { renderCitation: (citationId: string) => string; getBibliography: () => string[] } | undefined {
  const storage = editorInstance.value?.editor.storage as Record<string, unknown> | undefined
  const engine = (storage?.citationEngine as
    | { engine?: { renderCluster: (id: string) => string; getBibliography: () => string[] } | null }
    | undefined)?.engine
  if (!engine) return undefined
  return {
    renderCitation: (citationId: string) => engine.renderCluster(citationId),
    getBibliography: () => engine.getBibliography(),
  }
}

async function handleExport(format: ExportFormat) {
  if (!editorInstance.value) return
  try {
    await exportDocument(
      format,
      editorInstance.value.editor as unknown as Parameters<typeof exportDocument>[1],
      props.title,
      { citation: getCitationExportPort() },
    )
  } catch (err) {
    console.error('Export failed:', err)
  }
}
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    :collaboration="collabSetup ?? undefined"
    :citation="citationPort"
    :title="title"
    :starred="starred"
    :editable="true"
    user-name="Demo User"
    @update:model-value="emit('update:content', $event)"
    @update:title="emit('update:title', $event)"
    @toggle-star="emit('toggle-star')"
    @export="handleExport"
    @ready="handleEditorReady"
  />
</template>
