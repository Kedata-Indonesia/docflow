<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null
}>()

const sizes = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px']

const currentSize = computed(() => {
  if (!props.editor) return '16px'
  const attrs = props.editor.getAttributes('textStyle')
  return attrs.fontSize || '16px'
})

function setSize(size: string, e: Event) {
  e.preventDefault()
  if (!props.editor) return
  if (size === '16px') {
    props.editor.chain().focus().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
  } else {
    props.editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
  }
}
</script>

<template>
  <select
    v-if="editor"
    class="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none transition focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    :value="currentSize"
    @change="setSize(($event.target as HTMLSelectElement).value, $event)"
  >
    <option v-for="s in sizes" :key="s" :value="s">{{ s }}</option>
  </select>
</template>
