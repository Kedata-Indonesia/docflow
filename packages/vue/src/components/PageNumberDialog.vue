<script setup lang="ts">
import { useLocale } from '../composables/useLocale.js'
import { useDraftModel } from '../composables/useDraftModel.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  position: 'header' | 'footer'
  showOnFirstPage: boolean
  mode: 'startAt' | 'continue'
  // A cleared number input yields the raw string (pre-extraction behaviour).
  startAt: number | string
}>()

const emit = defineEmits<{
  'update:position': [value: 'header' | 'footer']
  'update:showOnFirstPage': [value: boolean]
  'update:mode': [value: 'startAt' | 'continue']
  'update:startAt': [value: number]
  close: []
  apply: []
}>()

const position = useDraftModel(
  () => props.position,
  (value) => emit('update:position', value),
)
const showOnFirstPage = useDraftModel(
  () => props.showOnFirstPage,
  (value) => emit('update:showOnFirstPage', value),
)
const mode = useDraftModel(
  () => props.mode,
  (value) => emit('update:mode', value),
)
// The parent ref is declared `number`; the empty-string case is preserved
// through the cast, matching the pre-extraction behaviour.
const startAt = useDraftModel(
  () => props.startAt,
  (value) => emit('update:startAt', value as number),
)
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 select-none">
    <div class="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
      <h2 class="text-xl font-medium mb-6 text-slate-900 dark:text-white">{{ t('editor.headerFooter.pageNumberTitle') }}</h2>

      <!-- Posisi Section -->
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.positionSection') }}</h3>
        <div class="space-y-3">
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
            <input v-model="position" type="radio" value="header" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.positionHeader') }}</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
            <input v-model="position" type="radio" value="footer" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.positionFooter') }}</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none pt-1">
            <input v-model="showOnFirstPage" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.showOnFirstPage') }}</span>
          </label>
        </div>
      </div>

      <!-- Penomoran Section -->
      <div class="mb-8">
        <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.numberingSection') }}</h3>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
              <input v-model="mode" type="radio" value="startAt" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
              <span>{{ t('editor.headerFooter.startAt') }}</span>
            </label>
            <input v-model="startAt" type="number" min="1" class="w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:outline-none" />
          </div>
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
            <input v-model="mode" type="radio" value="continue" class="w-4 h-4 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.continueFromPrevious') }}</span>
          </label>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end items-center gap-3">
        <button type="button" class="rounded-full px-5 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors" @click="emit('close')">
          {{ t('editor.headerFooter.cancel') }}
        </button>
        <button type="button" class="rounded-full bg-blue-600 hover:bg-blue-700 px-6 py-2 text-xs font-semibold text-white shadow-md transition-colors" @click="emit('apply')">
          {{ t('editor.headerFooter.apply') }}
        </button>
      </div>
    </div>
  </div>
</template>
