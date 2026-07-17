<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@kedata-indonesia/docflow-vue'
import type { DocumentItem, FolderItem, UserInfo } from './types.js'
import * as api from './api.js'
import { RateLimitError } from './api.js'
import Dashboard from './components/Dashboard.vue'
import EditorView from './components/EditorView.vue'

const { isDark, toggle: toggleTheme } = useTheme()

// ─── Auth State ──────────────────────────────────────────────────────────────

const user = ref<UserInfo | null>(null)
const authLoading = ref(true)
const dataLoading = ref(false)
const providers = ref<Array<{ id: string; name: string; type: string }>>([])
const showEmailForm = ref(false)
const emailFormMode = ref<'signin' | 'signup'>('signin')
const emailInput = ref('')
const passwordInput = ref('')
const nameInput = ref('')
const emailError = ref('')
const emailSuccess = ref('')
const emailLoading = ref(false)
const providersError = ref<'rate-limited' | 'network' | null>(null)
const rateLimitRetryIn = ref(0)

async function loadProviders() {
  try {
    providersError.value = null
    providers.value = await api.getAuthProviders()
  } catch (err) {
    if (err instanceof RateLimitError) {
      providersError.value = 'rate-limited'
      rateLimitRetryIn.value = err.retryAfter
      // countdown
      const tick = setInterval(() => {
        rateLimitRetryIn.value--
        if (rateLimitRetryIn.value <= 0) {
          clearInterval(tick)
          loadProviders()
        }
      }, 1000)
    } else {
      providersError.value = 'network'
    }
  }
}

async function checkAuth() {
  authLoading.value = true
  try {
    const u = await api.getCurrentUser()
    if (u) {
      user.value = {
        id: u.id,
        email: u.email,
        displayName: u.name,
        avatar: u.image,
      }
    } else {
      user.value = null
    }
  } catch {
    user.value = null
  } finally {
    authLoading.value = false
  }
  // Fetch available providers
  loadProviders()
}

async function handleLogin(provider: string) {
  try {
    await api.signInWithProvider(provider)
  } catch (err) {
    console.error('Sign in failed:', err)
  }
}

async function handleEmailSubmit() {
  emailError.value = ''
  emailSuccess.value = ''
  emailLoading.value = true
  try {
    if (emailFormMode.value === 'signup') {
      await api.signUpWithEmail(emailInput.value, passwordInput.value, nameInput.value || emailInput.value)
      emailSuccess.value = 'Account created! You are now signed in.'
    } else {
      await api.signInWithEmail(emailInput.value, passwordInput.value)
    }
    // Reload to refresh auth state
    await checkAuth()
    if (user.value) await loadDocuments()
  } catch (err) {
    emailError.value = (err as Error).message
  } finally {
    emailLoading.value = false
  }
}

async function handleLogout() {
  await api.signOut()
  user.value = null
  documents.value = []
  currentDocId.value = null
}

// ─── Document State ──────────────────────────────────────────────────────────

const currentDocId = ref<string | null>(null)
const documents = ref<DocumentItem[]>([])
const folders = ref<FolderItem[]>([
  { id: 'folder-work', name: 'Work' },
  { id: 'folder-personal', name: 'Personal' },
])
const saveError = ref<string | null>(null)

// Room per document (each doc has its own collaboration room)
const room = computed(() => currentDocId.value ? `doc-${currentDocId.value}` : '')
// Collaboration user identity from Better Auth session
const collabUser = computed(() => {
  if (!user.value) return undefined
  let hash = 0
  const name = user.value.displayName
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return { name, color: `hsl(${hue}, 60%, 50%)`, avatar: user.value.avatar }
})

const currentDoc = computed(() => documents.value.find((d) => d.id === currentDocId.value) ?? null)

// ─── Load documents from API ─────────────────────────────────────────────────

async function loadDocuments() {
  if (!user.value) return
  dataLoading.value = true
  try {
    const docs = await api.fetchDocuments()
    documents.value = docs.map((d) => ({
      id: d._id,
      title: d.title,
      content: { type: 'doc', content: [{ type: 'paragraph' }] } as object, // placeholder, loaded on open
      folderId: d.folderId,
      starred: d.starred,
      updatedAt: new Date(d.updatedAt).getTime(),
      createdAt: new Date(d.createdAt).getTime(),
    }))
  } catch (err) {
    console.error('Failed to load documents:', err)
    saveError.value = 'Failed to load documents. Is the server running?'
  } finally {
    dataLoading.value = false
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

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
    content: [paragraph()],
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
    case 'meeting-notes': return meetingNotesContent()
    case 'project-proposal': return projectProposalContent()
    case 'letter': return letterContent()
    default: return blankContent()
  }
}

