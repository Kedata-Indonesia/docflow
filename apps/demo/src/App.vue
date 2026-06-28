<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@docs-editor/vue'
import type { DocumentItem, FolderItem } from './types.js'
import Dashboard from './components/Dashboard.vue'
import EditorView from './components/EditorView.vue'

const { isDark, toggle: toggleTheme } = useTheme()

const currentDocId = ref<string | null>(null)
const documents = ref<DocumentItem[]>([])
const folders = ref<FolderItem[]>([
  { id: 'folder-work', name: 'Work' },
  { id: 'folder-personal', name: 'Personal' },
])
const room = ref('demo-room')

const currentDoc = computed(() => documents.value.find((d) => d.id === currentDocId.value) ?? null)

function generateId() {
  return Math.random().toString(36).slice(2, 11)
}

function textNode(text: string) {
  return { type: 'text', text }
}

function paragraph(children: object[] = []) {
  return { type: 'paragraph', content: children.length > 0 ? children : undefined }
}

function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [textNode(text)] }
}

function blankContent() {
  return {
    type: 'doc',
    content: [
      paragraph(),
    ],
  }
}

function meetingNotesContent() {
  return {
    type: 'doc',
    content: [
      heading(1, 'Meeting Notes'),
      heading(2, 'Attendees'),
      paragraph([textNode('Add attendees...')]),
      heading(2, 'Agenda'),
      paragraph([textNode('1. ')]),
      paragraph([textNode('2. ')]),
      paragraph([textNode('3. ')]),
      heading(2, 'Action Items'),
      paragraph([textNode('- ')]),
      paragraph([textNode('- ')]),
    ],
  }
}

function projectProposalContent() {
  return {
    type: 'doc',
    content: [
      heading(1, 'Project Proposal'),
      heading(2, 'Objectives'),
      paragraph([textNode('Define the project objectives here.')]),
      heading(2, 'Deliverables'),
      paragraph([textNode('- Deliverable 1')]),
      paragraph([textNode('- Deliverable 2')]),
      heading(2, 'Timeline'),
      paragraph([textNode('Outline the project timeline.')]),
    ],
  }
}

function letterContent() {
  return {
    type: 'doc',
    content: [
      heading(1, 'Official Letter'),
      paragraph([textNode('Date: ____________')]),
      paragraph([textNode('To:')]),
      paragraph([textNode('Subject: ____________')]),
      paragraph(),
      paragraph([textNode('Dear Sir/Madam,')]),
      paragraph([textNode('Write your letter content here.')]),
      paragraph(),
      paragraph([textNode('Sincerely,')]),
      paragraph([textNode('Your Name')]),
    ],
  }
}

function getTemplateContent(templateId: string): object {
  switch (templateId) {
    case 'meeting-notes':
      return meetingNotesContent()
    case 'project-proposal':
      return projectProposalContent()
    case 'letter':
      return letterContent()
    default:
      return blankContent()
  }
}

function getTemplateTitle(templateId: string): string {
  switch (templateId) {
    case 'meeting-notes':
      return 'Meeting Notes'
    case 'project-proposal':
      return 'Project Proposal'
    case 'letter':
      return 'Official Letter'
    default:
      return 'Untitled Document'
  }
}

function createDocument(templateId: string) {
  const now = Date.now()
  const doc: DocumentItem = {
    id: generateId(),
    title: getTemplateTitle(templateId),
    content: getTemplateContent(templateId),
    folderId: null,
    starred: false,
    updatedAt: now,
    createdAt: now,
  }
  documents.value.unshift(doc)
  selectDocument(doc.id)
}

function selectDocument(id: string) {
  if (documents.value.some((d) => d.id === id)) {
    currentDocId.value = id
    history.pushState({ docId: id }, '', `/${id}`)
  }
}

function goBack() {
  currentDocId.value = null
  history.pushState({ docId: null }, '', '/')
}

function updateDocument(doc: DocumentItem) {
  const index = documents.value.findIndex((d) => d.id === doc.id)
  if (index !== -1) {
    documents.value[index] = doc
  }
}

function toggleStar(id: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    doc.starred = !doc.starred
    doc.updatedAt = Date.now()
  }
}

function renameDocument(id: string, title: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc && title.trim()) {
    doc.title = title.trim()
    doc.updatedAt = Date.now()
  }
}

function duplicateDocument(id: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (!doc) return
  const now = Date.now()
  const copy: DocumentItem = {
    ...doc,
    id: generateId(),
    title: `Copy of ${doc.title}`,
    updatedAt: now,
    createdAt: now,
  }
  documents.value.unshift(copy)
}

