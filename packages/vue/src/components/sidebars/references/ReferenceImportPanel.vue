<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, FileUp, Globe } from 'lucide-vue-next'
import {
  BIBLIOGRAPHY_FILE_ACCEPT,
  detectBibliographyFormat,
  type BibliographyFormat,
} from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../../composables/useLocale.js'
import { FIELD_LABEL } from '../../../styles/classes.js'

/**
 * Import footer (Phase 6C) — rendered only when the host implements the import
 * ports. DOI and bibliography-file requests leave as events; the host owns the
 * fetch/parse, this panel owns nothing but its own input state.
 */
const props = withDefaults(
  defineProps<{
    /** An import is in flight — disable the import actions. */
    importing?: boolean
    /** Host-provided import result message (success or error). */
    importMessage?: string
  }>(),
  { importing: false, importMessage: '' },
)

const emit = defineEmits<{
  'import-doi': [doi: string]
  'import-bibliography': [payload: { format: BibliographyFormat; text: string }]
}>()

const { t } = useLocale()

const open = ref(false)
const doiInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileError = ref('')

function submitDoi() {
  const doi = doiInput.value.trim()
  if (!doi || props.importing) return
  emit('import-doi', doi)
  doiInput.value = ''
}

function pickFile() {
  if (props.importing) return
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return

  // Issue #353 — detect the format instead of assuming BibTeX/RIS: a `.json`
  // file used to be sent to the host labelled `bibtex`.
  const text = await file.text()
  const format = detectBibliographyFormat(file.name, text)
  if (!format) {
    fileError.value = t('sidebars.references.import.unsupportedFile')
    return
  }
  fileError.value = ''
  emit('import-bibliography', { format, text })
}
</script>

<template>
  <div class="border-t border-slate-200 dark:border-white/5">
    <button
      type="button"
      data-testid="import-toggle"
      class="flex w-full items-center justify-between px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      @click="open = !open"
    >
      <span>{{ t('sidebars.references.import.title') }}</span>
      <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>

    <div v-if="open" class="space-y-3 px-4 pb-4">
      <!-- DOI -->
      <div>
        <label :class="FIELD_LABEL">
          {{ t('sidebars.references.import.fromDoi') }}
        </label>
        <div class="flex items-center gap-1.5">
          <input
            v-model="doiInput"
            type="text"
            :placeholder="t('sidebars.references.import.doiPlaceholder')"
            class="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            @keydown.enter="submitDoi"
          >
          <button
            type="button"
            :disabled="importing || !doiInput.trim()"
            class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            :title="t('sidebars.references.import.importDoi')"
            :aria-label="t('sidebars.references.import.importDoi')"
            @click="submitDoi"
          >
            <Globe class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Reference file (BibTeX, RIS, EndNote, CSL-JSON, YAML, XML) -->
      <div>
        <label :class="FIELD_LABEL">
          {{ t('sidebars.references.import.fromFile') }}
        </label>
        <button
          type="button"
          :disabled="importing"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-white/15 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
          @click="pickFile"
        >
          <FileUp class="h-3.5 w-3.5" />
          {{ importing ? t('sidebars.references.import.importing') : t('sidebars.references.import.pickFile') }}
        </button>
        <input
          ref="fileInput"
          data-testid="import-file-input"
          type="file"
          :accept="BIBLIOGRAPHY_FILE_ACCEPT"
          class="hidden"
          @change="handleFileChange"
        >
        <p
          v-if="fileError"
          data-testid="import-file-error"
          class="mt-1.5 text-[10px] leading-relaxed text-red-500 dark:text-red-400"
        >
          {{ fileError }}
        </p>
      </div>

      <!-- Result message -->
      <p v-if="importMessage" class="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        {{ importMessage }}
      </p>
    </div>
  </div>
</template>