function getTemplateTitle(templateId: string): string {
  switch (templateId) {
    case 'meeting-notes': return 'Meeting Notes'
    case 'project-proposal': return 'Project Proposal'
    case 'letter': return 'Official Letter'
    default: return 'Untitled Document'
  }
}

// ─── Document Actions (API-backed) ──────────────────────────────────────────

async function createDocument(templateId: string) {
  if (!user.value) return
  const title = getTemplateTitle(templateId)
  const content = getTemplateContent(templateId)
  try {
    const doc = await api.createDocument({ title, content })
    const now = Date.now()
    documents.value.unshift({
      id: doc._id,
      title: doc.title,
      content: doc.content,
      folderId: doc.folderId,
      starred: doc.starred,
      updatedAt: now,
      createdAt: now,
    })
    selectDocument(doc._id)
  } catch (err) {
    console.error('Failed to create document:', err)
  }
}

async function selectDocument(id: string) {
  currentDocId.value = id
  history.pushState({ docId: id }, '', `/${id}`)
  // Load full content from API
  await openDocumentById(id)
}

async function openDocumentById(id: string) {
  // Load content first, then render — prevents editor showing placeholder
  if (!documents.value.some((d) => d.id === id)) {
    try {
      const doc = await api.fetchDocument(id)
      documents.value.unshift({
        id: doc._id,
        title: doc.title,
        content: doc.content,
        folderId: doc.folderId,
        starred: doc.starred,
        updatedAt: new Date(doc.updatedAt).getTime(),
        createdAt: new Date(doc.createdAt).getTime(),
      })
    } catch (err) {
      console.error('Document not found:', err)
      return
    }
  }
  currentDocId.value = id
  await loadDocumentContent(id)
}

async function loadDocumentContent(id: string) {
  try {
    const doc = await api.fetchDocument(id)
    const existing = documents.value.find((d) => d.id === id)
    if (existing) {
      existing.content = doc.content
      existing.title = doc.title
      existing.starred = doc.starred
      existing.folderId = doc.folderId
    }
  } catch (err) {
    console.error('Failed to load document content:', err)
  }
}

function goBack() {
  currentDocId.value = null
  history.pushState({ docId: null }, '', '/')
}

async function updateDocument(doc: DocumentItem) {
  const index = documents.value.findIndex((d) => d.id === doc.id)
  if (index !== -1) {
    documents.value[index] = doc
  }
  // Persist to API (debounced in parent, but we save on every meaningful change)
  try {
    await api.updateDocument(doc.id, {
      title: doc.title,
      content: doc.content,
      starred: doc.starred,
      folderId: doc.folderId,
    })
  } catch (err) {
    console.error('Failed to save document:', err)
  }
}

async function toggleStar(id: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    doc.starred = !doc.starred
    doc.updatedAt = Date.now()
    try {
      await api.updateDocument(id, { starred: doc.starred })
    } catch (err) {
      console.error('Failed to toggle star:', err)
    }
  }
}

async function renameDocument(id: string, title: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc && title.trim()) {
    doc.title = title.trim()
    doc.updatedAt = Date.now()
    try {
      await api.updateDocument(id, { title: doc.title })
    } catch (err) {
      console.error('Failed to rename document:', err)
    }
  }
}

async function duplicateDocument(id: string) {
  const doc = documents.value.find((d) => d.id === id)
  if (!doc) return
  try {
    const copy = await api.createDocument({
      title: `Copy of ${doc.title}`,
      content: doc.content,
    })
    const now = Date.now()
    documents.value.unshift({
      id: copy._id,
      title: copy.title,
      content: copy.content,
      folderId: copy.folderId,
      starred: false,
      updatedAt: now,
      createdAt: now,
    })
  } catch (err) {
    console.error('Failed to duplicate document:', err)
  }
}

