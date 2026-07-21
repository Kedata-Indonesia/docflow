<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { X, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale.js'
import {
  getSearchState,
  setSearchQuery,
  clearSearch,
  searchNext,
  searchPrev,
  replaceCurrent,
  replaceAll,
  type SearchState,
} from '@kedata-indonesia/docflow-core'
import type { Editor as TiptapEditor } from '@tiptap/core'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  editor: TiptapEditor | null
}>()

const emit = defineEmits<{
  close: []
}>()

const findInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const replacement = ref('')
const searchState = ref<SearchState>({ query: '', matches: [], activeIndex: 0 })

const matchSummary = computed(() => {
  if (!query.value) return ''
  const { matches, activeIndex } = searchState.value
  if (matches.length === 0) return t('editor.findReplace.noMatches')
  return t('editor.findReplace.matchCount', { current: activeIndex + 1, total: matches.length })
})

// Mirror the plugin state into the component after every transaction.
const onTransaction = () => {
  if (props.editor) searchState.value = getSearchState(props.editor)
}

watch(() => props.editor, (next, prev) => {
  prev?.off('transaction', onTransaction)
  next?.on('transaction', onTransaction)
})

watch(() => props.isOpen, async (open) => {
  if (!props.editor) return
  if (open) {
    // Prefill the query from the current selection (Google Docs behavior).
    const { from, to } = props.editor.state.selection
    if (from !== to) {
      query.value = props.editor.state.doc.textBetween(from, to, ' ')
    }
    applyQuery()
    props.editor.on('transaction', onTransaction)
    await nextTick()
    findInput.value?.focus()
    findInput.value?.select()
  } else {
    closeAndClear()
  }
})

function applyQuery() {
  if (!props.editor) return
  setSearchQuery(props.editor, query.value)
  onTransaction()
}

// Live search as the user types.
watch(query, applyQuery)

function next() { if (props.editor) searchNext(props.editor) }
function prev() { if (props.editor) searchPrev(props.editor) }
function replace() { if (props.editor) replaceCurrent(props.editor, replacement.value) }
function replaceEvery() { if (props.editor) replaceAll(props.editor, replacement.value) }

function onFindKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    prev()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    next()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeAndClear()
  }
}

function closeAndClear() {
  if (props.editor) clearSearch(props.editor)
  props.editor?.off('transaction', onTransaction)
  query.value = ''
  replacement.value = ''
  searchState.value = { query: '', matches: [], activeIndex: 0 }
  emit('close')
}

onUnmounted(() => {
  props.editor?.off('transaction', onTransaction)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute right-4 top-16 z-40 w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-[#0e1525]"
    role="dialog"
    :aria-label="t('editor.findReplace.title')"
  >
    <!-- Find row -->
    <div class="flex items-center gap-1.5">
      <input
        ref="findInput"
        v-model="query"
        type="text"
        :placeholder="t('editor.findReplace.findPlaceholder')"
        class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2.5 py-1.5 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:text-slate-100"
        @keydown="onFindKeydown"
      >
      <span class="w-16 flex-shrink-0 text-center text-[11px] text-slate-400 dark:text-slate-500">
        {{ matchSummary }}
      </span>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
        :disabled="searchState.matches.length === 0"
        :title="t('editor.findReplace.previous')"
        @click="prev"
      >
        <ChevronUp class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
        :disabled="searchState.matches.length === 0"
        :title="t('editor.findReplace.next')"
        @click="next"
      >
        <ChevronDown class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        :title="t('editor.findReplace.close')"
        @click="closeAndClear"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Replace row -->
    <div class="mt-2 flex items-center gap-1.5">
      <input
        v-model="replacement"
        type="text"
        :placeholder="t('editor.findReplace.replacePlaceholder')"
        class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2.5 py-1.5 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:text-slate-100"
        @keydown.enter.prevent="replace"
      >
      <button
        type="button"
        class="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-white/5"
        :disabled="searchState.matches.length === 0"
        @click="replace"
      >
        {{ t('editor.findReplace.replace') }}
      </button>
      <button
        type="button"
        class="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-30 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-white/5"
        :disabled="searchState.matches.length === 0"
        @click="replaceEvery"
      >
        {{ t('editor.findReplace.replaceAll') }}
      </button>
    </div>
  </div>
</template>
