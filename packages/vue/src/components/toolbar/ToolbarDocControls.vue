<script setup lang="ts">
import { ref } from 'vue'
import type { Editor } from '@tiptap/core'
import { Printer, Redo2, SpellCheck, Undo2 } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { activeClass, controlBaseClass, inactiveClass } from './toolbarConfig.js'
import { toolbarCommands } from './toolbarCommands.js'
import { TOOLBAR_DIVIDER } from '../../styles/classes.js'

const { t } = useLocale()

const props = defineProps<{
  editor?: Editor | null
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  print: []
  'toggle-spellcheck': [enabled: boolean]
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

/**
 * Issue #306 — this button had a title and no handler at all. Spell checking is a
 * browser feature: it reads the `spellcheck` attribute of the editable element, so the
 * toggle writes that attribute and mirrors it in `aria-pressed`. Nothing else in the
 * editor has to know about it, and the attribute is applied to the live DOM node so it
 * survives re-renders (ProseMirror keeps the same element).
 */
const spellcheckEnabled = ref(props.editor?.view.dom.getAttribute('spellcheck') !== 'false')

function handleSpellcheck() {
  const editor = props.editor
  if (!editor) return
  spellcheckEnabled.value = !spellcheckEnabled.value
  editor.view.dom.setAttribute('spellcheck', spellcheckEnabled.value ? 'true' : 'false')
  emit('toggle-spellcheck', spellcheckEnabled.value)
  editor.commands.focus()
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

  <span :class="TOOLBAR_DIVIDER" />

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
    :class="[controlBaseClass, 'w-8', spellcheckEnabled ? activeClass : inactiveClass]"
    :title="t('toolbar.spelling')"
    :aria-label="t('toolbar.spelling')"
    :aria-pressed="spellcheckEnabled"
    data-testid="toolbar-spelling"
    :disabled="!editor"
    @mousedown.prevent
    @click="handleSpellcheck"
  >
    <SpellCheck class="h-[18px] w-[18px]" />
  </button>
</template>
