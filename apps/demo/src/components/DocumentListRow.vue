<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  FileText,
  Star,
  Edit2,
  Copy,
  Trash2,
  Check,
} from 'lucide-vue-next'
import type { DocumentItem, FolderItem } from '../types.js'
import { useLocale } from '@kedata-indonesia/docflow-vue'

const { t } = useLocale()

const props = defineProps<{
  doc: DocumentItem
  folder: FolderItem | undefined
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleStar: [id: string]
  rename: [id: string, title: string]
  duplicate: [id: string]
  delete: [id: string]
}>()

const isRenaming = ref(false)
const renameTitle = ref(props.doc.title)

watch(
  () => props.doc.title,
  (next) => {
    renameTitle.value = next
  },
)

function saveRename() {
  const trimmed = renameTitle.value.trim()
  if (trimmed && trimmed !== props.doc.title) {
    emit('rename', props.doc.id, trimmed)
  }
  isRenaming.value = false
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}
</script>

<template>
  <tr
    class="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
    @click="!isRenaming && emit('select', doc.id)"
  >
    <td class="px-5 py-4">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="text-slate-300 transition-colors hover:text-amber-500"
          @click.stop="emit('toggleStar', doc.id)"
        >
          <Star
            class="h-4 w-4"
            :class="doc.starred ? 'fill-amber-400 text-amber-500' : ''"
          />
        </button>
        <FileText class="h-4.5 w-4.5 flex-shrink-0 text-cyan-500" />
        <div v-if="isRenaming" class="flex items-center gap-1.5" @click.stop>
          <input
            v-model="renameTitle"
            type="text"
            class="rounded-lg border border-cyan-500/50 bg-slate-50 px-2 py-1 text-sm text-slate-800 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
            @keydown.enter="saveRename"
            @blur="saveRename"
          >
          <button
            type="button"
            class="rounded-lg bg-cyan-500 p-1.5 text-black hover:bg-cyan-400"
            @click.stop="saveRename"
          >
            <Check class="h-3 w-3" />
          </button>
        </div>
        <span
          v-else
          class="max-w-xs truncate font-semibold text-slate-800 transition-colors group-hover:text-cyan-600 dark:text-slate-100 dark:group-hover:text-cyan-400 md:max-w-md"
        >
          {{ doc.title }}
        </span>
      </div>
    </td>

    <td class="hidden px-5 py-4 text-xs text-slate-500 dark:text-slate-400 sm:table-cell">
      <span
        v-if="folder"
        class="inline-block max-w-[120px] truncate rounded-full border border-transparent bg-cyan-500/10 px-2.5 py-0.5 font-semibold text-cyan-800 dark:border-cyan-500/20 dark:text-cyan-400"
      >
        {{ folder.name }}
      </span>
      <span v-else class="text-slate-300 dark:text-slate-700">—</span>
    </td>

    <td class="hidden px-5 py-4 text-xs text-slate-400 md:table-cell">
      {{ formatDate(doc.updatedAt) }}
    </td>

    <td class="px-5 py-4 text-right" @click.stop>
      <div class="flex items-center justify-end gap-1">
        <button
          type="button"
          class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-200"
          :title="t('common.rename')"
          @click.stop="isRenaming = true"
        >
          <Edit2 class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-200"
          :title="t('common.duplicate')"
          @click.stop="emit('duplicate', doc.id)"
        >
          <Copy class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-red-600"
          :title="t('common.delete')"
          @click.stop="emit('delete', doc.id)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </td>
  </tr>
</template>
