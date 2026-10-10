<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

/**
 * A NON-default references sidebar for the playground — the host-side counterpart
 * of the built-in ReferencesSidebar. It exists to demonstrate DocsEditor's
 * scoped `#references-sidebar` slot (issue #22): a semantic knowledge-base
 * picker that shows snippets + relevance scores + page numbers instead of the
 * plain CSL list, and that also edits the reference library through the slot's
 * CRUD actions (`onCreate` / `onUpdate` / `onRemove` / `onStyleChange`).
 *
 * It plays the role of `fe-aktifai`'s KB picker: the host fetches (simulated
 * here from the in-memory sources) and the editor just inserts the chosen
 * `sourceId` through `onInsert`.
 */

interface KbAuthor {
  family?: string
  given?: string
  literal?: string
}
interface KbSource {
  id: string
  type: string
  title?: string
  author?: KbAuthor[]
  issued?: { 'date-parts'?: number[][] }
  publisher?: string
  'container-title'?: string
  // Matches `CslItemData`'s index signature so the slot's CRUD actions
  // (`(source: CslItemData) => void`) accept these payloads.
  [k: string]: unknown
}

const props = defineProps<{
  sources: KbSource[]
  activeStyle?: string
  pickerMode?: boolean
}>()

const emit = defineEmits<{
  insert: [sourceId: string]
  close: []
  create: [source: KbSource]
  update: [source: KbSource]
  remove: [id: string]
  'style-change': [styleId: string]
}>()

const STYLE_OPTIONS = [
  { id: 'chicago-notes-bibliography', name: 'Chicago (notes)' },
  { id: 'chicago-author-date', name: 'Chicago (author-date)' },
  { id: 'apa', name: 'APA' },
  { id: 'modern-language-association', name: 'MLA' },
]
const TYPE_OPTIONS = ['book', 'article-journal', 'chapter', 'report', 'webpage']

const query = ref('')

const year = (s: KbSource): number | string => s.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.'
const authorLine = (s: KbSource): string => {
  const first = s.author?.[0]
  if (!first) return 'Anon.'
  return first.family ?? first.given ?? first.literal ?? 'Anon.'
}

/** Simulated semantic search — deterministic scores so the demo is stable. */
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.sources
    .map((source, i) => {
      const haystack = `${source.title ?? ''} ${authorLine(source)} ${source.type ?? ''}`.toLowerCase()
      const hit = q.length > 0 && haystack.includes(q)
      const score = q.length === 0 ? 0.88 - i * 0.06 : hit ? 0.93 - i * 0.05 : 0.42 - i * 0.02
      return {
        source,
        score: Math.min(0.99, Math.max(0.3, score)),
        page: 12 + i * 7,
        snippet: `${(source.title ?? 'Untitled').slice(0, 64)} — matched passage for “${query.value || 'the whole corpus'}” from the indexed knowledge base.`,
      }
    })
    .sort((a, b) => b.score - a.score)
})

// ─── Editing the reference library through the slot's CRUD actions ──────────
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ title: '', type: 'book', year: '' })

const openCreate = () => {
  editingId.value = null
  form.title = ''
  form.type = 'book'
  form.year = String(new Date().getFullYear())
  formOpen.value = true
}

const openEdit = (source: KbSource) => {
  editingId.value = source.id
  form.title = source.title ?? ''
  form.type = source.type ?? 'book'
  form.year = String(year(source) === 'n.d.' ? '' : year(source))
  formOpen.value = true
}

const saveForm = () => {
  if (!form.title.trim()) return
  if (editingId.value) {
    const existing = props.sources.find((s) => s.id === editingId.value)
    if (existing) {
      emit('update', {
        ...existing,
        title: form.title.trim(),
        type: form.type,
        issued: form.year ? { 'date-parts': [[Number(form.year)]] } : existing.issued,
      })
    }
  } else {
    emit('create', {
      id: `kb-${Date.now()}`,
      type: form.type,
      title: form.title.trim(),
      author: [{ family: 'New source' }],
      issued: form.year ? { 'date-parts': [[Number(form.year)]] } : undefined,
    })
  }
  formOpen.value = false
}
</script>

