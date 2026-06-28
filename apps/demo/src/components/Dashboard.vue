<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  FileText,
  Plus,
  FolderPlus,
  Folder,
  Star,
  Search,
  ArrowUpDown,
  Grid,
  List,
  FileIcon,
} from 'lucide-vue-next'
import type { DocumentItem, FolderItem } from '../types.js'
import DocumentCard from './DocumentCard.vue'
import DocumentListRow from './DocumentListRow.vue'

const props = defineProps<{
  documents: DocumentItem[]
  folders: FolderItem[]
}>()

const emit = defineEmits<{
  selectDocument: [id: string]
  createDocument: [templateId: string]
  toggleStar: [id: string]
  rename: [id: string, title: string]
  duplicate: [id: string]
  delete: [id: string]
  move: [id: string, folderId: string | null]
  createFolder: [name: string]
}>()

const searchQuery = ref('')
const selectedFolderId = ref<string | null>(null)
const filterStarredOnly = ref(false)
const sortBy = ref<'updated' | 'title' | 'created'>('updated')
const viewMode = ref<'grid' | 'list'>('grid')
const isCreatingFolder = ref(false)
const newFolderName = ref('')

const templates = [
  { id: 'blank', title: 'Blank Document', description: 'Fresh slate', icon: Plus, color: 'cyan' },
  { id: 'meeting-notes', title: 'Meeting Notes', description: 'Attendees & Action Items', icon: FileText, color: 'amber' },
  { id: 'project-proposal', title: 'Project Proposal', description: 'Objectives & Deliverables', icon: FileIcon, color: 'emerald' },
  { id: 'letter', title: 'Official Letter', description: 'Pre-formatted header', icon: FileText, color: 'purple' },
]

const filteredDocuments = computed(() => {
  return props.documents.filter((doc) => {
    const query = searchQuery.value.toLowerCase()
    const text = JSON.stringify(doc.content).toLowerCase()
    const matchesSearch =
      doc.title.toLowerCase().includes(query) || text.includes(query)
    const matchesFolder = selectedFolderId.value === null || doc.folderId === selectedFolderId.value
    const matchesStarred = !filterStarredOnly.value || doc.starred
    return matchesSearch && matchesFolder && matchesStarred
  })
})

const sortedDocuments = computed(() => {
  const list = [...filteredDocuments.value]
  list.sort((a, b) => {
    if (sortBy.value === 'title') return a.title.localeCompare(b.title)
    if (sortBy.value === 'created') return b.createdAt - a.createdAt
    return b.updatedAt - a.updatedAt
  })
  return list
})

const activeFilters = computed(() => {
  const filters: { label: string; key: string; onRemove: () => void }[] = []
  if (selectedFolderId.value) {
    const folder = props.folders.find((f) => f.id === selectedFolderId.value)
    filters.push({
      label: `Folder: ${folder?.name ?? ''}`,
      key: 'folder',
      onRemove: () => (selectedFolderId.value = null),
    })
  }
  if (filterStarredOnly.value) {
    filters.push({
      label: 'Starred Only',
      key: 'starred',
      onRemove: () => (filterStarredOnly.value = false),
    })
  }
  if (searchQuery.value) {
    filters.push({
      label: `Search: "${searchQuery.value}"`,
      key: 'search',
      onRemove: () => (searchQuery.value = ''),
    })
  }
  return filters
})

function handleCreateFolder(e: Event) {
  e.preventDefault()
  const trimmed = newFolderName.value.trim()
  if (!trimmed) return
  emit('createFolder', trimmed)
  newFolderName.value = ''
  isCreatingFolder.value = false
}

function handleCreateFromTemplate(templateId: string) {
  emit('createDocument', templateId)
}

function getFolder(doc: DocumentItem) {
  return props.folders.find((f) => f.id === doc.folderId)
}

function setFilterAll() {
  selectedFolderId.value = null
  filterStarredOnly.value = false
}

function setFilterStarred() {
  filterStarredOnly.value = true
  selectedFolderId.value = null
}

function setFilterFolder(id: string) {
  selectedFolderId.value = id
  filterStarredOnly.value = false
}

function getColorClasses(color: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    cyan: {
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-600 dark:text-cyan-400',
      border: 'group-hover:border-cyan-500/50 group-hover:shadow-cyan',
    },
    amber: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'group-hover:border-amber-500/50 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'group-hover:border-emerald-500/50 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    },
    purple: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'group-hover:border-purple-500/50 group-hover:shadow-[0_0_15px_rgba(139,92,246,0.15)]',
    },
  }
  return map[color] ?? map.cyan
}
</script>

