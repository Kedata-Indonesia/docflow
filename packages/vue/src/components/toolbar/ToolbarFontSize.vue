<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { Minus, Plus } from 'lucide-vue-next'
import { useFontSize } from '../../composables/useFontSize.js'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass } from './toolbarConfig.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
  selectionTick: number
}>()

const {
  currentFontSize,
  handleFontSize,
  fontSizeDraft,
  onFontSizeFocus,
  onFontSizeInput,
  commitFontSize,
  cancelFontSize,
} = useFontSize(() => props.editor ?? null, () => props.selectionTick)
</script>

<template>
  <button
    type="button"
    :class="[controlBaseClass, 'w-7 text-sm']"
    :title="t('toolbar.decreaseFontSize')"
    :aria-label="t('toolbar.decreaseFontSize')"
    :disabled="!editor"
    @mousedown.prevent="handleFontSize(-1)"
  >
    <Minus class="h-3.5 w-3.5" />
  </button>
  <input
    type="text"
    inputmode="numeric"
    class="h-8 w-8 flex-shrink-0 rounded border border-transparent bg-transparent text-center text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-cyan-400 focus:bg-white disabled:opacity-40 dark:text-slate-200 dark:hover:border-slate-600 dark:focus:bg-slate-800"
    :value="fontSizeDraft ?? String(currentFontSize)"
    :title="t('toolbar.fontSize')"
    :aria-label="t('toolbar.fontSize')"
    :disabled="!editor"
    @focus="onFontSizeFocus"
    @input="onFontSizeInput"
    @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    @keydown.esc.prevent="cancelFontSize"
    @blur="commitFontSize"
  />
  <button
    type="button"
    :class="[controlBaseClass, 'w-7 text-sm']"
    :title="t('toolbar.increaseFontSize')"
    :aria-label="t('toolbar.increaseFontSize')"
    :disabled="!editor"
    @mousedown.prevent="handleFontSize(1)"
  >
    <Plus class="h-3.5 w-3.5" />
  </button>
</template>
