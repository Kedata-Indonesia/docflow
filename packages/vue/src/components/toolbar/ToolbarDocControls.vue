<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { Printer, Redo2, SpellCheck, Undo2 } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass } from './toolbarConfig.js'
import { toolbarCommands } from './toolbarCommands.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  print: []
}>()

function handleUndo() {
  if (props.editor) {
    toolbarCommands(props.editor).undo()
    props.editor.commands.focus()
  }
  emit('undo')
}

function handleRedo() {
  if (props.editor) {
    toolbarCommands(props.editor).redo()
    props.editor.commands.focus()
  }
  emit('redo')
}

function handlePrint() {
  emit('print')
}
</script>

<template>
  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.undo')"
    :aria-label="t('toolbar.undo')"
    :disabled="!editor"
    @mousedown.prevent
    @click="handleUndo"
  >
    <Undo2 class="h-[18px] w-[18px]" />
  </button>

  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.redo')"
    :aria-label="t('toolbar.redo')"
    :disabled="!editor"
    @mousedown.prevent
    @click="handleRedo"
  >
    <Redo2 class="h-[18px] w-[18px]" />
  </button>

  <span class="mx-1 h-5 w-px flex-shrink-0 bg-slate-200 dark:bg-white/10" />

  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.print')"
    :aria-label="t('toolbar.print')"
    @mousedown.prevent
    @click="handlePrint"
  >
    <Printer class="h-[18px] w-[18px]" />
  </button>

  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.spelling')"
    :aria-label="t('toolbar.spelling')"
    :disabled="!editor"
    @mousedown.prevent
  >
    <SpellCheck class="h-[18px] w-[18px]" />
  </button>

  <button
    type="button"
    :class="[controlBaseClass, 'px-2 text-xs']"
    :title="t('toolbar.zoom')"
    :aria-label="t('toolbar.zoom')"
    @mousedown.prevent
  >
    {{ t('toolbar.zoom') }}
  </button>
</template>
