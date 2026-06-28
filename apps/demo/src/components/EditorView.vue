<script setup lang="ts">
import { computed, ref } from 'vue'
import { Printer } from 'lucide-vue-next'
import { DocsEditor } from '@docs-editor/vue'
import { defaultPlugins } from '@docs-editor/plugins'
import type { DocumentItem } from '../types.js'

const props = defineProps<{
  doc: DocumentItem
  room: string
}>()

const emit = defineEmits<{
  back: []
  'update:doc': [doc: DocumentItem]
}>()

const pageSize = ref('a4')

const collaborationOptions = computed(() => {
  if (!props.room.trim()) return undefined
  return {
    room: props.room.trim(),
    provider: 'webrtc' as const,
    user: { name: 'Demo User', color: '#3b82f6' },
  }
})

function handleUpdateTitle(title: string) {
  emit('update:doc', { ...props.doc, title })
}

function handleToggleStar() {
  emit('update:doc', { ...props.doc, starred: !props.doc.starred })
}

function handleUpdateContent(content: object) {
  emit('update:doc', { ...props.doc, content, updatedAt: Date.now() })
}

function handlePrint() {
  window.print()
}

function handleUpdatePageSize(size: string) {
  pageSize.value = size
}
</script>

<template>
  <DocsEditor
    :model-value="doc.content"
    :plugins="defaultPlugins"
    :editable="true"
    :collaboration="collaborationOptions"
    :title="doc.title"
    :starred="doc.starred"
    :page-size="pageSize"
    connection-state="connected"
    @back="emit('back')"
    @update:title="handleUpdateTitle"
    @toggle-star="handleToggleStar"
    @update:model-value="handleUpdateContent"
    @update:page-size="handleUpdatePageSize"
  >
    <template #header-actions>
      <button
        type="button"
        class="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        title="Print document"
        @click="handlePrint"
      >
        <Printer class="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span class="hidden sm:inline">Print</span>
      </button>
    </template>
  </DocsEditor>
</template>
