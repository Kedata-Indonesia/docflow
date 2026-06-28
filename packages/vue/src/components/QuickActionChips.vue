<script setup lang="ts">
import { FileText, Mail, MoreHorizontal } from 'lucide-vue-next'

defineProps<{
  visible?: boolean
}>()

const emit = defineEmits<{
  'meeting-notes': []
  'email-draft': []
  more: []
}>()

const chips = [
  { key: 'meeting-notes', label: 'Meeting notes', icon: FileText },
  { key: 'email-draft', label: 'Email draft', icon: Mail },
  { key: 'more', label: 'More', icon: MoreHorizontal },
] as const
</script>

<template>
  <div
    v-if="visible"
    class="docs-editor-quick-actions z-20 flex flex-wrap items-center justify-center gap-2 py-4"
  >
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-[#0a0f1e] dark:text-slate-300 dark:hover:bg-slate-800"
      @click="emit(chip.key as any)"
    >
      <component :is="chip.icon" class="h-3.5 w-3.5" />
      <span>{{ chip.label }}</span>
    </button>
  </div>
</template>
