<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Eye, PenLine, Star } from 'lucide-vue-next'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'

/**
 * Document title row: click-to-rename, star toggle and the read-only mode badge
 * (#27/#28). Renaming is transient — the trimmed value goes to the host through
 * `update:title` and is never written to the document.
 */
const props = defineProps<{
  title: string
  starred: boolean
  /** Document mode (#27/#28) — drives the suggesting/viewing badge. */
  mode: DocumentMode
}>()

const emit = defineEmits<{
  'update:title': [title: string]
  'toggle-star': []
}>()

const { t } = useLocale()

const isRenaming = ref(false)
const titleInput = ref(props.title)
const titleInputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.title,
  (next) => {
    titleInput.value = next
  },
)

async function startRenaming(): Promise<void> {
  isRenaming.value = true
  await nextTick()
  titleInputEl.value?.focus()
  titleInputEl.value?.select()
}

function handleSaveTitle(): void {
  const trimmed = titleInput.value.trim()
  if (trimmed && trimmed !== props.title) {
    emit('update:title', trimmed)
  }
  titleInput.value = props.title
  isRenaming.value = false
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <input
      v-if="isRenaming"
      ref="titleInputEl"
      v-model="titleInput"
      type="text"
      class="min-w-[150px] border-b-2 border-cyan-500 bg-transparent px-1 py-0 text-sm font-semibold text-slate-800 focus:outline-none dark:text-slate-100 md:min-w-[240px]"
      @blur="handleSaveTitle"
      @keydown.enter="handleSaveTitle"
    >
    <h1
      v-else
      class="max-w-[180px] cursor-text truncate rounded px-1 py-0 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60 md:max-w-[280px]"
      :title="t('header.clickToRename')"
      @click="void startRenaming()"
    >
      {{ props.title }}
    </h1>

    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-amber-500"
      :title="props.starred ? t('header.unstarDocument') : t('header.starDocument')"
      :aria-label="props.starred ? t('header.unstarDocument') : t('header.starDocument')"
      @click="emit('toggle-star')"
    >
      <Star class="h-4 w-4" :class="props.starred ? 'fill-amber-400 text-amber-500' : ''" />
    </button>

    <!-- Document-mode indicator (#27/#28) — makes suggesting/viewing obvious -->
    <span
      v-if="props.mode === 'suggesting'"
      class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
      :title="t('header.modeSuggesting')"
    >
      <PenLine class="h-3 w-3" />
      {{ t('header.modeSuggesting') }}
    </span>
    <span
      v-else-if="props.mode === 'viewing'"
      class="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-400/15 dark:text-slate-300"
      :title="t('header.modeViewing')"
    >
      <Eye class="h-3 w-3" />
      {{ t('header.modeViewing') }}
    </span>
  </div>
</template>
