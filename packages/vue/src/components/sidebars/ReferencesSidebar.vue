<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BookOpen,
  X,
  Search,
  Plus,
  Pencil,
  Trash2,
  Quote,
  ChevronLeft,
  ChevronDown,
  Globe,
  FileUp,
} from 'lucide-vue-next'
import type { CslItemData, CslName } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'

/**
 * Reference manager — a backend-agnostic UI shell (Phase 6B-3). It owns no
 * data and no editor access: sources + the active style come in as props,
 * every mutation goes out as an event. Hosts (apps/web with the REST API,
 * apps/demo in-memory) wire the events to their persistence.
 */

export interface ReferenceStyleOption {
  id: string
  name: string
}

const props = withDefaults(
  defineProps<{
    sources: CslItemData[]
    activeStyle: string
    /** Highlight the "Cite" action — used while an insert-citation request is pending. */
    pickerMode?: boolean
    availableStyles?: ReferenceStyleOption[]
    /** Show the import section (host implements the import ports, Phase 6C). */
    canImport?: boolean
    /** An import is in flight — disable the import actions. */
    importing?: boolean
    /** Host-provided import result message (success or error). */
    importMessage?: string
  }>(),
  {
    pickerMode: false,
    availableStyles: () => [
      { id: 'chicago-notes-bibliography', name: 'Chicago (notes & bibliography)' },
      { id: 'chicago-author-date', name: 'Chicago (author-date)' },
      { id: 'apa', name: 'APA' },
      { id: 'modern-language-association', name: 'MLA' },
    ],
    canImport: false,
    importing: false,
    importMessage: '',
  },
)

const emit = defineEmits<{
  close: []
  insert: [sourceId: string]
  create: [source: CslItemData]
  update: [source: CslItemData]
  remove: [id: string]
  'update:style': [styleId: string]
  'import-doi': [doi: string]
  'import-bibliography': [payload: { format: 'bibtex' | 'ris'; text: string }]
}>()

const { t } = useLocale()

// ─── List / search ──────────────────────────────────────────────────────────

const searchQuery = ref('')

const sourceTypes = [
  'book',
  'article-journal',
  'chapter',
  'webpage',
  'report',
  'thesis',
  'document',
] as const

function authorLabel(source: CslItemData): string {
  const authors = source.author ?? []
  if (authors.length === 0) return t('sidebars.references.anonymous')
  const first = authors[0]
  const name = first.family ?? first.literal ?? ''
  return authors.length > 1 ? `${name} ${t('sidebars.references.etAl')}` : name
}

function yearOf(source: CslItemData): string {
  const parts = source.issued?.['date-parts']?.[0]
  return parts?.[0] ? String(parts[0]) : ''
}

function typeLabel(type: string): string {
  const key = `sidebars.references.types.${type}`
  const translated = t(key)
  return translated === key ? type : translated
}

