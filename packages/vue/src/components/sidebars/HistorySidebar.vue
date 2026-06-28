<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  History,
  Calendar,
  RotateCcw,
  Save,
  User,
  Eye,
  ShieldAlert,
} from 'lucide-vue-next'
import type { DocumentSnapshot } from '../../types.js'

const props = defineProps<{
  snapshots?: DocumentSnapshot[]
  activePreviewIndex?: number | null
}>()

const emit = defineEmits<{
  'save-snapshot': [name: string]
  'restore-snapshot': [versionIndex: number]
  'preview-snapshot': [snapshot: DocumentSnapshot | null]
}>()

const newSnapshotName = ref('')
const isSaving = ref(false)

function handleSave() {
  if (!newSnapshotName.value.trim()) return
  emit('save-snapshot', newSnapshotName.value.trim())
  newSnapshotName.value = ''
  isSaving.value = false
}

const snapshots = computed(() => props.snapshots ?? [])
</script>

<template>
  <div class="history-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <div class="border-b border-slate-200 p-4 dark:border-white/5">
      <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        <History class="h-4 w-4 text-cyan-400" /> Revision History
      </h3>
      <p class="mt-1.5 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        Inspect, preview, and restore any previous snapshot saved in the workspace.
      </p>
    </div>

    <div class="flex-1 space-y-3 overflow-y-auto p-4">
      <div
        v-if="activePreviewIndex !== null"
        class="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs animate-fadeIn dark:border-amber-500/20"
      >
        <div class="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <ShieldAlert class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <div>
            <p class="font-bold">Viewing Revision Preview</p>
            <p class="mt-0.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-500">
              You are previewing version #{{ activePreviewIndex }}. Your editor is temporarily read-only.
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-700 dark:text-slate-400"
            @click="emit('preview-snapshot', null)"
          >
            Close Preview
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1 text-[10px] font-bold text-black shadow-cyan transition-all hover:bg-cyan-400"
            @click="() => { emit('restore-snapshot', activePreviewIndex!); emit('preview-snapshot', null) }"
          >
            <RotateCcw class="h-3 w-3" /> Restore This
          </button>
        </div>
      </div>

      <div class="space-y-2.5">
        <div
          v-for="snapshot in snapshots"
          :key="snapshot.versionIndex"
          class="space-y-2.5 rounded-2xl border p-4 transition-all"
          :class="activePreviewIndex === snapshot.versionIndex
            ? 'border-cyan-500/40 bg-cyan-500/5 shadow-cyan dark:border-cyan-500/30'
            : 'border-slate-200/60 bg-slate-50/60 hover:border-cyan-500/30 dark:border-white/5 dark:bg-[#02040a]/40 dark:hover:border-white/10'"
        >
          <div>
            <div class="mb-1 flex items-center justify-between">
              <span class="rounded-md bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-500 dark:bg-cyan-500/10 dark:text-cyan-400">
                REV #{{ snapshot.versionIndex }}
              </span>
              <span class="flex items-center gap-0.5 font-mono text-[9px] text-slate-400 dark:text-slate-500">
                <Calendar class="h-2.5 w-2.5" />
                {{ new Date(snapshot.timestamp).toLocaleDateString() }}
                {{ new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </div>
            <h4 class="text-xs font-bold leading-snug text-slate-800 dark:text-slate-200">{{ snapshot.title }}</h4>
          </div>

          <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
            <User class="h-3.5 w-3.5" />
            <span>
              Modified by:
              <strong class="font-semibold text-slate-600 dark:text-slate-300">{{ snapshot.modifiedBy }}</strong>
            </span>
          </div>

          <div class="flex justify-end gap-2 border-t border-slate-200/50 pt-2 dark:border-white/5">
            <button
              v-if="activePreviewIndex !== snapshot.versionIndex"
              type="button"
              class="flex items-center gap-1 text-[10px] font-bold text-slate-500 transition-colors hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
              @click="emit('preview-snapshot', snapshot)"
            >
              <Eye class="h-3 w-3" /> Preview
            </button>
            <button
              type="button"
              class="flex items-center gap-1 text-[10px] font-bold text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
              @click="emit('restore-snapshot', snapshot.versionIndex)"
            >
              <RotateCcw class="h-3 w-3" /> Restore
            </button>
          </div>
        </div>

        <p v-if="snapshots.length === 0" class="py-6 text-center text-xs text-slate-400 dark:text-slate-500">No snapshots saved yet.</p>
      </div>
    </div>

    <div class="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#0a0f1e]/85">
      <form v-if="isSaving" class="space-y-2 animate-fadeIn" @submit.prevent="handleSave">
        <input
          v-model="newSnapshotName"
          type="text"
          required
          placeholder="e.g. Approved Final Draft..."
          class="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
        >
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-[10px] text-slate-500 hover:bg-white/5 dark:text-slate-400"
            @click="isSaving = false"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-black shadow-cyan hover:bg-cyan-400"
          >
            Save
          </button>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-bold text-slate-500 transition-all hover:border-cyan-500 hover:bg-cyan-500/5 hover:text-cyan-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
        @click="isSaving = true"
      >
        <Save class="h-3.5 w-3.5 animate-pulse" /> Save Named Snapshot
      </button>
    </div>
  </div>
</template>
