<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * A NON-default references sidebar for the playground — the host-side counterpart
 * of the built-in ReferencesSidebar. It exists to demonstrate DocsEditor's
 * scoped `#references-sidebar` slot (issue #22): a semantic knowledge-base
 * picker that shows snippets + relevance scores + page numbers instead of the
 * plain CSL list.
 *
 * It plays the role of `fe-aktifai`'s KB picker: the host fetches (simulated
 * here from the in-memory sources) and the editor just inserts the chosen
 * `sourceId` through `onInsert`.
 */

interface KbAuthor {
  family?: string
  given?: string
}
interface KbSource {
  id: string
  type?: string
  title?: string
  author?: KbAuthor[]
  issued?: { 'date-parts'?: number[][] }
  publisher?: string
  'container-title'?: string
}

const props = defineProps<{
  sources: KbSource[]
  activeStyle?: string
  pickerMode?: boolean
}>()

const emit = defineEmits<{ insert: [sourceId: string]; close: [] }>()

const query = ref('')

const year = (s: KbSource): string | number => s.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.'
const authorLine = (s: KbSource): string => {
  const first = s.author?.[0]
  if (!first) return 'Anon.'
  return first.family ?? first.given ?? 'Anon.'
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

    <div class="px-4 pt-3">
      <label class="relative block">
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
        <button
          type="button"
          class="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-500"
          :title="pickerMode ? 'Cite this source' : 'Insert citation'"
          @click="emit('insert', result.source.id)"
        >
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M7 7h4v4c0 2-1 3-4 3M15 7h2v10" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ pickerMode ? 'Cite' : 'Insert citation' }}
        </button>
      </li>
    </ol>

    <footer class="border-t border-indigo-200/60 px-4 py-2 text-[10px] text-slate-400 dark:border-indigo-400/20 dark:text-slate-500">
      style: <code>{{ activeStyle }}</code>
    </footer>
  </aside>
</template>