const filteredSources = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.sources
  return props.sources.filter((s) => {
    const haystack = [
      s.title,
      s['container-title'],
      s.publisher,
      s.DOI,
      s.URL,
      ...(s.author ?? []).map((a) => `${a.family ?? ''} ${a.given ?? ''} ${a.literal ?? ''}`),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

// ─── Form (create / edit) ───────────────────────────────────────────────────

const mode = ref<'list' | 'form'>('list')
const editingId = ref<string | null>(null)

interface AuthorRow { family: string; given: string }

const formType = ref<string>('book')
const formTitle = ref('')
const formAuthors = ref<AuthorRow[]>([{ family: '', given: '' }])
const formYear = ref('')
const formPublisher = ref('')
const formPublisherPlace = ref('')
const formContainerTitle = ref('')
const formVolume = ref('')
const formIssue = ref('')
const formPage = ref('')
const formDOI = ref('')
const formURL = ref('')

function resetForm() {
  formType.value = 'book'
  formTitle.value = ''
  formAuthors.value = [{ family: '', given: '' }]
  formYear.value = ''
  formPublisher.value = ''
  formPublisherPlace.value = ''
  formContainerTitle.value = ''
  formVolume.value = ''
  formIssue.value = ''
  formPage.value = ''
  formDOI.value = ''
  formURL.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  mode.value = 'form'
}

function openEdit(source: CslItemData) {
  editingId.value = source.id
  formType.value = source.type || 'book'
  formTitle.value = source.title ?? ''
  formAuthors.value = (source.author ?? [])
    .filter((a) => !a.literal)
    .map((a) => ({ family: a.family ?? '', given: a.given ?? '' }))
  const literal = (source.author ?? []).find((a) => a.literal)
  if (formAuthors.value.length === 0) {
    formAuthors.value = [{ family: literal?.literal ?? '', given: '' }]
  }
  formYear.value = yearOf(source)
  formPublisher.value = source.publisher ?? ''
  formPublisherPlace.value = source['publisher-place'] ?? ''
  formContainerTitle.value = source['container-title'] ?? ''
  formVolume.value = source.volume ?? ''
  formIssue.value = source.issue ?? ''
  formPage.value = source.page ?? ''
  formDOI.value = source.DOI ?? ''
  formURL.value = source.URL ?? ''
  mode.value = 'form'
}

function addAuthor() {
  formAuthors.value.push({ family: '', given: '' })
}

function removeAuthor(index: number) {
  formAuthors.value.splice(index, 1)
  if (formAuthors.value.length === 0) formAuthors.value.push({ family: '', given: '' })
}

const showPublisherFields = computed(() => ['book', 'chapter', 'report', 'thesis', 'document'].includes(formType.value))
const showContainerFields = computed(() => ['article-journal', 'chapter'].includes(formType.value))
const showLocatorFields = computed(() => ['article-journal', 'chapter'].includes(formType.value))
const showUrlField = computed(() => ['webpage', 'report'].includes(formType.value))

const formValid = computed(() => formTitle.value.trim().length > 0)

function buildSource(): CslItemData {
  const authors: CslName[] = formAuthors.value
    .filter((a) => a.family.trim() || a.given.trim())
    .map((a) => ({ family: a.family.trim(), given: a.given.trim() }))
  const year = parseInt(formYear.value, 10)

  const source: CslItemData = {
    id: editingId.value ?? crypto.randomUUID(),
    type: formType.value,
    title: formTitle.value.trim(),
  }
  if (authors.length > 0) source.author = authors
  if (Number.isFinite(year)) source.issued = { 'date-parts': [[year]] }
  if (formPublisher.value.trim()) source.publisher = formPublisher.value.trim()
  if (formPublisherPlace.value.trim()) source['publisher-place'] = formPublisherPlace.value.trim()
  if (formContainerTitle.value.trim()) source['container-title'] = formContainerTitle.value.trim()
  if (formVolume.value.trim()) source.volume = formVolume.value.trim()
  if (formIssue.value.trim()) source.issue = formIssue.value.trim()
  if (formPage.value.trim()) source.page = formPage.value.trim()
  if (formDOI.value.trim()) source.DOI = formDOI.value.trim()
  if (formURL.value.trim()) source.URL = formURL.value.trim()
  return source
}

function submitForm() {
  if (!formValid.value) return
  const source = buildSource()
  if (editingId.value) {
    emit('update', source)
  } else {
    emit('create', source)
  }
  mode.value = 'list'
}

function handleRemove(source: CslItemData) {
  if (window.confirm(t('sidebars.references.confirmDelete').replace('{title}', source.title ?? source.id))) {
    emit('remove', source.id)
  }
}

// ─── Import (Phase 6C) ──────────────────────────────────────────────────────

const importOpen = ref(false)
const doiInput = ref('')
const bibFileInput = ref<HTMLInputElement | null>(null)

function submitDoiImport() {
  const doi = doiInput.value.trim()
  if (!doi || props.importing) return
  emit('import-doi', doi)
  doiInput.value = ''
}

function pickBibFile() {
  if (props.importing) return
  bibFileInput.value?.click()
}

async function handleBibFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return
  const format = /\.ris$/i.test(file.name) ? 'ris' : 'bibtex'
  const text = await file.text()
  emit('import-bibliography', { format, text })
}
</script>

<template>
  <div class="references-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all animate-fadeIn dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/5">
      <div>
        <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <BookOpen class="h-4 w-4 text-cyan-500" /> {{ t('sidebars.references.title') }}
        </h3>
        <p class="mt-1 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">{{ t('sidebars.references.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
        :title="t('sidebars.references.close')"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- ═══ LIST MODE ═══ -->
    <template v-if="mode === 'list'">
      <!-- Citation style selector -->
      <div class="border-b border-slate-100 px-4 pb-3 pt-3 dark:border-white/5">
        <label class="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {{ t('sidebars.references.citationStyle') }}
        </label>
        <select
          :value="activeStyle"
          class="w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
          @change="emit('update:style', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="style in availableStyles" :key="style.id" :value="style.id">{{ style.name }}</option>
        </select>
      </div>

      <!-- Search + add -->
      <div class="flex items-center gap-2 px-4 pb-2 pt-3">
        <div class="relative flex flex-1 items-center">
          <Search class="absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('sidebars.references.searchSources')"
            class="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-700 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-cyan-400/30"
          >
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2.5 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
            @click="searchQuery = ''"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow transition-colors hover:bg-blue-700"
          :title="t('sidebars.references.addSource')"
          @click="openCreate"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>

      <!-- Source list -->
      <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div v-if="sources.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
          <div class="mb-3 rounded-full bg-cyan-500/10 p-3 text-cyan-500 dark:bg-cyan-400/5">
            <BookOpen class="h-6 w-6" />
          </div>
          <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">{{ t('sidebars.references.noSources') }}</h4>
          <p class="mt-1.5 max-w-[220px] text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">{{ t('sidebars.references.noSourcesDescription') }}</p>
          <button
            type="button"
            class="mt-5 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-semibold text-white shadow transition-colors hover:bg-blue-700"
            @click="openCreate"
          >
            <Plus class="h-3.5 w-3.5" /> {{ t('sidebars.references.addSource') }}
          </button>
        </div>

        <div v-else-if="filteredSources.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
          <Search class="mb-2 h-5 w-5 text-slate-300" />
          <p class="text-xs font-semibold">{{ t('sidebars.references.noMatchingSources') }}</p>
        </div>

        <div v-else class="space-y-2 font-sans">
          <div
            v-for="source in filteredSources"
            :key="source.id"
            class="group rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 transition-all hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-semibold text-slate-800 dark:text-slate-200" :title="source.title">
                {{ source.title }}
              </p>
              <p class="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                {{ authorLabel(source) }}<span v-if="yearOf(source)"> ({{ yearOf(source) }})</span>
                <span v-if="source['container-title']"> · {{ source['container-title'] }}</span>
                <span v-else-if="source.publisher"> · {{ source.publisher }}</span>
              </p>
              <span class="mt-1.5 inline-block rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-400">
                {{ typeLabel(source.type) }}
              </span>
            </div>
            <div class="mt-2.5 flex items-center gap-1.5">
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors"
                :class="pickerMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-200/80 text-slate-700 hover:bg-blue-600 hover:text-white dark:bg-white/10 dark:text-slate-300 dark:hover:bg-blue-600'"
                @click="emit('insert', source.id)"
              >
                <Quote class="h-3 w-3" /> {{ t('sidebars.references.cite') }}
              </button>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                :title="t('sidebars.references.edit')"
                @click="openEdit(source)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                :title="t('sidebars.references.delete')"
                @click="handleRemove(source)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Import (Phase 6C) — collapsible footer; only when the host
           implements the import ports -->
      <div v-if="canImport" class="border-t border-slate-200 dark:border-white/5">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          @click="importOpen = !importOpen"
        >
          <span>{{ t('sidebars.references.import.title') }}</span>
          <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="importOpen ? 'rotate-180' : ''" />
        </button>

        <div v-if="importOpen" class="space-y-3 px-4 pb-4">
          <!-- DOI -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {{ t('sidebars.references.import.fromDoi') }}
            </label>
            <div class="flex items-center gap-1.5">
              <input
                v-model="doiInput"
                type="text"
                :placeholder="t('sidebars.references.import.doiPlaceholder')"
                class="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
                @keydown.enter="submitDoiImport"
              >
              <button
                type="button"
                :disabled="importing || !doiInput.trim()"
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                :title="t('sidebars.references.import.importDoi')"
                @click="submitDoiImport"
              >
                <Globe class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- BibTeX / RIS file -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {{ t('sidebars.references.import.fromFile') }}
            </label>
            <button
              type="button"
              :disabled="importing"
              class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-white/15 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
              @click="pickBibFile"
            >
              <FileUp class="h-3.5 w-3.5" />
              {{ importing ? t('sidebars.references.import.importing') : t('sidebars.references.import.pickFile') }}
            </button>
            <input
              ref="bibFileInput"
              type="file"
              accept=".bib,.ris,application/x-bibtex,text/plain"
              class="hidden"
              @change="handleBibFileChange"
            >
          </div>

          <!-- Result message -->
          <p v-if="importMessage" class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            {{ importMessage }}
          </p>
        </div>
      </div>
    </template>

    <!-- ═══ FORM MODE ═══ -->
    <template v-else>
      <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
        <button
          type="button"
          class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
          :title="t('sidebars.references.back')"
          @click="mode = 'list'"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">
          {{ editingId ? t('sidebars.references.editSource') : t('sidebars.references.addSource') }}
        </h4>
      </div>

      <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
        <form class="space-y-3.5" @submit.prevent="submitForm">
          <!-- Type -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.type') }}</label>
            <select
              v-model="formType"
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
              <option v-for="type in sourceTypes" :key="type" :value="type">{{ typeLabel(type) }}</option>
            </select>
          </div>

          <!-- Title -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.title') }} *</label>
            <input
              v-model="formTitle"
              type="text"
              required
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
          </div>

          <!-- Authors -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.authors') }}</label>
            <div class="space-y-2">
              <div v-for="(author, index) in formAuthors" :key="index" class="flex items-center gap-1.5">
                <input
                  v-model="author.family"
                  type="text"
                  :placeholder="t('sidebars.references.form.familyName')"
                  class="w-1/2 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
                >
                <input
                  v-model="author.given"
                  type="text"
                  :placeholder="t('sidebars.references.form.givenName')"
                  class="w-1/2 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
                >
                <button
                  type="button"
                  class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  @click="removeAuthor(index)"
                >
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <button
              type="button"
              class="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              @click="addAuthor"
            >
              <Plus class="h-3 w-3" /> {{ t('sidebars.references.form.addAuthor') }}
            </button>
          </div>

          <!-- Year -->
          <div>
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.year') }}</label>
            <input
              v-model="formYear"
              type="number"
              min="0"
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
          </div>

          <!-- Container (journal / book title for chapters) -->
          <div v-if="showContainerFields">
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {{ formType === 'chapter' ? t('sidebars.references.form.bookTitle') : t('sidebars.references.form.journal') }}
            </label>
            <input
              v-model="formContainerTitle"
              type="text"
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
          </div>

          <!-- Publisher -->
          <div v-if="showPublisherFields" class="grid grid-cols-2 gap-2">
            <div>
              <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.publisher') }}</label>
              <input
                v-model="formPublisher"
                type="text"
                class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
              >
            </div>
            <div>
              <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.publisherPlace') }}</label>
              <input
                v-model="formPublisherPlace"
                type="text"
                class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
              >
            </div>
          </div>

          <!-- Volume / issue / pages -->
          <div v-if="showLocatorFields" class="grid grid-cols-3 gap-2">
            <div>
              <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.volume') }}</label>
              <input
                v-model="formVolume"
                type="text"
                class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
              >
            </div>
            <div>
              <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.issue') }}</label>
              <input
                v-model="formIssue"
                type="text"
                class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
              >
            </div>
            <div>
              <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">{{ t('sidebars.references.form.pages') }}</label>
              <input
                v-model="formPage"
                type="text"
                class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
              >
            </div>
          </div>

          <!-- DOI -->
          <div v-if="formType === 'article-journal'">
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">DOI</label>
            <input
              v-model="formDOI"
              type="text"
              placeholder="10.xxxx/xxxxx"
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
          </div>

          <!-- URL -->
          <div v-if="showUrlField">
            <label class="mb-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">URL</label>
            <input
              v-model="formURL"
              type="url"
              placeholder="https://…"
              class="w-full rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 pt-1.5">
            <button
              type="submit"
              :disabled="!formValid"
              class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {{ editingId ? t('sidebars.references.form.save') : t('sidebars.references.form.create') }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              @click="mode = 'list'"
            >
              {{ t('sidebars.references.form.cancel') }}
            </button>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>
