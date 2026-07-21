<script setup lang="ts">
import { ref } from 'vue'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import type { DocsEditor as DocsEditorInstance } from '@kedata-indonesia/docflow-core'
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
const collaboration = {
  room: 'docflow-demo',
  provider: 'webrtc' as const,
  user: { name: 'Demo User', color: '#06b6d4' },
}

const editorInstance = ref<DocsEditorInstance | null>(null)

function handleEditorReady(docsEditor: DocsEditorInstance) {
  editorInstance.value = docsEditor
}

async function handleExport(format: ExportFormat) {
  if (!editorInstance.value) return
  try {
    await exportDocument(
      format,
      editorInstance.value.editor as unknown as Parameters<typeof exportDocument>[1],
      props.title,
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
    :collaboration="collaboration"
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