function deleteDocument(id: string) {
  if (!confirm('Are you sure you want to delete this document?')) return
  documents.value = documents.value.filter((d) => d.id !== id)
  if (currentDocId.value === id) {
    currentDocId.value = null
    history.pushState({ docId: null }, '', '/')
  }
}

function moveDocument(id: string, folderId: string | null) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    doc.folderId = folderId
    doc.updatedAt = Date.now()
  }
}

function createFolder(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  folders.value.push({ id: generateId(), name: trimmed })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const LS_DOCUMENTS_KEY = 'docs-editor-documents'
const LS_FOLDERS_KEY = 'docs-editor-folders'

// Load persisted data on mount
onMounted(() => {
  try {
    const savedDocs = localStorage.getItem(LS_DOCUMENTS_KEY)
    if (savedDocs) {
      const parsed = JSON.parse(savedDocs)
      if (Array.isArray(parsed)) documents.value = parsed
    }
  } catch { /* ignore corrupt data */ }

  try {
    const savedFolders = localStorage.getItem(LS_FOLDERS_KEY)
    if (savedFolders) {
      const parsed = JSON.parse(savedFolders)
      if (Array.isArray(parsed)) folders.value = parsed
    }
  } catch { /* ignore corrupt data */ }

  // Restore document from URL path (e.g. /<doc-id>)
  const path = window.location.pathname.replace(/^\/+/, '')
  if (path && documents.value.some(d => d.id === path)) {
    currentDocId.value = path
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const p = window.location.pathname.replace(/^\/+/, '')
    if (p) {
      const doc = documents.value.find(d => d.id === p)
      currentDocId.value = doc ? doc.id : null
    } else {
      currentDocId.value = null
    }
  })
})

// Persist on every change (debounced via nextTick / deep watch)
watch(
  documents,
  (val) => {
    localStorage.setItem(LS_DOCUMENTS_KEY, JSON.stringify(val))
  },
  { deep: true },
)

watch(
  folders,
  (val) => {
    localStorage.setItem(LS_FOLDERS_KEY, JSON.stringify(val))
  },
  { deep: true },
)

const userName = 'Demo User'
const userAvatar = getInitials(userName)
</script>

<template>
  <div
    class="relative flex min-h-screen flex-col overflow-hidden bg-slate-50 text-slate-800 transition-colors duration-200 dark:bg-[#02040a] dark:text-[#e2e8f0] font-sans"
  >
    <div
      class="pointer-events-none absolute left-[-100px] top-[-100px] z-0 h-[500px] w-[500px] rounded-full bg-blue-900/10 blur-[120px] dark:bg-blue-950/20"
    />
    <div
      class="pointer-events-none absolute bottom-[-100px] right-[-100px] z-0 h-[400px] w-[400px] rounded-full bg-indigo-900/10 blur-[100px] dark:bg-indigo-950/20"
    />

    <header
      v-if="!currentDocId"
      class="relative z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-xl transition-colors dark:border-white/5 dark:bg-[#0a0f1e]/80"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-base font-bold text-white shadow-[0_0_15px_rgba(34,211,238,0.3)]"
        >
          dE
        </div>
        <div class="flex items-center">
          <span
            class="bg-clip-text text-xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-400"
          >
            DocsEditor
          </span>
          <span
            class="ml-2 rounded-full border border-transparent bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:border-cyan-500/20 dark:text-cyan-400"
          >
            Beta
          </span>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button
          type="button"
          class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-500 transition-all hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20"
          :title="isDark ? 'Light Mode' : 'Dark Mode'"
          @click="toggleTheme"
        >
          <svg
            v-if="isDark"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828 9.9a5 5 0 117.07 0l-.707-.707"
            />
          </svg>
          <svg
            v-else
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </button>

        <div class="flex items-center gap-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-xs font-bold text-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-cyan-400"
          >
            {{ userAvatar }}
          </div>
          <div class="hidden text-left md:block">
            <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">{{ userName }}</p>
            <p class="font-mono text-[10px] text-slate-400">My Account</p>
          </div>
        </div>
      </div>
    </header>

    <div class="relative z-10 flex flex-1 overflow-hidden">
      <Dashboard
        v-if="!currentDocId"
        :documents="documents"
        :folders="folders"
        @select-document="selectDocument"
        @create-document="createDocument"
        @toggle-star="toggleStar"
        @rename="renameDocument"
        @duplicate="duplicateDocument"
        @delete="deleteDocument"
        @move="moveDocument"
        @create-folder="createFolder"
      />

      <EditorView
        v-else-if="currentDoc"
        :doc="currentDoc"
        :room="room"
        @back="goBack"
        @update:doc="updateDocument"
      />
    </div>
  </div>
</template>
