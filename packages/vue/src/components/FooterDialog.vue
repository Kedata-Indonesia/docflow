<script setup lang="ts">
import { useLocale } from '../composables/useLocale.js'
import { useDraftModel } from '../composables/useDraftModel.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  left: string
  right: string
}>()

const emit = defineEmits<{
  'update:left': [value: string]
  'update:right': [value: string]
  clear: []
  close: []
  save: []
}>()

const left = useDraftModel(
  () => props.left,
  (value) => emit('update:left', value),
)
const right = useDraftModel(
  () => props.right,
  (value) => emit('update:right', value),
)
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
    <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
      <h2 class="text-lg font-bold mb-4">{{ t('editor.headerFooter.footer') }}</h2>

      <!-- Footer Section -->
      <div class="mb-6">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">{{ t('editor.headerFooter.footer') }}</h3>
          <button type="button" class="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors" @click="emit('clear')">{{ t('editor.headerFooter.clear') }}</button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] font-medium block mb-1">{{ t('editor.headerFooter.left') }}</label>
            <input v-model="left" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" :placeholder="t('editor.headerFooter.footerLeftPlaceholder')">
          </div>
          <div>
            <label class="text-[11px] font-medium block mb-1">{{ t('editor.headerFooter.right') }}</label>
            <input v-model="right" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" :placeholder="t('editor.headerFooter.footerRightPlaceholder')">
          </div>
        </div>
      </div>

      <!-- Variables Info -->
      <div class="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400 mb-6">
        {{ t('editor.headerFooter.variableInfo') }}
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5" @click="emit('close')">
          {{ t('editor.headerFooter.cancel') }}
        </button>
        <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" @click="emit('save')">
          {{ t('editor.headerFooter.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
