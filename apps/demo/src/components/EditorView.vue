<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Printer, LogOut } from 'lucide-vue-next'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { useLocale } from '@kedata-indonesia/docflow-vue'
import type { DocumentMeta } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import type { DocsEditor as DocsEditorInstance } from '@kedata-indonesia/docflow-core'
import type { DocumentItem } from '../types.js'
import { encodeStateAsUpdate } from 'yjs'

import { exportDocument, type ExportFormat } from '../utils/export.js'
import { fetchDocumentMeta } from '../api.js'

function extractPlainText(content: unknown): string {
  const parts: string[] = []
  function collect(node: Record<string, unknown>): void {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content as Array<Record<string, unknown>>) {
        collect(child)
      }
    }
    if (Array.isArray(node.marks) && typeof node.text === 'string') {
      parts.push(node.text)
    }
  }
  const record = content as Record<string, unknown> | null
  if (record && typeof record === 'object' && Array.isArray(record.content)) {
    for (const node of record.content as Array<Record<string, unknown>>) {
      collect(node)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const { t } = useLocale()

// Base URL for backend API — matches api.ts (VITE_API_BASE_URL or same-origin)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// WebSocket collaboration URL. Resolution order:
// 1. VITE_COLLAB_WEBSOCKET_URL if explicitly provided.
// 2. VITE_API_BASE_URL + /collab when separate-domain API is configured.
// 3. Same-origin /collab as the final fallback.
const WS_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'

function resolveDefaultCollabUrl(): string {
  if (typeof window === 'undefined') return ''
  const apiBase = import.meta.env.VITE_API_BASE_URL
  if (apiBase && String(apiBase).trim()) {
    const base = String(apiBase).trim().replace(/\/$/, '')
    return base.replace(/^http/, 'ws') + '/collab'
  }
  return `${WS_PROTOCOL}//${window.location.host}/collab`
}

const envWsUrl = import.meta.env.VITE_COLLAB_WEBSOCKET_URL
const COLLAB_WS_URL = envWsUrl && String(envWsUrl).trim()
  ? String(envWsUrl).trim()
  : import.meta.env.PROD
    ? resolveDefaultCollabUrl()
    : ''

const props = defineProps<{
  doc: DocumentItem
  room: string
  collabUser?: { name: string; color: string; avatar?: string }
}>()

const emit = defineEmits<{
  back: []
  'update:doc': [doc: DocumentItem]
  logout: []
  'new-doc': []
  'open-doc': []
  duplicate: []
  move: []
  trash: []
}>()

const pageSize = ref('a4')
const editorInstance = ref<DocsEditorInstance | null>(null)
const saveTimer = ref<ReturnType<typeof setInterval> | null>(null)
const shareToast = ref('')
const shareDialogOpen = ref(false)
const shareUrl = ref('')
const collaborators = ref<Array<{ userId: string; name: string; email: string }>>([])
const newCollaboratorEmail = ref('')
const shareLoading = ref(false)
const shareError = ref('')
const onlineUsers = ref<Array<{ userId: string; userName: string }>>([])
const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
const isSnapshotLoading = ref(true)
const initialSnapshot = ref<Uint8Array | undefined>(undefined)
const documentMeta = ref<DocumentMeta | undefined>(undefined)

async function loadDocumentMeta() {
  try {
    const meta = await fetchDocumentMeta(props.doc.id)
    documentMeta.value = {
      id: meta.id,
      title: meta.title,
      owner: meta.owner,
      createdAt: new Date(meta.createdAt).getTime(),
      updatedAt: new Date(meta.updatedAt).getTime(),
      wordCount: 0,
      charCount: 0,
      pageCount: 1,
    }
  } catch (err) {
    console.error('Failed to load document metadata:', err)
    documentMeta.value = undefined
  }
}

watch(() => props.doc.content, (content) => {
  if (!documentMeta.value) return
  try {
    const text = extractPlainText(content)
    documentMeta.value.wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
    documentMeta.value.charCount = text.length
  } catch {
    documentMeta.value.wordCount = 0
    documentMeta.value.charCount = 0
  }
}, { deep: true, immediate: true })

watch(() => props.doc.id, async () => {
  documentMeta.value = undefined
  await loadDocumentMeta()
}, { immediate: true })

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

async function loadSnapshot(room: string) {
  isSnapshotLoading.value = true
  initialSnapshot.value = undefined
  try {
    const res = await fetch(`${API_BASE}/api/collab/snapshot/${encodeURIComponent(room)}`, {
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
  }
}

onMounted(async () => {
  await loadSnapshot(props.room)
  startHeartbeat()
})

watch(() => props.room, async (newRoom) => {
  await loadSnapshot(newRoom)
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

function handleMenuClick(action: string) {
  switch (action) {
    case 'new-doc':
      emit('new-doc')
      break
    case 'open-doc':
      emit('open-doc')
      break
    case 'duplicate':
      emit('duplicate')
      break
    case 'move':
      emit('move')
      break
    case 'trash':
      emit('trash')
      break
    case 'email':
      // Insert email draft placeholder via editor command if available
      break
    default:
      // page-setup and print are handled internally by DocsEditor
      break
  }
}

async function handleExport(format: ExportFormat) {
  if (!editorInstance.value) return
  try {
    await exportDocument(format, editorInstance.value.editor as unknown as Parameters<typeof exportDocument>[1], props.doc.title)
  } catch (err) {
    console.error('Export failed:', err)
    shareToast.value = 'Export failed'
    setTimeout(() => { shareToast.value = '' }, 3000)
  }
}

async function handleShare() {
  shareUrl.value = window.location.href
  shareDialogOpen.value = true
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareToast.value = t('editor.share.copied')
  } catch {
    shareToast.value = shareUrl.value
  }
  setTimeout(() => { shareToast.value = '' }, 3000)
  await fetchCollaborators()
}

async function fetchCollaborators() {
  try {
    const res = await fetch(`${API_BASE}/api/documents/${props.doc.id}/collaborators`, {
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Failed to fetch collaborators:', data.error || res.statusText)
      collaborators.value = []
      return
    }
    collaborators.value = (await res.json()) as Array<{ userId: string; name: string; email: string }>
  } catch (err) {
    console.error('Failed to fetch collaborators:', err)
    collaborators.value = []
  }
}

async function addCollaborator() {
  const email = newCollaboratorEmail.value.trim()
  if (!email) return

  shareLoading.value = true
  shareError.value = ''
  try {
    const lookupRes = await fetch(`${API_BASE}/api/users/lookup?email=${encodeURIComponent(email)}`, {
      credentials: 'include',
    })
    if (!lookupRes.ok) {
      const data = await lookupRes.json().catch(() => ({}))
      shareError.value = data.error || t('editor.share.userNotFound')
      return
    }
    const user = (await lookupRes.json()) as { userId: string; name: string; email: string }
    const addRes = await fetch(`${API_BASE}/api/documents/${props.doc.id}/collaborators`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ collaboratorId: user.userId }),
    })
    if (!addRes.ok) {
      const data = await addRes.json().catch(() => ({}))
      shareError.value = data.error || t('editor.share.failedToAdd')
      return
    }
    newCollaboratorEmail.value = ''
    await fetchCollaborators()
  } catch (err) {
    console.error('Failed to add collaborator:', err)
    shareError.value = t('editor.share.failedToAdd')
  } finally {
    shareLoading.value = false
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    shareToast.value = t('editor.share.copied')
  } catch {
    shareToast.value = t('editor.share.couldNotCopy')
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
      :key="doc.id"
      :model-value="doc.content"
      :plugins="defaultPlugins"
      :editable="true"
      :collaboration="collaborationOptions"
      :title="doc.title"
      :starred="doc.starred"
      :page-size="pageSize"
      :user-name="collabUser?.name ?? 'Account'"
      :user-avatar="collabUser?.avatar ?? ''"
      :document-meta="documentMeta"
      :share-url="shareUrl"
      connection-state="connected"
      @back="emit('back')"
      @update:title="handleUpdateTitle"
      @toggle-star="handleToggleStar"
      @update:model-value="handleUpdateContent"
      @update:page-size="handleUpdatePageSize"
      @update:page-count="(count) => { if (documentMeta) documentMeta.pageCount = count }"
      @ready="handleEditorReady"
      @share="handleShare"
      @export="handleExport"
      @menu-click="handleMenuClick"
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
        <!-- Print: inline on large screens; in the ⋮ menu on small (see #overflow-actions).
             Logout now lives in the account menu (#user-menu). -->
        <button
          type="button"
          class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 xl:flex"
          :title="t('editor.print')"
          @click="handlePrint"
        >
          <Printer class="h-[18px] w-[18px]" />
        </button>
      </template>

      <!-- Small-screen overflow menu rows (rendered inside the header's ⋮ menu) -->
      <template #overflow-actions="{ close }">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
          @click="handlePrint(); close()"
        >
          <Printer class="h-4 w-4 text-slate-400" />
          <span>{{ t('editor.print') }}</span>
        </button>
        <div class="my-1 border-t border-slate-100 dark:border-slate-700/80" />
      </template>

      <!-- Account menu (avatar + username dropdown) -->
      <template #user-menu="{ close }">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          @click="emit('logout'); close()"
        >
          <LogOut class="h-4 w-4" />
          <span>{{ t('editor.logOut') }}</span>
        </button>
      </template>
    </DocsEditor>

    <!-- Share modal -->
    <div
      v-if="shareDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="shareDialogOpen = false"
    >
      <div class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ t('editor.share.title') }}
          </h3>
          <button
            type="button"
            class="rounded-md p-1 text-sm text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            @click="shareDialogOpen = false"
          >
            {{ t('editor.share.close') }}
          </button>
        </div>

        <div class="mb-4">
          <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {{ t('editor.share.shareableLink') }}
          </label>
          <div class="flex gap-2">
            <input
              type="text"
              :value="shareUrl"
              readonly
              class="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            />
            <button
              type="button"
              class="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
              @click="copyShareLink"
            >
              {{ t('editor.share.copy') }}
            </button>
          </div>
        </div>

        <div class="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-white/5">
          <div class="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {{ props.doc.visibility === 'restricted' ? t('editor.share.restricted') : t('editor.share.private') }}
            </span>
            {{ t('editor.share.visibility') }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            {{ props.doc.visibility === 'restricted' ? t('editor.share.restrictedDescription') : t('editor.share.privateDescription') }}
          </p>
        </div>

        <div class="mb-4">
          <h4 class="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {{ t('editor.share.collaborators') }}
          </h4>
          <ul class="max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
            <li
              v-for="c in collaborators"
              :key="c.userId"
              class="border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-700"
            >
              <div class="text-sm font-medium text-slate-800 dark:text-slate-200">
                {{ c.name }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                {{ c.email }}
              </div>
            </li>
          </ul>
        </div>

        <div class="mb-2">
          <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {{ t('editor.share.addCollaborator') }}
          </label>
          <div class="flex gap-2">
            <input
              v-model="newCollaboratorEmail"
              type="email"
              :placeholder="t('editor.share.placeholder')"
              class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
              @keydown.enter="addCollaborator"
            />
            <button
              type="button"
              class="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-cyan-700 disabled:opacity-50"
              :disabled="shareLoading"
              @click="addCollaborator"
            >
              {{ t('editor.share.add') }}
            </button>
          </div>
        </div>

        <p v-if="shareError" class="text-xs text-red-600 dark:text-red-400">
          {{ shareError }}
        </p>
      </div>
    </div>

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