async function deleteDocument(id: string) {
  if (!confirm('Are you sure you want to delete this document?')) return
  try {
    await api.deleteDocument(id)
  } catch (err) {
    console.error('Failed to delete document:', err)
  }
  documents.value = documents.value.filter((d) => d.id !== id)
  if (currentDocId.value === id) {
    currentDocId.value = null
    history.pushState({ docId: null }, '', '/')
  }
}

async function moveDocument(id: string, folderId: string | null) {
  const doc = documents.value.find((d) => d.id === id)
  if (doc) {
    doc.folderId = folderId
    doc.updatedAt = Date.now()
    try {
      await api.updateDocument(id, { folderId })
    } catch (err) {
      console.error('Failed to move document:', err)
    }
  }
}

function createFolder(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  folders.value.push({ id: generateId(), name: trimmed })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(async () => {
  await checkAuth()
  if (user.value) {
    await loadDocuments()
  }

  // Restore document from URL path (even if not in our list — fetch from API)
  const path = window.location.pathname.replace(/^\/+/, '')
  if (path) {
    if (documents.value.some((d) => d.id === path)) {
      currentDocId.value = path
      loadDocumentContent(path)
    } else if (user.value) {
      // Document not in our list — try loading from API (shared document)
      openDocumentById(path)
    }
  }

  window.addEventListener('popstate', () => {
    const p = window.location.pathname.replace(/^\/+/, '')
    if (p) {
      const doc = documents.value.find((d) => d.id === p)
      if (doc) {
        currentDocId.value = doc.id
      } else if (user.value) {
        openDocumentById(p)
      }
    } else {
      currentDocId.value = null
    }
  })
})

// Reload docs when user logs in
watch(user, async (newUser) => {
  if (newUser) {
    await loadDocuments()
  }
})

// ─── Template helpers ────────────────────────────────────────────────────────

const userName = computed(() => user.value?.displayName || '')
const userAvatar = computed(() => {
  if (user.value?.avatar) return user.value.avatar
  return user.value?.displayName?.charAt(0)?.toUpperCase() || '?'
})
</script>

<template>
  <div
    class="relative flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-800 transition-colors duration-200 dark:bg-[#02040a] dark:text-[#e2e8f0] font-sans"
  >
    <div
      class="pointer-events-none absolute left-[-100px] top-[-100px] z-0 h-[500px] w-[500px] rounded-full bg-blue-900/10 blur-[120px] dark:bg-blue-950/20"
    />
    <div
      class="pointer-events-none absolute bottom-[-100px] right-[-100px] z-0 h-[400px] w-[400px] rounded-full bg-indigo-900/10 blur-[100px] dark:bg-indigo-950/20"
    />

    <!-- Auth Loading -->
    <div
      v-if="authLoading"
      class="relative z-10 flex flex-1 items-center justify-center"
    >
      <p class="text-sm text-slate-500 animate-pulse">Loading...</p>
    </div>

    <!-- Not Authenticated -->
    <div
      v-else-if="!user"
      class="relative z-10 flex flex-1 flex-col items-center justify-center gap-6"
    >
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-2xl font-bold text-white shadow-[0_0_25px_rgba(34,211,238,0.35)]"
      >
        DF
      </div>
      <h1 class="text-2xl font-extrabold text-slate-900 dark:text-white">
        Docflow
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Sign in to create and edit documents
      </p>
      <div class="flex w-full max-w-sm flex-col gap-4 px-4">
        <!-- Social provider buttons -->
        <template v-for="p in providers.filter(x => x.type === 'social')" :key="p.id">
          <!-- Google -->
          <button
            v-if="p.id === 'google'"
            type="button"
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-white/20"
            @click="handleLogin('google')"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          <!-- GitHub -->
          <button
            v-if="p.id === 'github'"
            type="button"
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-white/20"
            @click="handleLogin('github')"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
          <!-- Microsoft -->
          <button
            v-if="p.id === 'microsoft'"
            type="button"
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-white/20"
            @click="handleLogin('microsoft')"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24">
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
              <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
            </svg>
            Sign in with Microsoft
          </button>
          <!-- Generic social fallback -->
          <button
            v-if="!['google','github','microsoft'].includes(p.id)"
            type="button"
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-white/20"
            @click="handleLogin(p.id)"
          >
            Sign in with {{ p.name }}
          </button>
        </template>

        <!-- Email/Password section -->
        <template v-if="providers.some(p => p.type === 'credentials')">
          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            <span class="text-xs text-slate-400">or</span>
            <div class="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>

          <form v-if="showEmailForm" class="flex flex-col gap-3" @submit.prevent="handleEmailSubmit">
            <p v-if="emailSuccess" class="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">{{ emailSuccess }}</p>
            <p v-if="emailError" class="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{{ emailError }}</p>
            <input
              v-model="emailInput"
              type="email"
              required
              placeholder="Email"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            />
            <input
              v-if="emailFormMode === 'signup'"
              v-model="nameInput"
              type="text"
              placeholder="Name"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            />
            <input
              v-model="passwordInput"
              type="password"
              required
              minlength="8"
              placeholder="Password"
              class="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              type="submit"
              :disabled="emailLoading"
              class="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
            >
              {{ emailLoading ? 'Loading...' : emailFormMode === 'signup' ? 'Create Account' : 'Sign In' }}
            </button>
            <button
              type="button"
              class="text-xs text-cyan-500 hover:underline"
              @click="emailFormMode = emailFormMode === 'signin' ? 'signup' : 'signin'"
            >
              {{ emailFormMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in' }}
            </button>
          </form>
          <button
            v-else
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-white/20"
            @click="showEmailForm = true"
          >
            Sign in with Email
          </button>
        </template>

        <p v-if="providersError === 'rate-limited'" class="text-center text-xs text-amber-500">
          Server sedang membatasi permintaan (rate limit).<br />
          <span v-if="rateLimitRetryIn > 0">Mencoba ulang dalam {{ rateLimitRetryIn }} detik…</span>
          <button v-else type="button" class="underline" @click="loadProviders">Coba lagi</button>
        </p>
        <p v-else-if="providersError === 'network'" class="text-center text-xs text-red-400">
          Tidak bisa menghubungi server. Periksa koneksi Anda.
          <button type="button" class="ml-1 underline" @click="loadProviders">Coba lagi</button>
        </p>
        <p v-else-if="providers.length === 0" class="text-center text-xs text-slate-400">
          No authentication providers configured.<br />Check your server environment variables.
        </p>
      </div>
    </div>

    <!-- Authenticated -->
    <template v-else>
      <div class="relative z-10 flex flex-1 overflow-hidden">
        <!-- Data loading indicator -->
        <div
          v-if="dataLoading"
          class="flex w-full items-center justify-center"
        >
          <p class="text-sm text-slate-500 animate-pulse">Loading documents...</p>
        </div>

        <template v-else>
          <div
            v-if="!currentDocId"
            class="flex h-full w-full flex-col overflow-auto"
          >
            <header
              class="sticky top-0 z-20 flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-xl transition-colors dark:border-white/5 dark:bg-[#0a0f1e]/80"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-base font-bold text-white shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                >
                  DF
                </div>
                <div class="flex items-center">
                  <span
                    class="bg-clip-text text-xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-400"
                  >
                    Docflow
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
                  <img
                    v-if="user.avatar"
                    :src="user.avatar"
                    :alt="userName"
                    class="h-8 w-8 rounded-full border border-blue-200 object-cover dark:border-white/10"
                  />
                  <div
                    v-else
                    class="flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-xs font-bold text-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-cyan-400"
                  >
                    {{ userAvatar }}
                  </div>
                  <div class="hidden text-left md:block">
                    <p class="text-xs font-semibold text-slate-800 dark:text-slate-200">{{ userName }}</p>
                    <button
                      type="button"
                      class="font-mono text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                      @click="handleLogout"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <Dashboard
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
          </div>

          <EditorView
            v-else-if="currentDoc"
            class="flex-1"
            :doc="currentDoc"
            :room="room"
            :collab-user="collabUser"
            @back="goBack"
            @update:doc="updateDocument"
            @logout="handleLogout"
          />
        </template>
      </div>

      <!-- Error banner -->
      <div
        v-if="saveError"
        class="fixed bottom-4 right-4 z-50 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-300"
      >
        {{ saveError }}
        <button
          type="button"
          class="ml-3 font-semibold underline"
          @click="saveError = null"
        >
          Dismiss
        </button>
      </div>
    </template>
  </div>
</template>
