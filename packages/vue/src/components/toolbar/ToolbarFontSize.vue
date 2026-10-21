<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { Minus, Plus } from 'lucide-vue-next'
import { ref } from 'vue'
import { useFontSize } from '../../composables/useFontSize.js'
import { useLocale } from '../../composables/useLocale.js'
import { FONT_SIZES, controlBaseClass } from './toolbarConfig.js'

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
  applyFontSize,
  commitFontSize,
  cancelFontSize,
} = useFontSize(() => props.editor ?? null, () => props.selectionTick)

/**
 * Issue #347 — the field used to be type-or-step only. Focusing it now also opens the preset
 * list and picking one applies that size; typing and −/+ keep working exactly as before.
 */
const sizeMenuOpen = ref(false)

function pickSize(size: number) {
  applyFontSize(size)
  // The draft was seeded when the field got focus; clear it or the field keeps showing the
  // old size after the preset has been applied.
  fontSizeDraft.value = null
  sizeMenuOpen.value = false
}
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
  <div class="relative flex-shrink-0">
    <input
      type="text"
      inputmode="numeric"
      class="h-8 w-8 rounded border border-transparent bg-transparent text-center text-xs text-slate-700 outline-none transition hover:border-slate-300 focus:border-cyan-400 focus:bg-white disabled:opacity-40 dark:text-slate-200 dark:hover:border-slate-600 dark:focus:bg-slate-800"
      :value="fontSizeDraft ?? String(currentFontSize)"
      :title="t('toolbar.fontSize')"
      :aria-label="t('toolbar.fontSize')"
      :disabled="!editor"
      :aria-expanded="sizeMenuOpen"
      aria-haspopup="listbox"
      role="combobox"
      aria-controls="docflow-font-size-menu"
      aria-autocomplete="list"
      data-testid="toolbar-font-size-field"
      @focus="onFontSizeFocus($event); sizeMenuOpen = true"
      @click="sizeMenuOpen = true"
      @input="onFontSizeInput"
      @keydown.down.prevent="sizeMenuOpen = true"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      @keydown.esc.prevent="cancelFontSize($event); sizeMenuOpen = false"
      @blur="commitFontSize($event); sizeMenuOpen = false"
    />
    <div
      v-if="sizeMenuOpen"
      id="docflow-font-size-menu"
      class="absolute left-0 top-full z-50 mt-1 max-h-60 w-20 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
      role="listbox"
      :aria-label="t('toolbar.fontSize')"
    >
      <button
        v-for="size in FONT_SIZES"
        :key="size"
        type="button"
        role="option"
        :aria-selected="size === currentFontSize"
        class="flex w-full items-center px-3 py-1 text-left hover:bg-slate-50 dark:hover:bg-white/5"
        :class="size === currentFontSize ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'"
        data-testid="toolbar-font-size-option"
        @mousedown.prevent="pickSize(size)"
      >
        {{ size }}
      </button>
    </div>
  </div>
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
