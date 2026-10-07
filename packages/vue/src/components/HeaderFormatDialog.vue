<script setup lang="ts">
import { useLocale } from '../composables/useLocale.js'
import { useDraftModel } from '../composables/useDraftModel.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  // Vue's `.number` modifier keeps the raw string when a number field is
  // cleared, exactly as the pre-extraction draft refs did.
  headerMarginCm: number | string
  footerMarginCm: number | string
  differentFirstPage: boolean
  differentOddEven: boolean
  marginMin: number
  marginMax: number
  marginStep: number
}>()

const emit = defineEmits<{
  'update:headerMarginCm': [value: number]
  'update:footerMarginCm': [value: number]
  'update:differentFirstPage': [value: boolean]
  'update:differentOddEven': [value: boolean]
  close: []
  apply: []
}>()

// The parent refs are declared `number`; the empty-string case is preserved
// through the cast, matching the pre-extraction `v-model.number` behaviour.
const headerMarginCm = useDraftModel(
  () => props.headerMarginCm,
  (value) => emit('update:headerMarginCm', value as number),
)
const footerMarginCm = useDraftModel(
  () => props.footerMarginCm,
  (value) => emit('update:footerMarginCm', value as number),
)
const differentFirstPage = useDraftModel(
  () => props.differentFirstPage,
  (value) => emit('update:differentFirstPage', value),
)
const differentOddEven = useDraftModel(
  () => props.differentOddEven,
  (value) => emit('update:differentOddEven', value),
)
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 select-none">
    <div class="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-7 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
      <h2 class="text-xl font-medium mb-6 text-slate-900 dark:text-white">{{ t('editor.headerFooter.headerFooterFormatTitle') }}</h2>

      <!-- Margin Section -->
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.marginSection') }}</h3>
        <div class="space-y-4">
          <div>
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
              {{ t('editor.headerFooter.headerTopMargin') }} (cm)
            </label>
            <input v-model.number="headerMarginCm" type="number" :min="marginMin" :max="marginMax" :step="marginStep" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
              {{ t('editor.headerFooter.footerBottomMargin') }} (cm)
            </label>
            <input v-model.number="footerMarginCm" type="number" :min="marginMin" :max="marginMax" :step="marginStep" class="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a2332] px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all" />
          </div>
        </div>
      </div>

      <!-- Tata Letak Section -->
      <div class="mb-8">
        <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">{{ t('editor.headerFooter.layoutSection') }}</h3>
        <div class="space-y-3">
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
            <input v-model="differentFirstPage" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.differentFirstPage') }}</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
            <input v-model="differentOddEven" type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>{{ t('editor.headerFooter.differentOddEven') }}</span>
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
