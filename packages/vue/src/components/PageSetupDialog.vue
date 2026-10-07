<script setup lang="ts">
import { PAGE_SIZES } from '@kedata-indonesia/docflow-layout-engine'
import { useLocale } from '../composables/useLocale.js'
import { useDraftModel } from '../composables/useDraftModel.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  paperSize: string
  orientation: 'portrait' | 'landscape'
  // Vue's `.number` modifier keeps the raw string when a number field is
  // cleared, exactly as the pre-extraction draft refs did.
  marginTop: number | string
  marginBottom: number | string
  marginLeft: number | string
  marginRight: number | string
  marginMin: number
  marginMax: number
}>()

const emit = defineEmits<{
  'update:paperSize': [value: string]
  'update:orientation': [value: 'portrait' | 'landscape']
  'update:marginTop': [value: number]
  'update:marginBottom': [value: number]
  'update:marginLeft': [value: number]
  'update:marginRight': [value: number]
  close: []
  apply: []
}>()

const paperSize = useDraftModel(
  () => props.paperSize,
  (value) => emit('update:paperSize', value),
)
const orientation = useDraftModel(
  () => props.orientation,
  (value) => emit('update:orientation', value),
)
// The parent refs are declared `number`; the empty-string case is preserved
// through the cast, matching the pre-extraction `v-model.number` behaviour.
const marginTop = useDraftModel(
  () => props.marginTop,
  (value) => emit('update:marginTop', value as number),
)
const marginBottom = useDraftModel(
  () => props.marginBottom,
  (value) => emit('update:marginBottom', value as number),
)
const marginLeft = useDraftModel(
  () => props.marginLeft,
  (value) => emit('update:marginLeft', value as number),
)
const marginRight = useDraftModel(
  () => props.marginRight,
  (value) => emit('update:marginRight', value as number),
)
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
    <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
      <h2 class="text-lg font-bold mb-4">{{ t('editor.pageSetup.title') }}</h2>

      <!-- Paper size -->
      <div class="mb-4">
        <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.paperSize') }}</label>
        <select v-model="paperSize" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs focus:outline-none dark:border-slate-700">
          <option v-for="size in PAGE_SIZES" :key="size.id" :value="size.id">{{ size.name }}</option>
        </select>
      </div>

      <!-- Orientation -->
      <div class="mb-4">
        <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.orientation') }}</label>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
            :class="orientation === 'portrait' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5'"
            @click="orientation = 'portrait'"
          >
            {{ t('editor.pageSetup.portrait') }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors"
            :class="orientation === 'landscape' ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/5'"
            @click="orientation = 'landscape'"
          >
            {{ t('editor.pageSetup.landscape') }}
          </button>
        </div>
      </div>

      <!-- Margins -->
      <div class="mb-6">
        <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{{ t('editor.pageSetup.margins') }} (cm)</label>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.top') }}</label>
            <input v-model.number="marginTop" type="number" :min="marginMin" :max="marginMax" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
          </div>
          <div>
            <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.bottom') }}</label>
            <input v-model.number="marginBottom" type="number" :min="marginMin" :max="marginMax" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
          </div>
          <div>
            <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.left') }}</label>
            <input v-model.number="marginLeft" type="number" :min="marginMin" :max="marginMax" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
          </div>
          <div>
            <label class="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">{{ t('editor.pageSetup.right') }}</label>
            <input v-model.number="marginRight" type="number" :min="marginMin" :max="marginMax" step="0.1" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700">
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5" @click="emit('close')">
          {{ t('editor.pageSetup.cancel') }}
        </button>
        <button type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" @click="emit('apply')">
          {{ t('editor.pageSetup.apply') }}
        </button>
      </div>
    </div>
  </div>
</template>
