<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Printer } from 'lucide-vue-next'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import type { DocsEditor as DocsEditorType } from '@kedata-indonesia/docflow-core'
import type { DocumentItem } from '../types.js'
import * as Y from 'yjs'
import { encodeStateAsUpdate, applyUpdate } from 'yjs'

const props = defineProps<{
  doc: DocumentItem
  room: string
  collabUser?: { name: string; color: string }
}>()

const emit = defineEmits<{
  back: []
  'update:doc': [doc: DocumentItem]
}>()

const pageSize = ref('a4')
const editorInstance = ref<DocsEditorType['editor'] | null>(null)
const saveTimer = ref<ReturnType<typeof setInterval> | null>(null)

// Generate consistent color from username
function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

const collaborationOptions = computed(() => {
  if (!props.room.trim()) return undefined
  return {
    room: props.room.trim(),
    provider: 'webrtc' as const,
    user: {
      name: props.collabUser?.name || 'Anonymous',
      color: props.collabUser?.color || nameToColor(props.collabUser?.name || 'anon'),
    },
  }
})

// ── Yjs Snapshot Persistence ────────────────────────────────────────────────

/**
 * Save current Y.Doc state to server as a collaboration snapshot.
 * Called periodically to persist collaboration state.
 */
async function saveCollabSnapshot() {
  try {
    // Access Y.Doc through TipTap collaboration extension
    const editor = editorInstance.value
    if (!editor) return
    const ydoc = ((editor.storage as Record<string, unknown>).collaboration as Record<string, unknown> | undefined)?.ydoc as Y.Doc | undefined
    if (!ydoc) return

    const update = encodeStateAsUpdate(ydoc)
    await fetch('/api/collab/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        roomId: props.room,
        yDocState: Array.from(update),
      }),
    })
  } catch {
    // Silently ignore save failures
  }
}

/**
 * Load collaboration snapshot from server (if newer than document content).
 */
async function loadCollabSnapshot() {
  try {
    const res = await fetch(`/api/collab/snapshot/${encodeURIComponent(props.room)}`, {
      credentials: 'include',
    })
    if (!res.ok) return

    const data = await res.json()
    if (data.yDocState && editorInstance.value) {
      const ydoc = ((editorInstance.value.storage as Record<string, unknown>).collaboration as Record<string, unknown> | undefined)?.ydoc as Y.Doc | undefined
      if (ydoc) {
        applyUpdate(ydoc, new Uint8Array(data.yDocState))
      }
    }
  } catch {
    // No existing snapshot — fresh start
  }
}

function startAutoSave() {
  stopAutoSave()
  saveTimer.value = setInterval(saveCollabSnapshot, 30_000) // every 30 seconds
}

function stopAutoSave() {
  if (saveTimer.value) {
    clearInterval(saveTimer.value)
    saveTimer.value = null
  }
}

onMounted(async () => {
  await loadCollabSnapshot()
})

onUnmounted(async () => {
  stopAutoSave()
  await saveCollabSnapshot() // final save
  if (editorInstance.value) {
    delete (window as unknown as { __docsEditor?: DocsEditorType['editor'] }).__docsEditor
  }
})

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleUpdateTitle(title: string) {
  emit('update:doc', { ...props.doc, title })
}

function handleToggleStar() {
  emit('update:doc', { ...props.doc, starred: !props.doc.starred })
}

function handleUpdateContent(content: object) {
  emit('update:doc', { ...props.doc, content, updatedAt: Date.now() })
}

function handlePrint() {
  window.print()
}

function handleUpdatePageSize(size: string) {
  pageSize.value = size
}

function handleEditorReady(editor: DocsEditorType['editor']) {
  editorInstance.value = editor
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __docsEditor?: DocsEditorType['editor'] }).__docsEditor = editor
  }
  // Start auto-saving collaboration state
  startAutoSave()
}
</script>

<template>
  <DocsEditor
    :model-value="doc.content"
    :plugins="defaultPlugins"
    :editable="true"
    :collaboration="collaborationOptions"
    :title="doc.title"
    :starred="doc.starred"
    :page-size="pageSize"
    connection-state="connected"
    @back="emit('back')"
    @update:title="handleUpdateTitle"
    @toggle-star="handleToggleStar"
    @update:model-value="handleUpdateContent"
    @update:page-size="handleUpdatePageSize"
    @ready="handleEditorReady"
  >
    <template #header-actions>
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        title="Print document"
        @click="handlePrint"
      >
        <Printer class="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span class="hidden sm:inline">Print</span>
      </button>
    </template>
  </DocsEditor>
</template>