<template>
  <div class="relative z-10 mx-auto max-w-7xl px-4 py-8 font-sans transition-colors duration-200 md:px-8">
    <section class="mb-10">
      <h2 class="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Start a New Document
      </h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="group flex flex-col items-start rounded-2xl border border-slate-200/60 bg-white/80 p-5 text-left backdrop-blur-md transition-all hover:bg-white dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
          :class="getColorClasses(template.color).border"
          @click="handleCreateFromTemplate(template.id)"
        >
          <div
            class="mb-4 rounded-xl p-3 transition-transform group-hover:scale-110"
            :class="[getColorClasses(template.color).bg, getColorClasses(template.color).text]"
          >
            <component :is="template.icon" class="h-6 w-6" />
          </div>
          <span class="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{{ template.title }}</span>
          <span class="text-xs text-slate-400 dark:text-slate-500">{{ template.description }}</span>
        </button>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-8 lg:grid-cols-4">
      <aside class="lg:col-span-1">
        <div
          class="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-lg backdrop-blur-xl dark:border-white/5 dark:bg-[#0a0f1e]/80"
        >
          <div class="mb-6 space-y-1">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all"
              :class="
                selectedFolderId === null && !filterStarredOnly
                  ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                  : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              "
              @click="setFilterAll"
            >
              <div class="flex items-center gap-2.5">
                <div
                  v-if="selectedFolderId === null && !filterStarredOnly"
                  class="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]"
                />
                <FileIcon class="h-4 w-4" />
                <span>All Documents</span>
              </div>
              <span
                class="rounded-full bg-slate-200/60 px-2.5 py-0.5 font-mono text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400"
              >
                {{ documents.length }}
              </span>
            </button>

            <button
              type="button"
              class="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all"
              :class="
                filterStarredOnly
                  ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                  : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              "
              @click="setFilterStarred"
            >
              <div class="flex items-center gap-2.5">
                <div
                  v-if="filterStarredOnly"
                  class="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]"
                />
                <Star class="h-4 w-4 fill-amber-400 text-amber-500" />
                <span>Starred</span>
              </div>
              <span
                class="rounded-full bg-slate-200/60 px-2.5 py-0.5 font-mono text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400"
              >
                {{ documents.filter((d) => d.starred).length }}
              </span>
            </button>
          </div>

          <div class="mb-2 flex items-center justify-between px-3">
            <span class="font-mono text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500"
              >Folders</span
            >
            <button
              type="button"
              class="rounded p-0.5 text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-cyan-400"
              title="Create New Folder"
              @click="isCreatingFolder = !isCreatingFolder"
            >
              <FolderPlus class="h-4 w-4" />
            </button>
          </div>

          <form
            v-if="isCreatingFolder"
            class="mb-4 flex animate-fadeIn gap-1 px-3"
            @submit="handleCreateFolder"
          >
            <input
              v-model="newFolderName"
              type="text"
              placeholder="Folder name..."
              class="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-cyan-500 focus:outline-none dark:border-white/10 dark:bg-[#02040a] dark:text-slate-100"
              autofocus
            >
            <button
              type="submit"
              class="rounded-lg bg-cyan-500 px-2.5 py-1 text-xs font-bold text-black hover:bg-cyan-400"
            >
              Create
            </button>
          </form>

          <div class="space-y-1">
            <button
              v-for="folder in folders"
              :key="folder.id"
              type="button"
              class="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all"
              :class="
                selectedFolderId === folder.id
                  ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                  : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
              "
              @click="setFilterFolder(folder.id)"
            >
              <div class="flex items-center gap-2.5 truncate">
                <div
                  v-if="selectedFolderId === folder.id"
                  class="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]"
                />
                <Folder
                  class="h-4 w-4"
                  :class="selectedFolderId === folder.id ? 'text-cyan-400' : 'text-slate-400'"
                />
                <span class="truncate">{{ folder.name }}</span>
              </div>
              <span class="font-mono text-xs text-slate-400">
                {{ documents.filter((d) => d.folderId === folder.id).length }}
              </span>
            </button>
            <p
              v-if="folders.length === 0"
              class="py-4 text-center text-xs text-slate-400 dark:text-slate-500"
            >
              No folders created yet.
            </p>
          </div>
        </div>
      </aside>

      <main class="lg:col-span-3">
        <div class="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div class="relative w-full sm:max-w-md">
            <Search class="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search titles or full-text contents..."
              class="w-full rounded-full border border-slate-200/60 bg-white/85 pl-11 pr-4 py-2.5 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:border-cyan-500/50 focus:bg-white focus:shadow-cyan focus:outline-none dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30 dark:focus:bg-white/[0.05]"
            >
          </div>

          <div class="flex w-full items-center justify-end gap-3 sm:w-auto">
            <div
              class="flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white/80 p-1.5 text-xs text-slate-500 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.02]"
            >
              <ArrowUpDown class="h-3.5 w-3.5" />
              <select
                v-model="sortBy"
                class="bg-transparent pr-2 font-semibold text-slate-700 focus:outline-none dark:text-slate-300"
              >
                <option value="updated" class="dark:bg-[#0a0f1e]">Modified</option>
                <option value="title" class="dark:bg-[#0a0f1e]">Alphabetical</option>
                <option value="created" class="dark:bg-[#0a0f1e]">Created</option>
              </select>
            </div>

            <div
              class="flex items-center rounded-xl border border-slate-200/60 bg-white/80 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.02]"
            >
              <button
                type="button"
                class="rounded-lg p-1.5 transition-all"
                :class="
                  viewMode === 'grid'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-400 hover:text-slate-600'
                "
                title="Grid View"
                @click="viewMode = 'grid'"
              >
                <Grid class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="rounded-lg p-1.5 transition-all"
                :class="
                  viewMode === 'list'
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                    : 'text-slate-400 hover:text-slate-600'
                "
                title="List View"
                @click="viewMode = 'list'"
              >
                <List class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="activeFilters.length > 0" class="mb-4 flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500"
            >Active Filters:</span
          >
          <span
            v-for="filter in activeFilters"
            :key="filter.key"
            class="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold"
            :class="
              filter.key === 'starred'
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : filter.key === 'folder'
                  ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                  : 'border-transparent bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
            "
          >
            {{ filter.label }}
            <button
              type="button"
              class="ml-1 font-bold hover:text-red-500"
              @click="filter.onRemove"
            >
              ×
            </button>
          </span>
        </div>

        <div
          v-if="viewMode === 'grid'"
          class="grid animate-fadeIn grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3"
        >
          <DocumentCard
            v-for="doc in sortedDocuments"
            :key="doc.id"
            :doc="doc"
            :folders="folders"
            :folder="getFolder(doc)"
            @select="emit('selectDocument', $event)"
            @toggle-star="emit('toggleStar', $event)"
            @rename="(...args) => emit('rename', ...args)"
            @duplicate="emit('duplicate', $event)"
            @delete="emit('delete', $event)"
            @move="(...args) => emit('move', ...args)"
          />
        </div>

        <div
          v-else
          class="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 shadow-lg backdrop-blur-md dark:border-white/5 dark:bg-[#0a0f1e]/40"
        >
          <table class="w-full border-collapse text-left text-sm text-slate-700 dark:text-slate-200">
            <thead>
              <tr
                class="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-white/5 dark:bg-[#0a0f1e]/80 font-mono"
              >
                <th class="px-5 py-4">Document Title</th>
                <th class="hidden px-5 py-4 sm:table-cell">Folder</th>
                <th class="hidden px-5 py-4 md:table-cell">Last Modified</th>
                <th class="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <DocumentListRow
                v-for="doc in sortedDocuments"
                :key="doc.id"
                :doc="doc"
                :folder="getFolder(doc)"
                @select="emit('selectDocument', $event)"
                @toggle-star="emit('toggleStar', $event)"
                @rename="(...args) => emit('rename', ...args)"
                @duplicate="emit('duplicate', $event)"
                @delete="emit('delete', $event)"
              />
            </tbody>
          </table>
        </div>

        <div
          v-if="sortedDocuments.length === 0"
          class="mt-6 rounded-2xl border border-slate-200/60 bg-white/80 p-12 text-center shadow-lg backdrop-blur-md dark:border-white/5 dark:bg-[#0a0f1e]/40"
        >
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500"
          >
            <FileIcon class="h-6 w-6" />
          </div>
          <h4 class="mb-1 font-bold text-slate-800 dark:text-slate-100">No documents found</h4>
          <p class="mx-auto mb-6 max-w-sm text-xs text-slate-400 dark:text-slate-500">
            No files match your current filters. Select a template or create a blank file to start drafting!
          </p>
          <button
            type="button"
            class="rounded-lg bg-cyan-500 px-5 py-2.5 text-xs font-bold text-black shadow-cyan transition-all hover:bg-cyan-400"
            @click="handleCreateFromTemplate('blank')"
          >
            Create Blank Document
          </button>
        </div>
      </main>
    </div>
  </div>
</template>
