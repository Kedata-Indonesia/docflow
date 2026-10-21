<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { INDENT_MAX_LEVEL } from '@kedata-indonesia/docflow-core'
import { IndentDecrease, IndentIncrease } from 'lucide-vue-next'
import { computed } from 'vue'
import { useLocale } from '../../composables/useLocale.js'
import { controlBaseClass } from './toolbarConfig.js'

/**
 * Issue #346 — indent was only reachable through Format ▸ Align & indent. These two buttons
 * run the same `indent`/`outdent` commands from `IndentExtension`, so the level, clamping and
 * list/code-block behaviour are identical; only the entry point is new.
 */
const props = defineProps<{
  editor?: Editor | null
  selectionTick: number
}>()

const { t } = useLocale()

/** Level of the block the caret is in; 0 when the node carries no indent attribute. */
const level = computed(() => {
  void props.selectionTick
  const attrs = props.editor?.getAttributes('paragraph') ?? {}
  return typeof attrs.indent === 'number' ? attrs.indent : 0
})

function run(command: 'indent' | 'outdent') {
  const editor = props.editor
  if (!editor) return
  editor.commands[command]()
  editor.commands.focus()
}
</script>

<template>
  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.decreaseIndent')"
    :aria-label="t('toolbar.decreaseIndent')"
    :disabled="!editor || level <= 0"
    data-testid="toolbar-indent-decrease"
    @mousedown.prevent="run('outdent')"
  >
    <IndentDecrease class="h-[18px] w-[18px]" />
  </button>
  <button
    type="button"
    :class="[controlBaseClass, 'w-8']"
    :title="t('toolbar.increaseIndent')"
    :aria-label="t('toolbar.increaseIndent')"
    :disabled="!editor || level >= INDENT_MAX_LEVEL"
    data-testid="toolbar-indent-increase"
    @mousedown.prevent="run('indent')"
  >
    <IndentIncrease class="h-[18px] w-[18px]" />
  </button>
</template>
