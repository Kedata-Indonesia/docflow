<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileUp, Trash2 } from 'lucide-vue-next'
import { useLocale } from '../../../composables/useLocale.js'
import type { ReferenceStyleOption } from './format.js'

/**
 * Citation-style selector (Phase 6C / issues #251, #361): pick a style, import a
 * `.csl` file (parsed by the library, no host port), and — only for imported
 * styles currently in use — remove it. Bundled styles are never removable.
 */
const props = withDefaults(
  defineProps<{
    activeStyle: string
    availableStyles?: ReferenceStyleOption[]
    /** Issue #251 — result message for a `.csl` style import (success or error). */
    styleImportMessage?: string
  }>(),
  { availableStyles: () => [], styleImportMessage: '' },
)

const emit = defineEmits<{
  'update:style': [styleId: string]
  'remove-style': [styleId: string]
  'import-style': [payload: { text: string; filename?: string }]
}>()

const { t } = useLocale()

const removable = computed(
  () => props.availableStyles.find((style) => style.id === props.activeStyle)?.removable === true,
)

const fileInput = ref<HTMLInputElement | null>(null)

function pickFile() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return
  try {
    const text = await file.text()
    emit('import-style', { text, filename: file.name })
  } catch {
    // An unreadable file is not a valid style; let the composable report it.
    emit('import-style', { text: '', filename: file.name })
  }
}
</script>

<template>
  <div class="border-b border-slate-100 px-4 pb-3 pt-3 dark:border-white/5">
    <label class="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
      {{ t('sidebars.references.citationStyle') }}
    </label>
    <div class="flex items-center gap-2">
      <select
        data-testid="citation-style-select"
        :value="activeStyle"
        class="min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
        @change="emit('update:style', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="style in availableStyles" :key="style.id" :value="style.id">{{ style.name }}</option>
      </select>
      <!-- Issue #361 — remove the imported style that is currently active.
           Bundled styles never offer this. -->
      <button
        v-if="removable"
        type="button"
        data-testid="citation-style-remove-button"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-white/10 dark:hover:border-red-500/40 dark:hover:bg-red-500/10"
        :title="t('sidebars.references.removeStyle')"
        :aria-label="t('sidebars.references.removeStyle')"
        @click="emit('remove-style', activeStyle)"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Issue #251 — import a CSL style; parsed + registered by the library,
         so it is not gated on the host's reference-import ports. -->
    <button
      type="button"
      data-testid="citation-style-import-button"
      class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 dark:border-white/15 dark:text-slate-400 dark:hover:border-white/30 dark:hover:text-slate-200"
      :title="t('sidebars.references.styleImport.title')"
      :aria-label="t('sidebars.references.styleImport.title')"
      @click="pickFile"
    >
      <FileUp class="h-3.5 w-3.5" />
      {{ t('sidebars.references.styleImport.pick') }}
    </button>
    <input
      ref="fileInput"
      data-testid="citation-style-import-input"
      type="file"
      accept=".csl,.bst,.ens,application/xml,text/xml"
      class="hidden"
      @change="handleFileChange"
    >
    <p
      v-if="styleImportMessage"
      data-testid="citation-style-import-message"
      role="status"
      class="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400"
    >
      {{ styleImportMessage }}
    </p>
  </div>
</template>
