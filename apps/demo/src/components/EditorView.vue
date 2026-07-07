<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Printer } from 'lucide-vue-next'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import type { DocsEditor as DocsEditorInstance } from '@kedata-indonesia/docflow-core'
import type { DocumentItem } from '../types.js'
import { encodeStateAsUpdate } from 'yjs'

// Base URL for backend API — matches api.ts (VITE_API_BASE_URL or same-origin)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// WebSocket collaboration URL. When not set, default to a same-origin WebSocket
// path so Docker / Dokploy deployments work without build-time env vars.
const WS_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const DEFAULT_WS_URL = typeof window !== 'undefined' ? `${WS_PROTOCOL}//${window.location.host}/collab` : ''
const envWsUrl = import.meta.env.VITE_COLLAB_WEBSOCKET_URL
const COLLAB_WS_URL = envWsUrl && String(envWsUrl).trim()
  ? String(envWsUrl).trim()
  : import.meta.env.PROD
    ? DEFAULT_WS_URL
    : ''

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
const editorInstance = ref<DocsEditorInstance | null>(null)
const saveTimer = ref<ReturnType<typeof setInterval> | null>(null)
const shareToast = ref('')
const onlineUsers = ref<Array<{ userId: string; userName: string }>>([])
const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
const isSnapshotLoading = ref(true)
const initialSnapshot = ref<Uint8Array | undefined>(undefined)

// Generate consistent color from username
function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

const collaborationOptions = computed(() => {
  if (!props.room.trim()) return undefined
  if (COLLAB_WS_URL) {
    return {
      room: props.room.trim(),
      provider: 'websocket' as const,
      websocketUrl: COLLAB_WS_URL,
      initialStorageState: initialSnapshot.value,
      user: {
        name: props.collabUser?.name || 'Anonymous',
        color: props.collabUser?.color || nameToColor(props.collabUser?.name || 'anon'),
      },
    }
  }
  return {
    room: props.room.trim(),
    provider: 'webrtc' as const,
    initialStorageState: initialSnapshot.value,
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
    const ydoc = editorInstance.value?.collab?.ydoc
    if (!ydoc) return

    const update = encodeStateAsUpdate(ydoc)
    await fetch(`${API_BASE}/api/collab/snapshot`, {
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

// Removed unused loadCollabSnapshot to fix TS6133 warning

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
  try {
    const res = await fetch(`${API_BASE}/api/collab/snapshot/${encodeURIComponent(props.room)}`, {
      credentials: 'include',
    })
    if (res.ok) {
      const data = await res.json()
      if (data.yDocState) {
        initialSnapshot.value = new Uint8Array(data.yDocState)
      }
    }
  } catch (err) {
    console.error('Failed to load initial snapshot:', err)
  } finally {
    isSnapshotLoading.value = false
    startHeartbeat()
  }
})

onUnmounted(async () => {
  stopAutoSave()
  stopHeartbeat()
  await saveCollabSnapshot()
  if (editorInstance.value) {
    delete (window as unknown as { __docsEditor?: DocsEditorInstance['editor'] }).__docsEditor
  }
})

// ── Presence Heartbeat ──────────────────────────────────────────────────────

async function sendHeartbeat() {
  try {
    await fetch(`${API_BASE}/api/collab/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        roomId: props.room,
        userName: props.collabUser?.name || 'Anonymous',
      }),
    })
  } catch { /* ignore */ }
}

async function fetchOnlineUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/collab/online/${encodeURIComponent(props.room)}`, {
      credentials: 'include',
    })
    if (!res.ok) return
    const data = await res.json()
    onlineUsers.value = data.users || []
  } catch { /* ignore */ }
}

function startHeartbeat() {
  stopHeartbeat()
  sendHeartbeat()
  heartbeatTimer.value = setInterval(() => {
    sendHeartbeat()
    fetchOnlineUsers()
  }, 15_000) // every 15 seconds
}

function stopHeartbeat() {
  if (heartbeatTimer.value) {
    clearInterval(heartbeatTimer.value)
    heartbeatTimer.value = null
  }
}

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

async function handleShare() {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    shareToast.value = 'Link copied! Share this URL with collaborators.'
  } catch {
    shareToast.value = url
  }
  setTimeout(() => { shareToast.value = '' }, 3000)
}

function handleUpdatePageSize(size: string) {
  pageSize.value = size
}

function handleEditorReady(docsEditor: DocsEditorInstance) {
  editorInstance.value = docsEditor
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __docsEditor?: DocsEditorInstance['editor'] }).__docsEditor = docsEditor.editor
  }
  startAutoSave()
}
</script>

<template>
  <div ref="editorWrapper" class="relative flex-1">

    <DocsEditor
      v-if="!isSnapshotLoading"
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
      @share="handleShare"
    >
      <template #header-actions>
        <!-- Online user avatars -->
        <div v-if="onlineUsers.length > 1" class="flex items-center -space-x-2 mr-2">
          <div
            v-for="u in onlineUsers.slice(0, 5)"
            :key="u.userId"
            :title="u.userName"
            class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm dark:border-slate-800"
            :style="{ backgroundColor: nameToColor(u.userName) }"
          >
            {{ u.userName.charAt(0).toUpperCase() }}
          </div>
          <div
            v-if="onlineUsers.length > 5"
            class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-700 dark:text-slate-300"
          >
            +{{ onlineUsers.length - 5 }}
          </div>
        </div>
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

    <!-- Share toast -->
    <Transition name="fade">
      <div
        v-if="shareToast"
        class="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800 shadow-lg dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200"
      >
        {{ shareToast }}
      </div>
    </Transition>
  </div>
</template>
