<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  FileText,
  Star,
  MoreVertical,
  Edit2,
  Copy,
  Move,
  Trash2,
  Clock,
  Folder,
  Check,
} from 'lucide-vue-next'
import type { DocumentItem, FolderItem } from '../types.js'
import { useLocale } from '@kedata-indonesia/docflow-vue'

const { t } = useLocale()

const props = defineProps<{
  doc: DocumentItem
  folders: FolderItem[]
  folder: FolderItem | undefined
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleStar: [id: string]
  rename: [id: string, title: string]
  duplicate: [id: string]
  delete: [id: string]
  move: [id: string, folderId: string | null]
}>()

const isMenuOpen = ref(false)
const isRenaming = ref(false)
const renameTitle = ref(props.doc.title)
const isMoving = ref(false)

watch(
  () => props.doc.title,
  (next) => {
    renameTitle.value = next
  },
)

function startRename() {
  isRenaming.value = true
  renameTitle.value = props.doc.title
  isMenuOpen.value = false
}

function saveRename() {
  const trimmed = renameTitle.value.trim()
  if (trimmed && trimmed !== props.doc.title) {
    emit('rename', props.doc.id, trimmed)
  }
  isRenaming.value = false
}

function handleMove(folderId: string | null) {
  emit('move', props.doc.id, folderId)
  isMoving.value = false
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString()
}

function getSnippet(content: object) {
  try {
    const text = JSON.stringify(content)
    return text.replace(/[{}[\]"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  } catch {
    return ''
  }
}
</script>

<template>
  <div
    class="group relative flex h-[210px] flex-col justify-between rounded-2xl border border-slate-200/60 bg-white/80 p-5 backdrop-blur-md transition-all duration-300 hover:border-cyan-500/40 hover:bg-white hover:shadow-cyan dark:border-white/5 dark:bg-[#0a0f1e]/40 dark:hover:bg-[#0a0f1e]/80 dark:hover:shadow-cyan cursor-pointer"
    @click="!isRenaming && emit('select', doc.id)"
  >
    <div>
      <div class="mb-2.5 flex items-start justify-between">
        <div class="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-600 dark:text-cyan-400">
          <FileText class="h-5 w-5" />
        </div>

        <div class="flex items-center gap-1.5 opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100">
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-amber-500"
            @click.stop="emit('toggleStar', doc.id)"
          >
            <Star
              class="h-4 w-4"
              :class="doc.starred ? 'fill-amber-400 text-amber-500' : ''"
            />
          </button>

          <div class="relative">
            <button
              type="button"
              class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-200"
              @click.stop="isMenuOpen = !isMenuOpen"
            >
              <MoreVertical class="h-4 w-4" />
            </button>

            <div
              v-if="isMenuOpen"
              class="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1.5 text-sm text-slate-700 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#111625] dark:text-slate-200"
              @click.stop
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5"
                @click.stop="startRename"
              >
                <Edit2 class="h-3.5 w-3.5" /> {{ t('common.rename') }}
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5"
                @click.stop="emit('duplicate', doc.id); isMenuOpen = false"
              >
                <Copy class="h-3.5 w-3.5" /> {{ t('common.duplicate') }}
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5"
                @click.stop="isMoving = true; isMenuOpen = false"
              >
                <Move class="h-3.5 w-3.5" /> {{ t('common.moveToFolder') }}
              </button>
              <div class="my-1 border-t border-slate-100 dark:border-white/5" />
              <button
                type="button"
                class="flex w-full items-center gap-2 px-4 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                @click.stop="emit('delete', doc.id); isMenuOpen = false"
              >
                <Trash2 class="h-3.5 w-3.5" /> {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isRenaming" class="mt-2 flex items-center gap-1.5" @click.stop>
        <input
          v-model="renameTitle"
          type="text"
          class="flex-1 rounded-lg border border-cyan-500/50 bg-slate-50 px-2.5 py-1 text-sm text-slate-800 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
          @keydown.enter="saveRename"
          @blur="saveRename"
        >
        <button
          type="button"
          class="rounded-lg bg-cyan-500 p-1.5 text-black hover:bg-cyan-400"
          @click.stop="saveRename"
        >
          <Check class="h-3.5 w-3.5" />
        </button>
      </div>
      <h3
        v-else
        class="mt-2 line-clamp-2 leading-tight font-semibold text-slate-800 transition-colors group-hover:text-cyan-600 dark:text-slate-100 dark:group-hover:text-cyan-400"
      >
        {{ doc.title }}
      </h3>

      <p class="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        {{ getSnippet(doc.content) || t('common.emptyDocument') }}
      </p>
    </div>

    <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-white/5 dark:text-slate-500">
      <div class="flex items-center gap-1">
        <Clock class="h-3.5 w-3.5 text-slate-400" />
        <span>{{ formatDate(doc.updatedAt) }}</span>
      </div>
      <span
        v-if="folder"
        class="max-w-[100px] truncate rounded border border-transparent bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-800 dark:border-cyan-500/20 dark:text-cyan-400"
      >
        {{ folder.name }}
      </span>
    </div>

    <div
      v-if="isMoving"
      class="absolute inset-0 z-10 flex flex-col justify-between rounded-2xl bg-white/95 p-4 backdrop-blur-md dark:bg-[#0a0f1e]/95"
      @click.stop
    >
      <div>
        <h4 class="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {{ t('common.moveDocument') }}
        </h4>
        <div class="max-h-[100px] space-y-1 overflow-y-auto">
          <button
            type="button"
            class="w-full rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            @click.stop="handleMove(null)"
          >
            {{ t('common.noFolder') }}
          </button>
          <button
            v-for="f in folders"
            :key="f.id"
            type="button"
            class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            @click.stop="handleMove(f.id)"
          >
            <Folder class="h-3.5 w-3.5 text-slate-400" /> {{ f.name }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="rounded-lg border border-slate-200 py-1 text-center text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-600 dark:border-white/10 dark:hover:text-white"
        @click.stop="isMoving = false"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </div>
</template>
