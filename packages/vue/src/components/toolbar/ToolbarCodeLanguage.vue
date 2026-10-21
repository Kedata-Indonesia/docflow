<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import { ChevronDown, Code } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass } from './toolbarConfig.js'
import { CODE_BLOCK_LANGUAGES } from './codeBlockLanguages.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  open: boolean
  selectionTick: number
}>()

const emit = defineEmits<{
  toggle: []
  close: []
}>()

/** Only advertise the picker while the caret is inside a code block. */
const inCodeBlock = computed(() => {
  void props.selectionTick
  return props.editor?.isActive('codeBlock') ?? false
})

const currentLanguage = computed(() => {
  void props.selectionTick
  const language = props.editor?.getAttributes('codeBlock').language as string | undefined
  return language ?? null
})

const currentLabel = computed(() => {
  const found = CODE_BLOCK_LANGUAGES.find((item) => item.id === (currentLanguage.value ?? 'plaintext'))
  if (!found) return currentLanguage.value ?? t('toolbar.plainText')
  return found.labelKey ? t(found.labelKey) : found.label
})

function apply(id: string): void {
  const editor = props.editor
  if (!editor) return
  editor
    .chain()
    .focus()
    .updateAttributes('codeBlock', { language: id === 'plaintext' ? null : id })
    .run()
  emit('close')
}
</script>

<template>
  <div v-if="inCodeBlock" class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      :class="[controlBaseClass, 'gap-1 px-2 text-xs font-medium']"
      :title="t('toolbar.codeLanguage')"
      :aria-label="t('toolbar.codeLanguage')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @mousedown.prevent
      @click.stop="emit('toggle')"
    >
      <Code class="h-4 w-4" />
      <span class="hidden md:inline">{{ currentLabel }}</span>
      <ChevronDown class="h-3 w-3 text-slate-400" />
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-50 mt-1 max-h-72 w-44 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
    >
      <button
        v-for="language in CODE_BLOCK_LANGUAGES"
        :key="language.id"
        type="button"
        :class="[
          'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5',
          language.id === (currentLanguage ?? 'plaintext')
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-slate-700 dark:text-slate-200',
        ]"
        @mousedown.prevent
        @click="apply(language.id)"
      >
        {{ language.labelKey ? t(language.labelKey) : language.label }}
      </button>
    </div>
  </div>
</template>