<template>
  <aside
    class="kb-picker flex h-full w-80 flex-shrink-0 flex-col border-l border-indigo-200/70 bg-gradient-to-b from-indigo-50 to-white text-slate-800 animate-fadeIn dark:border-indigo-400/20 dark:from-[#0d1024] dark:to-[#0a0f1e] dark:text-slate-100"
  >
    <header class="flex items-center gap-2 border-b border-indigo-200/60 px-4 py-3 dark:border-indigo-400/20">
      <svg class="h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" stroke-linejoin="round" />
      </svg>
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-bold">Knowledge base</p>
        <p class="truncate text-[10px] text-indigo-500/80 dark:text-indigo-300/70">
          custom picker via <code>#references-sidebar</code>
        </p>
      </div>
      <button
        type="button"
        class="rounded-md p-1 text-slate-400 transition-colors hover:bg-indigo-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
        title="Close"
        aria-label="Close"
        @click="emit('close')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div
      v-if="pickerMode"
      class="border-b border-indigo-200/60 bg-indigo-500/10 px-4 py-2 text-[11px] font-medium text-indigo-700 dark:border-indigo-400/20 dark:text-indigo-200"
    >
      Inserting a citation — pick a source to cite.
    </div>

    <!-- Add / edit form — proves onCreate / onUpdate through the slot -->
    <form
      v-if="formOpen"
      class="space-y-2 border-b border-indigo-200/60 bg-indigo-50/70 px-4 py-3 dark:border-indigo-400/20 dark:bg-indigo-500/5"
      @submit.prevent="saveForm"
    >
      <p class="text-[11px] font-bold">{{ editingId ? 'Edit source' : 'Add source' }}</p>
      <input
        v-model="form.title"
        type="text"
        placeholder="Title"
        class="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 dark:border-indigo-400/25 dark:bg-white/5 dark:text-slate-100"
      />
      <div class="flex gap-2">
        <select
          v-model="form.type"
          class="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs dark:border-indigo-400/25 dark:bg-[#131735] dark:text-slate-100"
        >
          <option v-for="type in TYPE_OPTIONS" :key="type" :value="type">{{ type }}</option>
        </select>
        <input
          v-model="form.year"
          type="number"
          placeholder="Year"
          class="w-20 rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-indigo-400 dark:border-indigo-400/25 dark:bg-white/5 dark:text-slate-100"
        />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="rounded-md bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500">
          {{ editingId ? 'Save' : 'Create' }}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
          @click="formOpen = false"
        >
          Cancel
        </button>
      </div>
    </form>

    <div class="px-4 pt-3">
      <div class="flex items-center gap-2">
        <label class="relative block flex-1">
          <svg class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" stroke-linecap="round" />
          </svg>
          <input
            v-model="query"
            type="search"
            class="w-full rounded-lg border border-indigo-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none transition focus:border-indigo-400 dark:border-indigo-400/25 dark:bg-white/5 dark:text-slate-100"
            placeholder="Semantic search the knowledge base…"
          />
        </label>
        <button
          type="button"
          class="flex-shrink-0 rounded-lg border border-indigo-200 px-2 py-1.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-400/25 dark:text-indigo-300 dark:hover:bg-white/5"
          title="Add source"
          @click="openCreate"
        >
          + Add
        </button>
      </div>
      <p class="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
        {{ results.length }} indexed source(s) · ranked by relevance
      </p>
    </div>

    <ol class="mt-3 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
      <li
        v-for="result in results"
        :key="result.source.id"
        class="rounded-xl border border-indigo-200/70 bg-white/80 p-3 shadow-sm transition dark:border-indigo-400/15 dark:bg-white/[0.03]"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="text-xs font-semibold leading-snug">{{ result.source.title ?? 'Untitled' }}</p>
          <span
            class="flex-shrink-0 rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300"
          >
            {{ result.score.toFixed(2) }}
          </span>
        </div>
        <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          {{ authorLine(result.source) }} · {{ year(result.source) }} · p. {{ result.page }}
        </p>
        <p class="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{{ result.snippet }}</p>
        <div class="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-500"
            :title="pickerMode ? 'Cite this source' : 'Insert citation'"
            @click="emit('insert', result.source.id)"
          >
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M7 7h4v4c0 2-1 3-4 3M15 7h2v10" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ pickerMode ? 'Cite' : 'Insert citation' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-400/25 dark:text-indigo-300 dark:hover:bg-white/5"
            title="Edit source"
            @click="openEdit(result.source)"
          >
            Edit
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-[11px] font-medium text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
            title="Delete source"
            @click="emit('remove', result.source.id)"
          >
            Delete
          </button>
        </div>
      </li>
      <li v-if="results.length === 0" class="px-2 py-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
        No indexed sources. Use <strong>+ Add</strong> to create one.
      </li>
    </ol>

    <footer class="flex items-center gap-2 border-t border-indigo-200/60 px-4 py-2 text-[10px] text-slate-400 dark:border-indigo-400/20 dark:text-slate-500">
      <span>style</span>
      <select
        :value="activeStyle"
        class="flex-1 rounded-md border border-indigo-200 bg-white px-1.5 py-1 text-[10px] dark:border-indigo-400/25 dark:bg-[#131735] dark:text-slate-100"
        @change="emit('style-change', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="style in STYLE_OPTIONS" :key="style.id" :value="style.id">{{ style.name }}</option>
      </select>
    </footer>
  </aside>
</template>
